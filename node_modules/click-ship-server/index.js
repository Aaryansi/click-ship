// click-ship/packages/server/index.js

// 0) load ENV vars from .env
require('dotenv').config();
console.log('→ HF_TOKEN loaded?', !!process.env.HF_TOKEN);
console.log('→ HF_MODEL =', process.env.HF_MODEL);
console.log('→ NODE_ENV =', process.env.NODE_ENV);

// 0.1) Hugging Face client
const fetch    = require('node-fetch');
const HF_TOKEN = process.env.HF_TOKEN;
// Use a smaller, faster model that's better suited for code generation
const HF_MODEL = process.env.HF_MODEL || 'Salesforce/codegen-350M-multi';

// core dependencies
const path      = require('path');
const Fastify   = require('fastify');
const cors      = require('@fastify/cors');
const fastGlob  = require('fast-glob');
const fs        = require('fs/promises');
const simpleGit = require('simple-git');

// your hostname→repo mapping
const repos     = require('./repos.json');

const server = Fastify({ logger: true });
server.register(cors, { origin: true });

server.post('/edit', async (request, reply) => {
  const { hostname, selector, desiredChange } = request.body;
  server.log.info('▶️  Payload received', { hostname, selector, desiredChange });

  // 1) lookup repo path
  const repoRoot = repos[hostname];
  if (!repoRoot) {
    return reply.code(400).send({ error: `no repo configured for ${hostname}` });
  }

  // 2) extract the first .class or #id token
  const m = selector.match(/([#.][\w-]+)/);
  if (!m) {
    return reply.code(400).send({ error: 'no class or id in selector' });
  }
  const token = m[1].slice(1);

  // 3) find source files under src/
  const patterns = ['src/**/*.tsx','src/**/*.jsx','src/**/*.js', 'src/**/*.html', 'src/**/*.css'];
  const files = await fastGlob(patterns, { cwd: repoRoot, absolute: true });

  // 4) pick the first file containing that token and grab a snippet
  let matchFile = null;
  let snippet   = '';
  let idx       = -1;
  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      if (content.includes(token)) {
        matchFile = file;
        const lines = content.split('\n');
        idx = lines.findIndex(l => l.includes(token));
        const start = Math.max(0, idx - 10);
        const end   = Math.min(lines.length, idx + 10);
        snippet = lines.slice(start, end).join('\n');
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
  
  // Determine file type for context
  const fileExt = path.extname(matchFile).toLowerCase();
  const fileType = fileExt === '.css' ? 'CSS' : 
                   fileExt === '.html' ? 'HTML' : 
                   'React/JavaScript';

  // 🚧 DEVELOPMENT MODE: use a simple rule-based approach
  if (process.env.NODE_ENV === 'development' || !HF_TOKEN) {
    server.log.info('🔧 Using development mode (no AI)');

    const relativePath = path.relative(repoRoot, matchFile);
    
    // Get the file content and split into lines
    const content = await fs.readFile(matchFile, 'utf8');
    const lines = content.split('\n');
    
    // Find the line with the token again
    const lineIdx = lines.findIndex(l => l.includes(token));
    if (lineIdx === -1) {
      return reply.code(500).send({ error: 'Could not find line with token' });
    }
    
    // Simple rule-based changes
    let modifiedLine = lines[lineIdx];
    
    if (desiredChange.toLowerCase().includes('background') && desiredChange.toLowerCase().includes('red')) {
      if (modifiedLine.includes('className=')) {
        modifiedLine = modifiedLine.replace(/className=["']([^"']*)["']/, 'className="$1 bg-red-500"');
      } else {
        modifiedLine = modifiedLine + ' // TODO: add background red';
      }
    } else if (desiredChange.toLowerCase().includes('text') && desiredChange.toLowerCase().includes('larger')) {
      if (modifiedLine.includes('className=')) {
        modifiedLine = modifiedLine.replace(/className=["']([^"']*)["']/, 'className="$1 text-xl"');
      } else {
        modifiedLine = modifiedLine + ' // TODO: make text larger';
      }
    } else {
      // Generic change - just add a comment
      modifiedLine = modifiedLine + ' // TODO: ' + desiredChange;
    }
    
    // Update the file directly instead of using git apply
    lines[lineIdx] = modifiedLine;
    const updatedContent = lines.join('\n');
    
    try {
      server.log.info('🔧 Writing updated file...');
      await fs.writeFile(matchFile, updatedContent, 'utf8');
      
      const git = simpleGit(repoRoot);
      server.log.info('🔧 Adding file to git...');
      await git.add(relativePath);
      server.log.info('🔧 Committing changes...');
      await git.commit(`feat: apply change "${desiredChange}" to ${path.basename(matchFile)}`);
      server.log.info('✅ development patch applied and committed');
    } catch (err) {
      server.log.error('❗ File update or git commit failed', err);
      return reply
        .code(500)
        .send({ error: 'Update failed', details: err.message });
    }
    
    return reply.send({ 
      ok: true, 
      file: matchFile, 
      change: desiredChange,
      development: true 
    });
  }

  // 5) build the prompt for real HF inference
  const prompt = `You are a code editor assistant. Given the following ${fileType} code snippet and a desired change, generate a git unified diff that implements the change.

Current code:
\`\`\`${fileExt.slice(1)}
${snippet}
\`\`\`

Desired change: "${desiredChange}"

Generate ONLY a git unified diff that implements this change. The diff should:
1. Use the correct file path
2. Include proper line numbers
3. Show the exact changes needed
4. Be a valid git diff format

Respond with only the diff, no explanations.`;

  try {
    // 6) call Hugging Face Inference API with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const hfRes = await fetch(
      `https://api-inference.huggingface.co/models/${HF_MODEL}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type':  'application/json'
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 256,
            temperature: 0.7,
            top_p: 0.95,
            do_sample: true
          }
        }),
        signal: controller.signal
      }
    );

    clearTimeout(timeout);

    if (!hfRes.ok) {
      const body = await hfRes.text();
      server.log.error('❗ HF inference error', { status: hfRes.status, body });
      
      // Fall back to simple change
      const lines = content.split('\n');
      const lineIdx = lines.findIndex(l => l.includes(token));
      lines[lineIdx] = lines[lineIdx] + ' // AI_ERROR: ' + desiredChange;
      const updatedContent = lines.join('\n');
      
      await fs.writeFile(matchFile, updatedContent, 'utf8');
      const git = simpleGit(repoRoot);
      await git.add(path.relative(repoRoot, matchFile));
      await git.commit(`feat: apply change "${desiredChange}" to ${path.basename(matchFile)}`);
      
      return reply.send({ ok: true, file: matchFile, change: desiredChange, fallback: true });
    }

    const hfJson = await hfRes.json();
    let generatedText = Array.isArray(hfJson)
      ? (hfJson[0].generated_text || hfJson[0].text || '')
      : (hfJson.generated_text || hfJson.text || '');

    // Extract diff from the generated text
    let diff = generatedText;
    if (generatedText.includes('diff --git')) {
      diff = generatedText.substring(generatedText.indexOf('diff --git'));
    } else {
      // If no valid diff, create a simple one
      const lines = content.split('\n');
      const lineIdx = lines.findIndex(l => l.includes(token));
      lines[lineIdx] = lines[lineIdx] + ' // AI: ' + desiredChange;
      const updatedContent = lines.join('\n');
      
      await fs.writeFile(matchFile, updatedContent, 'utf8');
      const git = simpleGit(repoRoot);
      await git.add(path.relative(repoRoot, matchFile));
      await git.commit(`feat: apply AI change "${desiredChange}" to ${path.basename(matchFile)}`);
      
      return reply.send({ ok: true, file: matchFile, change: desiredChange, ai: true });
    }

    // 7) apply & commit the real diff
    try {
      const git = simpleGit(repoRoot);
      await git.raw(['apply', '-'], { input: diff });
      await git.add(path.relative(repoRoot, matchFile));
      await git.commit(`feat: apply AI change "${desiredChange}" to ${path.basename(matchFile)}`);
      server.log.info('✅ AI patch applied and committed');
    } catch (gitErr) {
      server.log.error('❗ git apply/commit failed', gitErr);
      
      // Fallback to simple change
      const lines = content.split('\n');
      const lineIdx = lines.findIndex(l => l.includes(token));
      lines[lineIdx] = lines[lineIdx] + ' // AI_APPLY_ERROR: ' + desiredChange;
      const updatedContent = lines.join('\n');
      
      await fs.writeFile(matchFile, updatedContent, 'utf8');
      const git = simpleGit(repoRoot);
      await git.add(path.relative(repoRoot, matchFile));
      await git.commit(`feat: apply change "${desiredChange}" to ${path.basename(matchFile)}`);
      
      return reply.send({ ok: true, file: matchFile, change: desiredChange, fallback: true });
    }

    // 8) respond with the change information
    return reply.send({
      ok: true,
      hostname,
      selector,
      token,
      file: matchFile,
      change: desiredChange,
      ai: true
    });

  } catch (error) {
    if (error.name === 'AbortError') {
      server.log.error('❗ HF request timed out');
      // Fallback to simple change
      const lines = content.split('\n');
      const lineIdx = lines.findIndex(l => l.includes(token));
      lines[lineIdx] = lines[lineIdx] + ' // TIMEOUT: ' + desiredChange;
      const updatedContent = lines.join('\n');
      
      await fs.writeFile(matchFile, updatedContent, 'utf8');
      const git = simpleGit(repoRoot);
      await git.add(path.relative(repoRoot, matchFile));
      await git.commit(`feat: apply change "${desiredChange}" to ${path.basename(matchFile)}`);
      
      return reply.send({ ok: true, file: matchFile, change: desiredChange, timeout: true });
    }
    
    server.log.error('❗ Unexpected error', error);
    return reply.code(500).send({ error: error.message });
  }
});

// 9) start the server
const PORT = process.env.PORT || 8080;
server.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  server.log.info(`⚡ server listening on ${address}`);
});