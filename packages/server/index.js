// click-ship/packages/server/index.js

// 0) load ENV vars from .env
import 'dotenv/config';

// Dependencies
import path from 'path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fs from 'fs/promises';
import { readFileSync } from 'node:fs';
import simpleGit from 'simple-git';
import fetch from 'node-fetch';
import { Octokit } from '@octokit/rest';

// both of these end up inside commits and PR bodies we generate in other people's
// repos, so keep them in one place rather than inlined at each call site
const AI_MODEL = process.env.AI_MODEL || 'gpt-3.5-turbo';
const PROJECT_URL = 'https://github.com/Aaryansi/click-ship';

console.log('→ Using OpenAI with JSX awareness');
console.log('→ Model:', AI_MODEL);

// your hostname→repo mapping
const repos = JSON.parse(
  readFileSync(new URL('./repos.json', import.meta.url), 'utf8')
);

const server = Fastify({
  logger: true,
  bodyLimit: 1048576 // 1MB limit to prevent DOS
});

// CORS configuration - restrict to known origins
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  /^chrome-extension:\/\//  // Allow Chrome extensions
];

server.register(cors, {
  origin: (origin, cb) => {
    // Allow requests with no origin (like curl, Postman, or same-origin)
    if (!origin) return cb(null, true);

    // Check against allowed origins
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) return allowed.test(origin);
      return allowed === origin;
    });

    if (isAllowed) {
      cb(null, true);
    } else {
      server.log.warn(`Blocked CORS request from origin: ${origin}`);
      cb(new Error('Not allowed by CORS'), false);
    }
  }
});

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
      model: AI_MODEL,
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

