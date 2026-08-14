import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lint } from '../src/index.js';

const DEMO = join(dirname(fileURLToPath(import.meta.url)), '../../../demo-project');

// the demo project is the fixture the README quotes, so it doubles as the regression
// guard for the whole pipeline: config load, token autodetect, all four rules, reporting
test('lints the demo project end to end', async () => {
  const { violations, fileCount } = await lint(['src/**/*.tsx'], { cwd: DEMO });

  const errors = violations.filter(v => v.severity === 'error').length;
  const warnings = violations.filter(v => v.severity === 'warn').length;

  assert.equal(fileCount, 3, 'Button, Card and Header');
  assert.equal(errors, 7);
  assert.equal(warnings, 5);
});

test('every rule fires at least once on the demo project', async () => {
  const { violations } = await lint(['src/**/*.tsx'], { cwd: DEMO });
  const fired = new Set(violations.map(v => v.rule));

  assert.deepEqual(
    [...fired].sort(),
    ['border-radius', 'color-tokens', 'spacing-scale', 'typography']
  );
});

test('violations carry everything a reporter needs', async () => {
  const { violations } = await lint(['src/**/*.tsx'], { cwd: DEMO });

  assert.ok(violations.length > 0);
  for (const v of violations) {
    assert.ok(v.rule, 'rule');
    assert.ok(v.message, 'message');
    assert.ok(v.file, 'file');
    assert.ok(Number.isInteger(v.line) && v.line > 0, `line should be a positive integer, got ${v.line}`);
    assert.ok(Number.isInteger(v.column), 'column');
    assert.ok(['error', 'warn'].includes(v.severity), `unexpected severity ${v.severity}`);
  }
});

test('file paths are reported relative to the project root', async () => {
  const { violations } = await lint(['src/**/*.tsx'], { cwd: DEMO });

  for (const v of violations) {
    assert.ok(!v.file.startsWith('/'), `expected a relative path, got ${v.file}`);
    assert.match(v.file, /^src[\/\\]/);
  }
});

test('a pattern that matches nothing is not an error', async () => {
  const { violations, fileCount } = await lint(['src/**/*.vue'], { cwd: DEMO });

  assert.equal(fileCount, 0);
  assert.deepEqual(violations, []);
});

test('the demo config is picked up rather than the defaults', async () => {
  const { tokens } = await lint(['src/**/*.tsx'], { cwd: DEMO });

  assert.ok(tokens.sources.some(s => s.type === 'tailwind'),
    'demo-project ships a tailwind.config.js and it should be detected');
});
