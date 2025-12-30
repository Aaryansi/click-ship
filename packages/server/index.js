// click-ship/packages/server/index.js

// 0) load ENV vars from .env
require('dotenv').config();
console.log('→ Using OpenAI with JSX awareness');
console.log('→ Model:', process.env.AI_MODEL || 'gpt-3.5-turbo');

// Dependencies
const path      = require('path');
const Fastify   = require('fastify');
const cors      = require('@fastify/cors');
const fastGlob  = require('fast-glob');
const fs        = require('fs/promises');
const simpleGit = require('simple-git');
const fetch     = require('node-fetch');
const { Octokit } = require('@octokit/rest');

// your hostname→repo mapping
const repos     = require('./repos.json');

const server = Fastify({ logger: true });
server.register(cors, { origin: true });

// OpenAI function
async function callOpenAI(prompt) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set in .env file');
  }
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a React/JSX code assistant. When modifying code:
1. ONLY modify the specific line requested
2. Preserve all JSX tags, making sure opening and closing tags match
3. If adding className, ensure proper JSX syntax
4. Return ONLY the modified line, no explanations
5. Be very careful not to break JSX structure`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 150
    })
  });
  
  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.error?.message || 'OpenAI API error');
  }
  
  return result.choices[0].message.content.trim();
}

// GitHub OAuth endpoint - exchange code for token
server.post('/auth/github', async (request, reply) => {
  const { code, redirectUri } = request.body;

  if (!code) {
    return reply.code(400).send({ error: 'Authorization code is required' });
  }

  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    return reply.code(500).send({ error: 'GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env' });
  }

  try {
    server.log.info('Exchanging GitHub OAuth code for token...');

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri
      })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }

    const accessToken = tokenData.access_token;

    // Get user info using the access token
    const octokit = new Octokit({ auth: accessToken });
    const { data: user } = await octokit.rest.users.getAuthenticated();

    server.log.info(`✅ User authenticated: ${user.login}`);

    return reply.send({
      token: accessToken,
      user: {
        login: user.login,
        name: user.name,
        email: user.email,
        avatar_url: user.avatar_url
      }
    });

  } catch (error) {
    server.log.error('GitHub OAuth error:', error);
    return reply.code(500).send({ error: error.message });
  }
});

// Authorization check function
async function checkUserPermission(githubToken, hostname) {
  if (!githubToken) {
    return { authorized: false, reason: 'No GitHub token provided' };
  }

  try {
    const octokit = new Octokit({ auth: githubToken });

    // Get authenticated user info
    const { data: user } = await octokit.rest.users.getAuthenticated();
    server.log.info(`Checking permissions for user: ${user.login}`);

    // Get repo config for this hostname
    const repoConfig = repos[hostname];
    if (!repoConfig) {
      return { authorized: false, reason: `No repository configured for ${hostname}` };
    }

    // If repo config is just a string (old format), allow for now but warn
    if (typeof repoConfig === 'string') {
      server.log.warn('Using old repos.json format. Please update to new format with github details.');
      // For backward compatibility, allow if ALLOWED_USERS is set
      const allowedUsers = process.env.ALLOWED_USERS?.split(',').map(u => u.trim()) || [];
      if (allowedUsers.length > 0 && allowedUsers.includes(user.login)) {
        return { authorized: true, user };
      }
      // Otherwise allow all (temporary, should update config)
      return { authorized: true, user };
    }

    // Check if user is in allowed users list
    if (repoConfig.allowedUsers && Array.isArray(repoConfig.allowedUsers)) {
      if (repoConfig.allowedUsers.includes(user.login)) {
        server.log.info(`✅ User ${user.login} is in allowedUsers list`);
        return { authorized: true, user };
      }
    }

    // Check if user has write access to the GitHub repo
    if (repoConfig.github && repoConfig.github.owner && repoConfig.github.repo) {
      try {
        const { data: permission } = await octokit.rest.repos.getCollaboratorPermissionLevel({
          owner: repoConfig.github.owner,
          repo: repoConfig.github.repo,
          username: user.login
        });

        server.log.info(`User ${user.login} has ${permission.permission} permission on ${repoConfig.github.owner}/${repoConfig.github.repo}`);

        // Allow if user has write, admin, or maintain permission
        if (['write', 'admin', 'maintain'].includes(permission.permission)) {
          return { authorized: true, user };
        }
      } catch (error) {
        server.log.warn(`Could not check repo permissions: ${error.message}`);
      }
    }

    // Check environment variable ALLOWED_USERS as fallback
    const allowedUsers = process.env.ALLOWED_USERS?.split(',').map(u => u.trim()) || [];
    if (allowedUsers.includes(user.login)) {
      server.log.info(`✅ User ${user.login} is in ALLOWED_USERS env var`);
      return { authorized: true, user };
    }

    return { authorized: false, reason: `User ${user.login} does not have permission to edit this repository` };

  } catch (error) {
    server.log.error('Authorization check failed:', error);
    return { authorized: false, reason: `Authorization check failed: ${error.message}` };
  }
}

server.post('/edit', async (request, reply) => {
  const { hostname, selector, desiredChange, githubToken } = request.body;
  server.log.info('▶️  Payload received', { hostname, selector, desiredChange });

  // 1) Authorization check
  const authResult = await checkUserPermission(githubToken, hostname);
  if (!authResult.authorized) {
    server.log.warn(`❌ Authorization failed: ${authResult.reason}`);
    return reply.code(403).send({ error: authResult.reason });
  }

  const authenticatedUser = authResult.user;
  server.log.info(`✅ User ${authenticatedUser.login} authorized`);

  // 2) lookup repo path and config
  const repoConfig = repos[hostname];
  if (!repoConfig) {
    return reply.code(400).send({ error: `no repo configured for ${hostname}` });
  }

  // Handle both old (string) and new (object) repo config formats
  const repoRoot = typeof repoConfig === 'string' ? repoConfig : repoConfig.path;
  const githubInfo = typeof repoConfig === 'object' ? repoConfig.github : null;

  // 2) extract the first .class or #id token
  const m = selector.match(/([#.][\w-]+)/);
  if (!m) {
    return reply.code(400).send({ error: 'no class or id in selector' });
  }
  const token = m[1].slice(1);

  // 3) find source files
  const patterns = ['src/**/*.tsx','src/**/*.jsx','src/**/*.js', 'src/**/*.html', 'src/**/*.css'];
  const files = await fastGlob(patterns, { cwd: repoRoot, absolute: true });

  // 4) find file with token
  let matchFile = null;
  let fullContent = '';
  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      if (content.includes(token)) {
        matchFile = file;
        fullContent = content;
        break;
      }
    } catch (e) {
      server.log.warn(`Could not read file ${file}: ${e.message}`);
    }
  }

  if (!matchFile) {
    server.log.warn(`❗ no file matched token "${token}"`);
    return reply.send({ ok: true, hostname, selector, token, file: null });
  }

  server.log.info('✅ matched token in file', { file: matchFile });
  
  const lines = fullContent.split('\n');
  const tokenLineIndex = lines.findIndex(line => line.includes(token));
  
  if (tokenLineIndex === -1) {
    return reply.send({ ok: false, error: 'Could not find token in file' });
  }

  // Get more context for JSX understanding
  const startLine = Math.max(0, tokenLineIndex - 10);
  const endLine = Math.min(lines.length, tokenLineIndex + 10);
  const contextLines = lines.slice(startLine, endLine);
  const relativeIndex = tokenLineIndex - startLine;

  try {
    server.log.info('🤖 Calling OpenAI with JSX context...');
    
    // Extract the original line
    const originalLine = lines[tokenLineIndex];
    
    // Create JSX-aware prompt
    const prompt = `You need to modify a specific line in a React component while preserving JSX structure.