// Input validation helpers
function isValidHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') return false;
  // Allow localhost, IP addresses, and valid domain names
  const hostnameRegex = /^(localhost|(\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;
  return hostnameRegex.test(hostname) && hostname.length <= 253;
}

function isValidSelector(selector) {
  if (!selector || typeof selector !== 'string') return false;
  // Basic validation - must contain a class or ID, max length to prevent DOS
  return selector.length <= 500 && /[#.][\w-]+/.test(selector);
}

function isValidDesiredChange(change) {
  if (!change || typeof change !== 'string') return false;
  // Reasonable length limit
  return change.length <= 1000;
}

// untracked files are deliberately not blocking. checkout carries them between
// branches untouched and our targeted `git add <file>` never picks them up, so a
// stray .env.local or scratch file shouldn't stop anyone from shipping an edit.
// what does hurt: anything already staged (it would ride along in our commit) and
// tracked edits or conflicts that checkout would clobber or refuse.
function describeBlockingChanges(status) {
  const renamed = status.renamed.map(r => (typeof r === 'string' ? r : r.to));
  return [...new Set([
    ...status.staged,
    ...status.modified,
    ...status.deleted,
    ...renamed,
    ...status.conflicted
  ])];
}

function blockingChangesError(repoRoot, blocking) {
  const error = new Error(
    `Working tree at ${repoRoot} has uncommitted changes to ${blocking.slice(0, 5).join(', ')}` +
    `${blocking.length > 5 ? ` and ${blocking.length - 5} more` : ''}. Commit or stash them before editing.`
  );
  // fastify turns this into a 409 rather than a generic 500
  error.statusCode = 409;
  return error;
}

// edits against one checkout have to take turns. we read the working tree to find the
// target line and then move HEAD around to commit it, so two overlapping requests will
// read each other's half-applied edits and commit the wrong content. keyed by repo path
// because separate checkouts don't contend at all.
const repoQueues = new Map();

function withRepoLock(repoRoot, fn) {
  const previous = repoQueues.get(repoRoot) ?? Promise.resolve();
  // run regardless of how the request ahead of us ended, or one failure wedges the queue
  const current = previous.then(fn, fn);

  const settled = current.then(() => {}, () => {});
  repoQueues.set(repoRoot, settled);
  settled.then(() => {
    // last one out drops the entry so the map doesn't accumulate dead chains
    if (repoQueues.get(repoRoot) === settled) repoQueues.delete(repoRoot);
  });

  return current;
}

// reads the repo as of the base branch without touching the working tree.
//
// we deliberately never check out base to search or to build the prompt. the edit has
// to be derived from base's copy of the file, otherwise we commit the dev's in-progress
// work along with our one line, but checking out to get there would hold their checkout
// hostage for the whole model call. `git show` gives us base's content while their tree
// stays exactly where it is, so the only moment we move HEAD is the commit itself.
// one grep across the base tree instead of a subprocess per candidate file. on a repo
// with a few thousand files under src/ the per-file version meant thousands of
// serialized spawns while holding the repo lock, and a miss scanned every one of them.
//
// -z keeps paths NUL separated and core.quotePath=false stops git C-quoting non-ascii
// names, which would otherwise come back as "src/caf\303\251.jsx" and never resolve.
async function findFileOnBase(git, baseBranch, token, extensions) {
  let output;
  try {
    output = await git.raw([
      '-c', 'core.quotePath=false',
      'grep', '--files-with-matches', '--fixed-strings', '-z',
      '-e', token, baseBranch, '--', 'src/'
    ]);
  } catch (error) {
    // git grep exits 1 when nothing matched, which simple-git surfaces as a throw
    return null;
  }

  const matches = output
    .split('\0')
    .map(entry => entry.trim())
    .filter(Boolean)
    // entries come back as "<ref>:<path>"
    .map(entry => entry.slice(entry.indexOf(':') + 1))
    .filter(file => extensions.some(ext => file.endsWith(ext)));

  return matches[0] || null;
}

async function readBaseFile(git, baseBranch, relativePath) {
  try {
    return await git.show([`${baseBranch}:${relativePath}`]);
  } catch (error) {
    server.log.warn(`Could not read ${relativePath} from ${baseBranch}: ${error.message}`);
    return null;
  }
}

// identity of a path's contents on a ref. we snapshot this at read time and re-check it
// after the pull: if base moved under us, the edit was derived from content that is no
// longer there and committing it would revert whatever landed upstream in between.
async function baseBlobSha(git, baseBranch, relativePath) {
  try {
    return (await git.revparse([`${baseBranch}:${relativePath}`])).trim();
  } catch (error) {
    return null;
  }
}

// a merge or rebase the developer started themselves. we must not abort it, and we must
// not commit on top of it either.
async function inProgressOperation(git) {
  const gitDir = (await git.revparse(['--git-dir'])).trim();
  const root = path.isAbsolute(gitDir) ? gitDir : path.join(await git.revparse(['--show-toplevel']).then(s => s.trim()), gitDir);

  for (const [marker, label] of [['MERGE_HEAD', 'merge'], ['rebase-merge', 'rebase'], ['rebase-apply', 'rebase']]) {
    try {
      await fs.access(path.join(root, marker));
      return label;
    } catch {
      // not present, keep looking
    }
  }
  return null;
}

// parks the repo on a freshly pulled base branch just long enough to commit, then puts
// it back exactly where it started. keep fn short: every millisecond in here is a
// millisecond the dev's checkout is somewhere they didn't put it.
async function onBaseBranch(repoRoot, baseBranch, fn) {
  const git = simpleGit(repoRoot);

  let status;
  try {
    status = await git.status();
  } catch (error) {
    const failure = new Error(`Could not read git status for ${repoRoot}: ${error.message}`);
    failure.statusCode = 400;
    throw failure;
  }

  const blocking = describeBlockingChanges(status);
  if (blocking.length > 0) {
    throw blockingChangesError(repoRoot, blocking);
  }

  // a paused `rebase -i` leaves a clean tree, so it sails past the check above. we have
  // to bail here: aborting it later would throw away the developer's work, and it also
  // means HEAD is somewhere we cannot safely branch from
  const existing = await inProgressOperation(git);
  if (existing) {
    const failure = new Error(
      `A ${existing} is already in progress in ${repoRoot}. Finish or abort it before editing.`
    );
    failure.statusCode = 409;
    throw failure;
  }

  // on a detached head `current` is the literal string "HEAD", so restoring by name
  // would land wherever HEAD points by then, i.e. the branch we are about to create
  const startingRef = status.detached ? await git.revparse(['HEAD']) : status.current;

  try {
    await git.checkout(baseBranch);
  } catch (error) {
    // usually an untracked file sitting where base tracks one, which checkout refuses.
    // that is the same class of problem as a dirty tree, so report it the same way
    // rather than as an opaque 500
    const failure = new Error(`Could not check out ${baseBranch} in ${repoRoot}: ${error.message}`);
    failure.statusCode = 409;
    throw failure;
  }

  try {
    try {
      await git.pull('origin', baseBranch);
    } catch (error) {
      // a repo with no reachable remote should still produce a usable local commit, but
      // a conflicting pull leaves state behind and which state depends on the dev's
      // pull.rebase setting: MERGE_HEAD for a merge, .git/rebase-merge for a rebase.
      // clear whichever it was or their repo stays wedged long after this request.
      //
      // only abort what *this* pull started. we checked for a pre-existing merge or
      // rebase before touching anything, so whatever is here now is ours to clean up
      server.log.warn(`Could not pull ${baseBranch}: ${error.message}`);
      const ours = await inProgressOperation(git);
      if (ours === 'merge') {
        await git.raw(['merge', '--abort']).catch(() => {});
      } else if (ours === 'rebase') {
        await git.raw(['rebase', '--abort']).catch(() => {});
      }

      let afterPull;
      try {
        afterPull = describeBlockingChanges(await git.status());
      } catch (statusError) {
        const failure = new Error(
          `Could not read git status for ${repoRoot} after a failed pull: ${statusError.message}`
        );
        failure.statusCode = 409;
        throw failure;
      }

      if (afterPull.length > 0) {
        throw blockingChangesError(repoRoot, afterPull);
      }

      // aborting can land HEAD somewhere other than base, and branching from the wrong
      // ref is the whole bug this function exists to prevent
      const settled = await git.status();
      if (settled.detached || settled.current !== baseBranch) {
        const failure = new Error(
          `Expected to be on ${baseBranch} in ${repoRoot} after recovering from a failed pull, but HEAD is at ${settled.current}.`
        );
        failure.statusCode = 409;
        throw failure;
      }
    }

    return await fn(git);
  } finally {
    // no blanket `reset --hard` here. the dev may have saved something while we were
    // busy, and destroying uncommitted work is unrecoverable. checkout refuses when it
    // would clobber local changes, which is the failure mode we want: shipChange cleans
    // up the one file it wrote, and anything else that is dirty is theirs to keep
    try {
      await git.checkout(startingRef);
    } catch (error) {
      server.log.error(`Could not restore ${startingRef}: ${error.message}`);
    }
  }
}

// commits the change on a new branch off base, pushes it, and opens the PR. assumes
// the caller already parked the repo on base via onBaseBranch.
async function shipChange(git, repoRoot, {
  relativePath,
  content,
  baseBlob,
  branchName,
  commitMessage,
  baseBranch,
  githubInfo,
  githubToken,
  prTitle,
  prBody
}) {
  let prUrl = null;
  let prNumber = null;
  let pushError = null;
  let prError = null;

  // the content was read off base before the pull. if the pull moved that file, the
  // edit was derived from a version that no longer exists and writing it back would
  // silently revert whatever landed upstream in between
  const currentBlob = await baseBlobSha(git, baseBranch, relativePath);
  if (baseBlob && currentBlob && currentBlob !== baseBlob) {
    const failure = new Error(
      `${relativePath} changed on ${baseBranch} while this edit was being prepared. Try again.`
    );
    failure.statusCode = 409;
    throw failure;
  }

  // and the tree has to still be clean: a file saved while we were busy would otherwise
  // be overwritten with content derived from the older read
  const blocking = describeBlockingChanges(await git.status());
  if (blocking.length > 0) {
    throw blockingChangesError(repoRoot, blocking);
  }

  {
    server.log.info(`Creating branch: ${branchName}`);
    await git.checkoutLocalBranch(branchName);

    try {
      await fs.writeFile(path.join(repoRoot, relativePath), content, 'utf8');
      await git.add(relativePath);
      await git.commit(commitMessage);
    } catch (error) {
      // put just this file back. a failed commit would otherwise leave the edit in the
      // tree, which blocks every later request, but a blanket reset would take the
      // dev's own work with it.
      //
      // it has to be `checkout HEAD --`, not `checkout --`: by this point the file is
      // already staged, and the plain form copies out of the index, so it restores the
      // very content we are trying to discard
      await git.checkout(['HEAD', '--', relativePath]).catch(() => {});
      throw error;
    }
    server.log.info('✅ Successfully applied modification');

    try {
      await git.push('origin', branchName, ['--set-upstream']);
      server.log.info(`Branch ${branchName} pushed to origin`);
    } catch (error) {
      // not fatal — the commit exists locally and the caller is told about it — but
      // it does mean the PR below has nothing to open against
      pushError = error.message;
      server.log.error('Failed to push branch:', error.message);
    }

    if (!pushError && githubInfo && githubInfo.owner && githubInfo.repo) {
      try {
        server.log.info(`Creating PR on ${githubInfo.owner}/${githubInfo.repo}...`);
        const octokit = new Octokit({ auth: githubToken });
        const { data: pr } = await octokit.rest.pulls.create({
          owner: githubInfo.owner,
          repo: githubInfo.repo,
          title: prTitle,
          head: branchName,
          base: baseBranch,
          body: prBody
        });

        prUrl = pr.html_url;
        prNumber = pr.number;
        server.log.info(`✅ PR created: ${prUrl}`);
      } catch (error) {
        // the branch is already pushed, so a failed PR can still be opened by hand
        prError = error.message;
        server.log.error('Failed to create PR:', error.message);
      }
    } else if (!githubInfo || !githubInfo.owner || !githubInfo.repo) {
      server.log.warn('No GitHub info configured, skipping PR creation. Changes committed to branch.');
    }
  }

  // the commit always landed if we got here, but pushing or opening the PR may not
  // have. say so instead of reporting a flat success the caller can't act on.
  const prExpected = Boolean(githubInfo && githubInfo.owner && githubInfo.repo);
  let failure = null;
  if (pushError) {
    failure = `Committed to ${branchName} but the push failed: ${pushError}`;
  } else if (prExpected && prError) {
    failure = `Pushed ${branchName} but the pull request could not be opened: ${prError}`;
  }

  return { branchName, prUrl, prNumber, failure };
}

// last-resort edit for when the model is unavailable or hands back something unusable.
// handles "text -> new text", "property: value", and a couple of size/colour keywords.
// returns null when nothing matched, which callers should treat as "don't touch it".
function applyFallbackEdit(lines, tokenLineIndex, desiredChange) {
  const updatedLines = [...lines];
  let modifiedLine = lines[tokenLineIndex];
  let changeApplied = false;

  // Handle text changes: "text -> new text"
  if (desiredChange.includes('->')) {
    const [, newText] = desiredChange.split('->').map(s => s.trim());

    if (newText) {
      // First try: text on same line as tag
      modifiedLine = modifiedLine.replace(/>([^<]+)</, () => `>${newText}<`);
      if (modifiedLine !== lines[tokenLineIndex]) {
        changeApplied = true;
      }

      // Second try: text is on the next line (common JSX pattern)
      if (!changeApplied && tokenLineIndex + 1 < lines.length) {
        const nextLine = lines[tokenLineIndex + 1];
        // Check if next line is just text content (whitespace + text)
        if (nextLine.trim() && !nextLine.trim().startsWith('<') && !nextLine.trim().startsWith('{')) {
          const indent = nextLine.match(/^(\s*)/)[1]; // preserve indentation
          updatedLines[tokenLineIndex + 1] = indent + newText;
          changeApplied = true;
        }
      }
    }
  }
  // Handle inline CSS changes: "property: value"
  else if (desiredChange.includes(':')) {
    const [prop, val] = desiredChange.split(':').map(s => s.trim());
    const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

    if (modifiedLine.includes('style={{')) {
      // Already has style object - add to it
      modifiedLine = modifiedLine.replace(
        /style=\{\{([^}]*)\}\}/,
        (match, styles) => `style={{${styles}, ${camelProp}: '${val}'}}`
      );
    } else if (modifiedLine.includes('style="')) {
      // Has inline style string - add to it
      modifiedLine = modifiedLine.replace(/style="([^"]*)"/, (match, styles) => `style="${styles}; ${prop}: ${val}"`);
    } else if (modifiedLine.includes('className=')) {
      // No style - add style attribute after className
      modifiedLine = modifiedLine.replace(/(className="[^"]*")/, `$1 style={{${camelProp}: '${val}'}}`);
    } else if (modifiedLine.includes('<')) {
      // Has a tag but no className - add style before >
      modifiedLine = modifiedLine.replace(/>/, ` style={{${camelProp}: '${val}'}}>`);
    }
    if (modifiedLine !== lines[tokenLineIndex]) changeApplied = true;
  }
  // More careful JSX-aware CSS modifications
  else if (desiredChange.toLowerCase().includes('bigger') || desiredChange.toLowerCase().includes('larger')) {
    // Only modify className attribute, not the whole line
    modifiedLine = modifiedLine.replace(/className="([^"]*)"/, (match, classes) => `className="${classes} text-2xl font-bold"`);
    if (modifiedLine !== lines[tokenLineIndex]) changeApplied = true;
  } else if (desiredChange.toLowerCase().includes('red')) {
    modifiedLine = modifiedLine.replace(/className="([^"]*)"/, (match, classes) => `className="${classes} text-red-500"`);
    if (modifiedLine !== lines[tokenLineIndex]) changeApplied = true;
  }

  if (!changeApplied) return null;

  updatedLines[tokenLineIndex] = modifiedLine;
  return { updatedLines, modifiedLine };
}

