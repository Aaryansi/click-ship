import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative as relative_ } from 'node:path';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { lint } from '../src/index.js';

// the fixture lives outside this package, so say so plainly rather than letting a
// per-package checkout fail as a bare `0 !== 3`
const DEMO = join(dirname(fileURLToPath(import.meta.url)), '../../../demo-project');
const haveDemo = existsSync(join(DEMO, 'src/components/Button.tsx'));
const needsDemo = { skip: haveDemo ? false : `demo-project fixture not found at ${DEMO}` };

// the demo project is the fixture the README quotes, so it doubles as the regression
// guard for the whole pipeline: config load, token autodetect, all four rules, reporting
test('lints the demo project end to end', needsDemo, async () => {
  const { violations, fileCount } = await lint(['src/**/*.tsx'], { cwd: DEMO });

  const errors = violations.filter(v => v.severity === 'error').length;
  const warnings = violations.filter(v => v.severity === 'warn').length;

  assert.equal(fileCount, 3, 'Button, Card and Header');
  assert.equal(errors, 7);
  assert.equal(warnings, 5);
});

test('every rule fires at least once on the demo project', needsDemo, async () => {
  const { violations } = await lint(['src/**/*.tsx'], { cwd: DEMO });
  const fired = new Set(violations.map(v => v.rule));

  assert.deepEqual(
    [...fired].sort(),
    ['border-radius', 'color-tokens', 'spacing-scale', 'typography']
  );
});

test('violations carry everything a reporter needs', needsDemo, async () => {
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

test('file paths are reported relative to the project root', needsDemo, async () => {
  const { violations } = await lint(['src/**/*.tsx'], { cwd: DEMO });

  for (const v of violations) {
    assert.ok(!v.file.startsWith('/'), `expected a relative path, got ${v.file}`);
    assert.match(v.file, /^src[\/\\]/);
  }
});

test('a pattern that matches nothing is not an error', needsDemo, async () => {
  const { violations, fileCount } = await lint(['src/**/*.vue'], { cwd: DEMO });

  assert.equal(fileCount, 0);
  assert.deepEqual(violations, []);
});

test('autodetect finds the demo project token source', needsDemo, async () => {
  const { tokens } = await lint(['src/**/*.tsx'], { cwd: DEMO });

  assert.ok(tokens.sources.some(s => s.type === 'tailwind'),
    'demo-project ships a tailwind.config.js and it should be detected');
});

// this has to run against its own project rather than demo-project: that config is
// byte-for-byte DEFAULT_CONFIG, so no assertion against it can tell "config loaded"
// apart from "fell back to defaults"
test('a rule switched off in the config really is switched off', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dl-config-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'src'), { recursive: true });

  writeFileSync(join(dir, 'src/App.tsx'),
    `export default () => <div className="p-[15px]" style={{ color: '#ff0000' }} />;\n`);
  writeFileSync(join(dir, 'tailwind.config.js'),
    `module.exports = { theme: { colors: { brand: '#6366f1' } } };`);

  const before = await lint(['src/**/*.tsx'], { cwd: dir });
  assert.ok(before.violations.some(v => v.rule === 'color-tokens'), 'baseline: the rule fires');
  assert.ok(before.violations.some(v => v.rule === 'spacing-scale'));

  writeFileSync(join(dir, 'design-lint.config.js'),
    `export default { rules: { 'color-tokens': 'off' } };`);

  const after = await lint(['src/**/*.tsx'], { cwd: dir });
  assert.ok(!after.violations.some(v => v.rule === 'color-tokens'),
    'color-tokens was disabled in the config and must not report');
  assert.ok(after.violations.some(v => v.rule === 'spacing-scale'),
    'the rules left alone should still report');
});

test('a caller-supplied config still gets the default ignore list', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dl-ignore-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'node_modules/evil/src'), { recursive: true });

  writeFileSync(join(dir, 'src/App.tsx'),
    `export default () => <div style={{ color: '#ff0000' }} />;\n`);
  writeFileSync(join(dir, 'node_modules/evil/src/Bad.tsx'),
    `export default () => <div style={{ color: '#00ff00' }} />;\n`);
  writeFileSync(join(dir, 'tailwind.config.js'),
    `module.exports = { theme: { colors: { brand: '#6366f1' } } };`);

  // passing a config used to skip mergeConfig entirely, so `ignore` fell back to []
  // and a broad pattern happily linted every dependency in node_modules
  const { violations, fileCount } = await lint(['**/*.tsx'], {
    cwd: dir,
    config: { rules: { 'color-tokens': 'error' } }
  });

  assert.equal(fileCount, 1, 'only the project file, not node_modules');
  assert.ok(!violations.some(v => v.file.includes('node_modules')),
    'dependencies must never be linted');
});

// KNOWN GAP. src/config.js builds the import specifier as 'file://' + configPath, which
// is only a valid URL for an absolute path. with a relative cwd node rejects it with
// `File URL host must be "localhost" or empty`, loadConfig swallows the warning and
// silently falls back to DEFAULT_CONFIG, so a project's rules are quietly ignored.
test('config loads when cwd is relative', { todo: "'file://' + path is invalid for relative paths" }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dl-relcfg-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src/App.tsx'),
    `export default () => <div style={{ color: '#ff0000' }} />;\n`);
  writeFileSync(join(dir, 'tailwind.config.js'),
    `module.exports = { theme: { colors: { brand: '#6366f1' } } };`);
  writeFileSync(join(dir, 'design-lint.config.js'),
    `export default { rules: { 'color-tokens': 'off' } };`);

  const relative = relative_(process.cwd(), dir);
  const { violations } = await lint(['src/**/*.tsx'], { cwd: relative });

  assert.ok(!violations.some(v => v.rule === 'color-tokens'),
    'the config disabled this rule and should be honoured regardless of cwd form');
});