Context code:
${contextLines.join('\n')}

The specific line to modify is:
${originalLine}

This line contains the class/id "${token}".

The user wants to: "${desiredChange}"

IMPORTANT: 
- Only modify the line containing "${token}"
- Keep all JSX tags properly structured
- If the line has opening tags, preserve them
- If adding className to existing className, append to it
- Return ONLY the modified line

Modified line:`;

    // Call OpenAI
    const generatedText = await callOpenAI(prompt);
    server.log.info('OpenAI response:', generatedText);
    
    // Extract just the line we need
    let modifiedLine = generatedText
      .replace(/```[a-z]*\n?/g, '')
      .replace(/\n?```/g, '')
      .trim();
    
    // Validate that the modified line still contains our token
    if (!modifiedLine.includes(token)) {
      throw new Error('Modified line lost the original token');
    }

    // Update file
    const updatedLines = [...lines];
    updatedLines[tokenLineIndex] = modifiedLine;
    const updatedContent = updatedLines.join('\n');
    
    // Write file
    await fs.writeFile(matchFile, updatedContent, 'utf8');

    // Create PR workflow
    const git = simpleGit(repoRoot);
    const relativePath = path.relative(repoRoot, matchFile);

    // Create a new branch for this change
    const timestamp = Date.now();
    const branchName = `click-ship/${timestamp}-${desiredChange.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '-')}`;

    server.log.info(`Creating branch: ${branchName}`);
    await git.checkoutLocalBranch(branchName);

    // Stage and commit the change
    await git.add(relativePath);
    await git.commit(`UI: ${desiredChange}\n\n✨ Created via Click-Ship by @${authenticatedUser.login}\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`);

    server.log.info('✅ Successfully applied modification');

    // If GitHub info is available, create a PR
    let prUrl = null;
    let prNumber = null;

    if (githubInfo && githubInfo.owner && githubInfo.repo) {
      try {
        server.log.info(`Creating PR on ${githubInfo.owner}/${githubInfo.repo}...`);

        // Push the branch
        await git.push('origin', branchName, ['--set-upstream']);

        // Create PR using GitHub API
        const octokit = new Octokit({ auth: githubToken });
        const { data: pr } = await octokit.rest.pulls.create({
          owner: githubInfo.owner,
          repo: githubInfo.repo,
          title: `UI Update: ${desiredChange}`,
          head: branchName,
          base: githubInfo.baseBranch || 'main',
          body: `## Changes