server.post('/edit', async (request, reply) => {
  const { hostname, selector, desiredChange, githubToken } = request.body || {};

  // Input validation
  if (!isValidHostname(hostname)) {
    return reply.code(400).send({ error: 'Invalid hostname format' });
  }
  if (!isValidSelector(selector)) {
    return reply.code(400).send({ error: 'Invalid selector format' });
  }
  if (!isValidDesiredChange(desiredChange)) {
    return reply.code(400).send({ error: 'Invalid change description' });
  }
  if (!githubToken || typeof githubToken !== 'string') {
    return reply.code(401).send({ error: 'GitHub token required' });
  }

  server.log.info('▶️  Payload received', { hostname, selector, desiredChange: desiredChange.substring(0, 50) });

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

  // the search reads base through `git show` and never touches the working tree, but
  // the commit does move HEAD, so one request at a time per checkout
  return withRepoLock(repoRoot, async () => {
    const baseBranch = (githubInfo && githubInfo.baseBranch) || 'main';
    const git = simpleGit(repoRoot);

    // 2) extract the first .class or #id token
    const m = selector.match(/([#.][\w-]+)/);
    if (!m) {
      return reply.code(400).send({ error: 'no class or id in selector' });
    }
    const token = m[1].slice(1);

    // bail before spending a model call on a repo we can't commit in. onBaseBranch
    // checks again at commit time, but that is after the money has been spent, and its
    // thrown error reaches the extension through fastify's serializer as "Conflict"
    // rather than as something the user can act on
    try {
      const blocking = describeBlockingChanges(await git.status());
      if (blocking.length > 0) {
        return reply.code(409).send({ error: blockingChangesError(repoRoot, blocking).message });
      }
    } catch (error) {
      return reply.code(400).send({ error: `Could not read git status for ${repoRoot}: ${error.message}` });
    }

    // 3) find the file on base, not as the dev has it locally
    const extensions = ['.tsx', '.jsx', '.js', '.html', '.css'];
    let matchFile;
    try {
      matchFile = await findFileOnBase(git, baseBranch, token, extensions);
    } catch (error) {
      return reply.code(400).send({
        error: `Could not search ${baseBranch} in ${repoRoot}: ${error.message}`
      });
    }

    if (!matchFile) {
      server.log.warn(`❗ no file matched token "${token}"`);
      return reply.send({ ok: true, hostname, selector, token, file: null });
    }

    const fullContent = await readBaseFile(git, baseBranch, matchFile);
    if (fullContent === null) {
      return reply.code(400).send({ error: `Could not read ${matchFile} from ${baseBranch}` });
    }

    // pinned so shipChange can tell whether the pull moved this file under us
    const baseBlob = await baseBlobSha(git, baseBranch, matchFile);

    server.log.info('✅ matched token in file', { file: matchFile });

    {
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

      const originalLine = lines[tokenLineIndex];
      let modifiedLine;
      let updatedLines;
      let usedFallback = false;

      // only the model call and its output live inside this try. git failures used to land
      // in the same catch, so a push error got logged as "AI failed", threw away a perfectly
      // good edit, and retried with the cruder fallback — which then failed the same way.
      try {
        server.log.info('🤖 Calling OpenAI with JSX context...');

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

        const generatedText = await callOpenAI(prompt);
        server.log.info('OpenAI response:', generatedText);

        modifiedLine = generatedText
          .replace(/```[a-z]*\n?/g, '')
          .replace(/\n?```/g, '')
          .trim();

        // a rewrite that dropped the selector is pointing at the wrong element now
        if (!modifiedLine.includes(token)) {
          throw new Error('Modified line lost the original token');
        }

        updatedLines = [...lines];
        updatedLines[tokenLineIndex] = modifiedLine;
      } catch (error) {
        server.log.error('❗ AI failed:', error.message);

        const fallback = applyFallbackEdit(lines, tokenLineIndex, desiredChange);
        if (!fallback) {
          return reply.send({
            ok: false,
            error: 'Could not safely modify JSX structure. Try simpler changes like "text -> new text" or CSS properties.',
            fallback: true
          });
        }

        ({ updatedLines, modifiedLine } = fallback);
        usedFallback = true;
      }

      const relativePath = matchFile;
      const slug = desiredChange.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '-');
      const branchName = `click-ship/${usedFallback ? 'fallback-' : ''}${Date.now()}-${slug}`;

      // only now do we move HEAD, and only for as long as the commit takes. anything
      // below here is git or GitHub failing, not the model, so it must not fall back
      // into the handler above
      const { prUrl, prNumber, failure } = await onBaseBranch(repoRoot, baseBranch, (git) => shipChange(git, repoRoot, {
        relativePath,
        content: updatedLines.join('\n'),
        baseBlob,
        branchName,
        baseBranch,
        githubInfo,
        githubToken,
        commitMessage: usedFallback
          ? `UI (Fallback): ${desiredChange}\n\n\u2728 Created via Click-Ship by @${authenticatedUser.login}\n\u26A0\uFE0F Used fallback modification (AI unavailable)`
          : `UI: ${desiredChange}\n\n\u2728 Created via Click-Ship by @${authenticatedUser.login}`,
        prTitle: `UI Update${usedFallback ? ' (Fallback)' : ''}: ${desiredChange}`,
        prBody: usedFallback
          ? `## Changes
${desiredChange}

\u26A0\uFE0F **Note**: This change was made using fallback CSS modification (AI was unavailable)

## Modified Files
- \`${relativePath}\`

---
\u2728 Created with [Click-Ship](${PROJECT_URL}) by @${authenticatedUser.login}`
      : `## Changes
${desiredChange}

## Modified Files
- \`${relativePath}\`

## Code Changes
\`\`\`diff
- ${originalLine}
+ ${modifiedLine}
\`\`\`

---
\u2728 Created with [Click-Ship](${PROJECT_URL}) by @${authenticatedUser.login}
AI-powered code modification using ${AI_MODEL}`
      }));

      return reply.send({
        ok: !failure,
        ...(failure ? { error: failure } : {}),
        file: matchFile,
        change: desiredChange,
        ai: !usedFallback,
        fallback: usedFallback,
        modifiedLine,
        branch: branchName,
        prUrl,
        prNumber
      });
    }
  });
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

    // Get PR details first to find the branch name
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber
    });

    const branchName = pr.head.ref;
    server.log.info(`PR #${prNumber} is from branch: ${branchName}`);

    // Close the pull request
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      state: 'closed'
    });

    server.log.info(`✅ PR #${prNumber} closed successfully`);

    // Delete the branch
    try {
      await octokit.rest.git.deleteRef({
        owner,
        repo,
        ref: `heads/${branchName}`
      });
      server.log.info(`✅ Branch ${branchName} deleted successfully`);
    } catch (branchError) {
      // Branch deletion might fail if already deleted or protected
      server.log.warn(`Could not delete branch ${branchName}: ${branchError.message}`);
    }

    return reply.send({ ok: true, message: `PR #${prNumber} closed and branch deleted` });

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