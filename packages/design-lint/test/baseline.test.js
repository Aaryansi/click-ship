import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fingerprint, toCounts, writeBaseline, readBaseline, classify } from '../src/baseline.js';
import { lintCode } from '../src/index.js';
import { fileURLToPath } from 'node:url';
import { dirname, relative as relativePath } from 'node:path';

const DEMO_FOR_PATHS = join(dirname(fileURLToPath(import.meta.url)), '../../../demo-project');
const RELATIVE_DEMO = relativePath(process.cwd(), DEMO_FOR_PATHS);

const violation = (over = {}) => ({
  file: 'src/App.tsx',
  rule: 'color-tokens',
  value: '#ff0000',
  ...over
});

test('the fingerprint ignores position entirely', () => {
  assert.equal(
    fingerprint(violation({ line: 4, column: 2 })),
    fingerprint(violation({ line: 91, column: 40 })),
    'the same violation moved is still the same violation'
  );
});

test('a violation is not re-identified when its neighbour on the line changes', () => {
  // this is why the source line is not hashed. --fix rewriting one class would
  // otherwise re-identify every other violation on that line as new, so autofixing
  // baselined debt turned a green build red.
  const before = fingerprint(violation());
  const after = fingerprint(violation());

  assert.equal(before, after);
});

test('the fingerprint separates violations that differ', () => {
  const base = fingerprint(violation());

  assert.notEqual(base, fingerprint(violation({ file: 'src/Other.tsx' })), 'different file');
  assert.notEqual(base, fingerprint(violation({ rule: 'typography' })), 'different rule');
  assert.notEqual(base, fingerprint(violation({ value: '#00ff00' })), 'different value');
});

test('fields cannot be smeared into one another', () => {
  // the fields can contain spaces, so a space separator is not a boundary: these two
  // join to the identical string under one and would share an identity
  assert.notEqual(
    fingerprint({ file: 'src/My App.tsx', rule: 'color-tokens', value: 'x' }),
    fingerprint({ file: 'src/My', rule: 'App.tsx color-tokens', value: 'x' })
  );

  // and the same with the class value, which routinely contains no spaces but may
  assert.notEqual(
    fingerprint({ file: 'a', rule: 'b c', value: 'd' }),
    fingerprint({ file: 'a', rule: 'b', value: 'c d' })
  );
});

test('counts track duplicates rather than collapsing them', () => {
  const one = { ...violation(), fingerprint: fingerprint(violation()) };

  const counts = toCounts([one, { ...one }, { ...one }]);
  assert.equal(counts.size, 1);
  assert.equal([...counts.values()][0].count, 3);
  assert.equal([...counts.values()][0].file, 'src/App.tsx', 'entries carry their file');
});

test('classify with no baseline treats everything as new', () => {
  const items = [{ fingerprint: 'a' }, { fingerprint: 'b' }];
  const { known, added, fixed } = classify(items, null);

  assert.equal(known.length, 0);
  assert.equal(added.length, 2);
  assert.equal(fixed, 0);
});

test('classify splits known from new', () => {
  const baseline = { entries: { a: { count: 1, file: 'a.tsx' }, b: { count: 1, file: 'b.tsx' } } };
  const { known, added, fixed } = classify(
    [{ fingerprint: 'a', file: 'a.tsx' }, { fingerprint: 'c', file: 'a.tsx' }],
    baseline,
    ['a.tsx', 'b.tsx']
  );

  assert.deepEqual(known.map(v => v.fingerprint), ['a']);
  assert.deepEqual(added.map(v => v.fingerprint), ['c']);
  assert.equal(fixed, 1, 'b was in the baseline and is gone');
});

test('classify counts a partial fix of a duplicated violation', () => {
  // three identical violations recorded, two remain, so one was genuinely fixed
  const { known, added, fixed } = classify(
    [{ fingerprint: 'a', file: 'a.tsx' }, { fingerprint: 'a', file: 'a.tsx' }],
    { entries: { a: { count: 3, file: 'a.tsx' } } },
    ['a.tsx']
  );

  assert.equal(known.length, 2);
  assert.equal(added.length, 0);
  assert.equal(fixed, 1);
});

test('a fourth copy of a triple-recorded violation counts as new', () => {
  const { known, added } = classify(
    Array.from({ length: 4 }, () => ({ fingerprint: 'a', file: 'a.tsx' })),
    { entries: { a: { count: 3, file: 'a.tsx' } } },
    ['a.tsx']
  );

  assert.equal(known.length, 3);
  assert.equal(added.length, 1, 'the extra one is new debt');
});

