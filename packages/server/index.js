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
    
    // Commit changes
    const git = simpleGit(repoRoot);
    const relativePath = path.relative(repoRoot, matchFile);
    await git.add(relativePath);
    await git.commit(`AI: ${desiredChange}`);
    
    server.log.info('✅ Successfully applied modification');
    
    return reply.send({
      ok: true,
      file: matchFile,
      change: desiredChange,
      ai: true,
      modifiedLine: modifiedLine
    });
    
  } catch (error) {
    server.log.error('❗ AI failed:', error.message);
    
    // Safer fallback for JSX files
    const updatedLines = [...lines];
    let modifiedLine = lines[tokenLineIndex];
    
    // More careful JSX-aware modifications
    if (desiredChange.toLowerCase().includes('bigger') || desiredChange.toLowerCase().includes('larger')) {
      // Only modify className attribute, not the whole line
      modifiedLine = modifiedLine.replace(/className="([^"]*)"/, (match, classes) => {
        return `className="${classes} text-2xl font-bold"`;
      });
    } else if (desiredChange.toLowerCase().includes('red')) {
      modifiedLine = modifiedLine.replace(/className="([^"]*)"/, (match, classes) => {
        return `className="${classes} text-red-500"`;
      });
    }
    
    // If no className exists, don't modify JSX structure
    if (modifiedLine === lines[tokenLineIndex]) {
      return reply.send({
        ok: false,
        error: 'Could not safely modify JSX structure',
        fallback: true
      });
    }
    
    updatedLines[tokenLineIndex] = modifiedLine;
    const updatedContent = updatedLines.join('\n');
    
    await fs.writeFile(matchFile, updatedContent, 'utf8');
    
    const git = simpleGit(repoRoot);
    const relativePath = path.relative(repoRoot, matchFile);
    await git.add(relativePath);
    await git.commit(`Fallback: ${desiredChange}`);
    
    return reply.send({
      ok: true,
      file: matchFile,
      change: desiredChange,
      fallback: true,
      modifiedLine: modifiedLine
    });
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