${desiredChange}

## Modified Files
- \`${relativePath}\`

## Code Changes
\`\`\`diff
- ${originalLine}
+ ${modifiedLine}
\`\`\`

---
✨ Created with [Click-Ship](https://github.com/yourname/click-ship) by @${authenticatedUser.login}
AI-powered code modification using OpenAI GPT-3.5-turbo
          `
        });

        prUrl = pr.html_url;
        prNumber = pr.number;
        server.log.info(`✅ PR created: ${prUrl}`);

      } catch (error) {
        server.log.error('Failed to create PR:', error.message);
        // Continue even if PR creation fails - the branch is still pushed
      }
    } else {
      server.log.warn('No GitHub info configured, skipping PR creation. Changes committed to branch.');
      // Still push the branch
      try {
        await git.push('origin', branchName, ['--set-upstream']);
        server.log.info(`Branch ${branchName} pushed to origin`);
      } catch (error) {
        server.log.error('Failed to push branch:', error.message);
      }
    }

    return reply.send({
      ok: true,
      file: matchFile,
      change: desiredChange,
      ai: true,
      modifiedLine: modifiedLine,
      branch: branchName,
      prUrl,
      prNumber
    });
    
  } catch (error) {
    server.log.error('❗ AI failed:', error.message);

    // Safer fallback for JSX files
    const updatedLines = [...lines];
    let modifiedLine = lines[tokenLineIndex];
    let changeApplied = false;

    // Handle text changes: "text -> new text"
    if (desiredChange.includes('->')) {
      const [, newText] = desiredChange.split('->').map(s => s.trim());
      server.log.info(`Fallback: Attempting text change to "${newText}"`);
      server.log.info(`Fallback: Token line (${tokenLineIndex}): ${lines[tokenLineIndex]}`);

      if (newText) {
        // First try: text on same line as tag
        modifiedLine = modifiedLine.replace(/>([^<]+)</, (match, oldText) => {
          return `>${newText}<`;
        });
        if (modifiedLine !== lines[tokenLineIndex]) {
          server.log.info('Fallback: Found text on same line');
          changeApplied = true;
        }

        // Second try: text is on the next line (common JSX pattern)
        if (!changeApplied && tokenLineIndex + 1 < lines.length) {
          const nextLine = lines[tokenLineIndex + 1];
          server.log.info(`Fallback: Checking next line: "${nextLine}"`);
          // Check if next line is just text content (whitespace + text)
          if (nextLine.trim() && !nextLine.trim().startsWith('<') && !nextLine.trim().startsWith('{')) {
            const indent = nextLine.match(/^(\s*)/)[1]; // preserve indentation
            updatedLines[tokenLineIndex + 1] = indent + newText;
            server.log.info('Fallback: Found text on next line, applying change');
            changeApplied = true;
          }
        }
      }
    }
    // Handle inline CSS changes: "property: value"
    else if (desiredChange.includes(':') && !desiredChange.includes('->')) {
      const [prop, val] = desiredChange.split(':').map(s => s.trim());
      server.log.info(`Fallback: Attempting CSS change ${prop}: ${val}`);

      // Try to add/modify style attribute
      if (modifiedLine.includes('style={{')) {
        // Already has style object - add to it
        modifiedLine = modifiedLine.replace(/style=\{\{([^}]*)\}\}/, (match, styles) => {
          const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          return `style={{${styles}, ${camelProp}: '${val}'}}`;
        });
        if (modifiedLine !== lines[tokenLineIndex]) changeApplied = true;
      } else if (modifiedLine.includes('style="')) {
        // Has inline style string - add to it
        modifiedLine = modifiedLine.replace(/style="([^"]*)"/, (match, styles) => {
          return `style="${styles}; ${prop}: ${val}"`;
        });
        if (modifiedLine !== lines[tokenLineIndex]) changeApplied = true;
      } else if (modifiedLine.includes('className=')) {
        // No style - add style attribute after className
        const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        modifiedLine = modifiedLine.replace(/(className="[^"]*")/, `$1 style={{${camelProp}: '${val}'}}`);
        if (modifiedLine !== lines[tokenLineIndex]) changeApplied = true;
      } else if (modifiedLine.includes('<')) {
        // Has a tag but no className - add style before >
        const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        modifiedLine = modifiedLine.replace(/>/, ` style={{${camelProp}: '${val}'}}>`);
        if (modifiedLine !== lines[tokenLineIndex]) changeApplied = true;
      }
    }
    // More careful JSX-aware CSS modifications
    else if (desiredChange.toLowerCase().includes('bigger') || desiredChange.toLowerCase().includes('larger')) {
      // Only modify className attribute, not the whole line
      modifiedLine = modifiedLine.replace(/className="([^"]*)"/, (match, classes) => {
        return `className="${classes} text-2xl font-bold"`;
      });
      if (modifiedLine !== lines[tokenLineIndex]) changeApplied = true;
    } else if (desiredChange.toLowerCase().includes('red')) {
      modifiedLine = modifiedLine.replace(/className="([^"]*)"/, (match, classes) => {
        return `className="${classes} text-red-500"`;
      });
      if (modifiedLine !== lines[tokenLineIndex]) changeApplied = true;
    }

    // If no change was applied, return error
    if (!changeApplied) {
      return reply.send({
        ok: false,
        error: 'Could not safely modify JSX structure. Try simpler changes like "text -> new text" or CSS properties.',
        fallback: true
      });
    }
    
    updatedLines[tokenLineIndex] = modifiedLine;
    const updatedContent = updatedLines.join('\n');

    await fs.writeFile(matchFile, updatedContent, 'utf8');

    server.log.info('📝 File written successfully');

    // Create PR workflow for fallback
    const git = simpleGit(repoRoot);
    const relativePath = path.relative(repoRoot, matchFile);

    // Create a new branch for this change
    const timestamp = Date.now();
    const branchName = `click-ship/fallback-${timestamp}-${desiredChange.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '-')}`;

    server.log.info(`Creating fallback branch: ${branchName}`);
    await git.checkoutLocalBranch(branchName);

    // Stage and commit the change
    await git.add(relativePath);
    await git.commit(`UI (Fallback): ${desiredChange}\n\n✨ Created via Click-Ship by @${authenticatedUser.login}\n⚠️ Used fallback modification (AI unavailable)\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`);

    // If GitHub info is available, create a PR
    let prUrl = null;
    let prNumber = null;

    if (githubInfo && githubInfo.owner && githubInfo.repo) {
      try {
        server.log.info(`Creating PR on ${githubInfo.owner}/${githubInfo.repo}...`);

        // Push the branch
        await git.push('origin', branchName, ['--set-upstream']);

        // Create PR using GitHub API
        const octokit = new Octokit({ auth: githubToken });
        const { data: pr } = await octokit.rest.pulls.create({
          owner: githubInfo.owner,
          repo: githubInfo.repo,
          title: `UI Update (Fallback): ${desiredChange}`,
          head: branchName,
          base: githubInfo.baseBranch || 'main',
          body: `## Changes
${desiredChange}

⚠️ **Note**: This change was made using fallback CSS modification (AI was unavailable)

## Modified Files
- \`${relativePath}\`

---
✨ Created with [Click-Ship](https://github.com/yourname/click-ship) by @${authenticatedUser.login}
          `
        });

        prUrl = pr.html_url;
        prNumber = pr.number;
        server.log.info(`✅ PR created: ${prUrl}`);

      } catch (error) {
        server.log.error('Failed to create PR:', error.message);
      }
    } else {
      // Still push the branch
      try {
        await git.push('origin', branchName, ['--set-upstream']);
        server.log.info(`Branch ${branchName} pushed to origin`);
      } catch (error) {
        server.log.error('Failed to push branch:', error.message);
      }
    }

    return reply.send({
      ok: true,
      file: matchFile,
      change: desiredChange,
      fallback: true,
      modifiedLine: modifiedLine,
      branch: branchName,
      prUrl,
      prNumber
    });
  }
});

// Close PR endpoint
server.post('/close-pr', async (request, reply) => {
  const { owner, repo, prNumber, githubToken } = request.body;

  server.log.info(`Closing PR #${prNumber} on ${owner}/${repo}...`);

  if (!owner || !repo || !prNumber || !githubToken) {
    return reply.code(400).send({ error: 'Missing required parameters: owner, repo, prNumber, githubToken' });
  }

  try {
    const octokit = new Octokit({ auth: githubToken });

    // Close the pull request
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      state: 'closed'
    });

    server.log.info(`✅ PR #${prNumber} closed successfully`);

    return reply.send({ ok: true, message: `PR #${prNumber} closed` });

  } catch (error) {
    server.log.error('Failed to close PR:', error.message);
    return reply.code(500).send({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 8080;
server.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  server.log.info(`⚡ server listening on ${address}`);
});