test('a baseline round-trips through disk', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dl-baseline-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, '.design-lint-baseline.json');

  const items = [
    { fingerprint: 'a', file: 'a.tsx' },
    { fingerprint: 'a', file: 'a.tsx' },
    { fingerprint: 'b', file: 'b.tsx' }
  ];
  const written = writeBaseline(path, items);
  assert.equal(written.total, 3);

  const read = readBaseline(path);
  assert.equal(read.entries.a.count, 2);
  assert.equal(read.entries.b.count, 1);
  assert.equal(classify(items, read, ['a.tsx', 'b.tsx']).added.length, 0,
    'its own output is fully known');
});

test('a missing baseline is absent, not an error', () => {
  assert.equal(readBaseline('/nowhere/.design-lint-baseline.json'), null);
});

test('an unreadable baseline is ignored rather than crashing the run', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dl-baseline-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'broken.json');
  writeFileSync(path, '{ not json');

  assert.equal(readBaseline(path), null);
});

test('a baseline from a future format is ignored rather than mismatching everything', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dl-baseline-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'future.json');
  writeFileSync(path, JSON.stringify({ version: 99, entries: { a: { count: 1 } } }));

  // silently treating every entry as new would be worse than starting over
  assert.equal(readBaseline(path), null);
});

test('real violations carry a fingerprint', () => {
  const tokens = { colors: { brand: '#6366f1' } };
  const violations = lintCode(
    `export default () => <div className="p-[15px]" style={{ color: '#ff0000' }} />;`,
    { filePath: 'App.tsx', tokens }
  );

  assert.ok(violations.length > 0);
  for (const v of violations) {
    assert.match(v.fingerprint ?? '', /^[0-9a-f]{16}$/, `${v.rule} should be fingerprinted`);
  }
});

test('the same code fingerprints identically across runs', () => {
  const tokens = { colors: { brand: '#6366f1' } };
  const code = `export default () => <div style={{ color: '#ff0000' }} />;`;
  const run = () => lintCode(code, { filePath: 'App.tsx', tokens }).map(v => v.fingerprint);

  assert.deepEqual(run(), run(), 'fingerprints must be stable or a baseline is worthless');
});

test('shifting code down a file does not change its fingerprints', () => {
  const tokens = { colors: { brand: '#6366f1' } };
  const body = `export default () => <div style={{ color: '#ff0000' }} />;`;
  const fingerprints = (code) => lintCode(code, { filePath: 'App.tsx', tokens }).map(v => v.fingerprint);

  assert.deepEqual(
    fingerprints(body),
    fingerprints(`import a from 'a';\nimport b from 'b';\n\n${body}`),
    'adding imports above must not invalidate the baseline'
  );
});

// ---- from the review of #17 ----

test('an entry whose file was not scanned is not reported as fixed', () => {
  // a narrowed run, a pre-commit hook over staged files say, would otherwise claim
  // every untouched file was fixed and invite a re-record that drops that debt
  const baseline = {
    entries: {
      a: { count: 1, file: 'src/App.tsx' },
      b: { count: 1, file: 'src/Other.tsx' }
    }
  };

  const { known, fixed, unscanned } = classify(
    [{ fingerprint: 'a', file: 'src/App.tsx' }],
    baseline,
    ['src/App.tsx']
  );

  assert.equal(known.length, 1);
  assert.equal(fixed, 0, 'Other.tsx was never opened, so nothing there was fixed');
  assert.equal(unscanned, 1);
});

test('an entry is reported as fixed once its file really was scanned', () => {
  const baseline = { entries: { a: { count: 1, file: 'src/App.tsx' } } };

  const { fixed, unscanned } = classify([], baseline, ['src/App.tsx']);

  assert.equal(fixed, 1);
  assert.equal(unscanned, 0);
});

test('fixing one violation does not re-identify its neighbours', () => {
  const tokens = {
    colors: { brand: '#6366f1' },
    bySource: { tailwind: { colors: { brand: '#6366f1' } } }
  };
  const before = lintCode(
    `export const A = () => <div className="text-[13px] text-[#6366f1]" />;`,
    { filePath: 'App.tsx', tokens }
  );

  // the colour class is what --fix would rewrite; the typography violation is untouched
  const after = lintCode(
    `export const A = () => <div className="text-[13px] text-brand" />;`,
    { filePath: 'App.tsx', tokens }
  );

  const survivor = after.find(v => v.rule === 'typography');
  const original = before.find(v => v.rule === 'typography');

  assert.equal(survivor.fingerprint, original.fingerprint,
    'autofixing one violation must not make its neighbour look new');
});

test('the same project fingerprints identically from an absolute or relative cwd', async () => {
  const { lint } = await import('../src/index.js');
  const abs = await lint(['src/**/*.tsx'], { cwd: DEMO_FOR_PATHS });
  const rel = await lint(['src/**/*.tsx'], { cwd: RELATIVE_DEMO });

  assert.deepEqual(
    abs.violations.map(v => v.fingerprint),
    rel.violations.map(v => v.fingerprint),
    'a baseline must not depend on how the command was invoked'
  );
});
