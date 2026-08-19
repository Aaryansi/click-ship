import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ESLint } from 'eslint';

import plugin from '../../src/eslint/index.js';
import { clearTokenCache } from '../../src/eslint/tokens.js';

const TAILWIND = `module.exports = {
  theme: { extend: {
    colors: { primary: '#3b82f6', 'blue-500': '#3b82f6' },
    spacing: { 1: '4px', 2: '8px', 3: '12px', 4: '16px' },
    borderRadius: { md: '6px' },
    fontSize: { sm: '14px', base: '16px' }
  } }
};`;

function project(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'dl-eslint-'));
  for (const [name, contents] of Object.entries({ 'tailwind.config.js': TAILWIND, ...files })) {
    const full = join(dir, name);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, contents);
  }
  clearTokenCache();
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
    clearTokenCache();
  });
  return dir;
}

// the real consumption path: a flat config with the plugin in it, not a rule tester
function eslintFor(dir, { fix = false, rules } = {}) {
  return new ESLint({
    cwd: dir,
    overrideConfigFile: true,
    fix,
    overrideConfig: [{
      files: ['**/*.{js,jsx,tsx}'],
      languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { 'design-lint': plugin },
      settings: { 'design-lint': { root: dir } },
      rules: rules ?? plugin.configs.recommended.rules
    }]
  });
}

test('a hardcoded colour is reported where it appears', async (t) => {
  const dir = project(t, {
    'App.jsx': 'export const A = () => <div style={{ color: "#ff0000" }} />;\n'
  });

  const [result] = await eslintFor(dir).lintFiles([join(dir, 'App.jsx')]);
  const messages = result.messages.filter(m => m.ruleId === 'design-lint/color-tokens');

  assert.equal(messages.length, 1);
  assert.equal(messages[0].line, 1);
  assert.match(messages[0].message, /#ff0000/);
  assert.equal(messages[0].severity, 2, 'recommended maps color-tokens to error, same as the cli');
});

test('the reported column lands on the value, not the start of the line', async (t) => {
  const dir = project(t, {
    'App.jsx': 'const x = 1;\nexport const A = () => <div style={{ color: "#ff0000" }} />;\n'
  });

  const [result] = await eslintFor(dir).lintFiles([join(dir, 'App.jsx')]);
  const [message] = result.messages.filter(m => m.ruleId === 'design-lint/color-tokens');

  assert.equal(message.line, 2);
  // eslint columns are 1-based, and an off-by-one here puts every squiggle on the wrong
  // character, which is the whole value of running in the editor
  const line = 'export const A = () => <div style={{ color: "#ff0000" }} />;';
  assert.equal(line.slice(message.column - 1, message.column - 1 + 7), '#ff0000');
});

test('a token that exists is not reported', async (t) => {
  const dir = project(t, {
    'App.jsx': 'export const A = () => <div className="bg-primary p-4 rounded-md" />;\n'
  });

  const [result] = await eslintFor(dir).lintFiles([join(dir, 'App.jsx')]);
  assert.deepEqual(result.messages, []);
});

test('eslint --fix rewrites an arbitrary class to the token', async (t) => {
  const dir = project(t, {
    'App.jsx': 'export const A = () => <div className="bg-[#3b82f6]" />;\n'
  });

  const [result] = await eslintFor(dir, { fix: true }).lintFiles([join(dir, 'App.jsx')]);

  assert.match(result.output, /bg-blue-500/);
  assert.doesNotMatch(result.output, /#3b82f6/);
});

test('a colour with no close token is reported but not rewritten', async (t) => {
  // guessing at a fix is how an autofix loses people's trust
  const dir = project(t, {
    'App.jsx': 'export const A = () => <div className="bg-[#7f1d6a]" />;\n'
  });

  const [result] = await eslintFor(dir, { fix: true }).lintFiles([join(dir, 'App.jsx')]);

  assert.equal(result.output, undefined, 'nothing safe to rewrite means nothing is rewritten');
  assert.ok(result.messages.length > 0, 'still worth telling someone about');
});

test('each rule reports only its own violations', async (t) => {
  const dir = project(t, {
    'App.jsx': 'export const A = () => <div className="p-[13px]" style={{ color: "#ff0000" }} />;\n'
  });

  const [result] = await eslintFor(dir, {
    rules: { 'design-lint/color-tokens': 'error' }
  }).lintFiles([join(dir, 'App.jsx')]);

  assert.ok(result.messages.every(m => m.ruleId === 'design-lint/color-tokens'));
  assert.ok(result.messages.length > 0);
});

test('turning a rule off turns it off', async (t) => {
  const dir = project(t, {
    'App.jsx': 'export const A = () => <div style={{ color: "#ff0000" }} />;\n'
  });

  const [result] = await eslintFor(dir, {
    rules: { 'design-lint/color-tokens': 'off' }
  }).lintFiles([join(dir, 'App.jsx')]);

  assert.deepEqual(result.messages, []);
});

test('an eslint-disable comment is honoured', async (t) => {
  const dir = project(t, {
    'App.jsx': '// eslint-disable-next-line design-lint/color-tokens\nexport const A = () => <div style={{ color: "#ff0000" }} />;\n'
  });

  const [result] = await eslintFor(dir).lintFiles([join(dir, 'App.jsx')]);
  assert.deepEqual(result.messages.filter(m => m.ruleId === 'design-lint/color-tokens'), []);
});

test('a project with no tokens at all does not crash the lint run', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dl-eslint-bare-'));
  writeFileSync(join(dir, 'App.jsx'), 'export const A = () => <div style={{ color: "#ff0000" }} />;\n');
  clearTokenCache();
  t.after(() => { rmSync(dir, { recursive: true, force: true }); clearTokenCache(); });

  const results = await eslintFor(dir).lintFiles([join(dir, 'App.jsx')]);
  assert.equal(results.length, 1, 'no tokens is a reason to say nothing, not a reason to throw');
});

test('the recommended config carries the cli severities', () => {
  assert.deepEqual(plugin.configs.recommended.rules, {
    'design-lint/color-tokens': 'error',
    'design-lint/spacing-scale': 'warn',
    'design-lint/typography': 'error',
    'design-lint/border-radius': 'warn'
  });
});

test('editing the tailwind config is picked up without restarting eslint', async (t) => {
  const dir = project(t, {
    'App.jsx': 'export const A = () => <div style={{ color: "#7f1d6a" }} />;\n'
  });

  // a custom token, not one of tailwind's stock colours: `theme.extend` keeps the whole
  // default palette, so removing an extended colour is the only change that actually
  // removes a token from the effective set
  writeFileSync(join(dir, 'tailwind.config.js'), TAILWIND.replace("colors: {", "colors: { plum: '#7f1d6a',"));
  clearTokenCache();

  const first = await eslintFor(dir).lintFiles([join(dir, 'App.jsx')]);
  assert.match(first[0].messages.map(m => m.message).join(' '), /plum/);

  // drop it, wait past the recheck interval, and the same file must be judged against the
  // config on disk rather than the one cached when the editor started
  writeFileSync(join(dir, 'tailwind.config.js'), TAILWIND);
  await new Promise(resolve => setTimeout(resolve, 1100));

  const second = await eslintFor(dir).lintFiles([join(dir, 'App.jsx')]);
  assert.doesNotMatch(
    second[0].messages.map(m => m.message).join(' '),
    /plum/,
    'a token that no longer exists must not be suggested'
  );
});
