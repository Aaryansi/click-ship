import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fingerprint, toCounts, writeBaseline, readBaseline, classify } from '../src/baseline.js';
import { lintCode } from '../src/index.js';

const violation = (over = {}) => ({
  file: 'src/App.tsx',
  rule: 'color-tokens',
  value: '#ff0000',
  ...over
});

test('the fingerprint ignores the line number', () => {
  const line = `  <div style={{ color: '#ff0000' }} />`;

  assert.equal(
    fingerprint(violation({ line: 4 }), line),
    fingerprint(violation({ line: 91 }), line),
    'the same violation moved down a file is still the same violation'
  );
});

test('the fingerprint ignores indentation', () => {
  const tight = `<div style={{ color: '#ff0000' }} />`;
  const indented = `            ${tight}`;

  assert.equal(fingerprint(violation(), tight), fingerprint(violation(), indented));
});

test('the fingerprint separates violations that differ', () => {
  const line = `<div style={{ color: '#ff0000' }} />`;
  const base = fingerprint(violation(), line);

  assert.notEqual(base, fingerprint(violation({ file: 'src/Other.tsx' }), line), 'different file');
  assert.notEqual(base, fingerprint(violation({ rule: 'typography' }), line), 'different rule');
  assert.notEqual(base, fingerprint(violation({ value: '#00ff00' }), line), 'different value');
  assert.notEqual(base, fingerprint(violation(), `<span style={{ color: '#ff0000' }} />`), 'different line text');
});

test('fields cannot be smeared into one another', () => {
  // the fields can contain spaces, so a space separator is not a boundary: these two
  // join to the identical string under one and would share an identity
  assert.notEqual(
    fingerprint({ file: 'src/My App.tsx', rule: 'color-tokens', value: 'x' }, ''),
    fingerprint({ file: 'src/My', rule: 'App.tsx color-tokens', value: 'x' }, '')
  );

  // and the same with the class value, which routinely contains no spaces but may
  assert.notEqual(
    fingerprint({ file: 'a', rule: 'b c', value: 'd' }, ''),
    fingerprint({ file: 'a', rule: 'b', value: 'c d' }, '')
  );
});

test('counts track duplicates rather than collapsing them', () => {
  const line = `<div style={{ color: '#ff0000' }} />`;
  const one = { ...violation(), fingerprint: fingerprint(violation(), line) };

  const counts = toCounts([one, { ...one }, { ...one }]);
  assert.equal(counts.size, 1);
  assert.equal([...counts.values()][0], 3);
});

test('classify with no baseline treats everything as new', () => {
  const items = [{ fingerprint: 'a' }, { fingerprint: 'b' }];
  const { known, added, fixed } = classify(items, null);

  assert.equal(known.length, 0);
  assert.equal(added.length, 2);
  assert.equal(fixed, 0);
});

test('classify splits known from new', () => {
  const baseline = { counts: { a: 1, b: 1 } };
  const { known, added, fixed } = classify(
    [{ fingerprint: 'a' }, { fingerprint: 'c' }],
    baseline
  );

  assert.deepEqual(known.map(v => v.fingerprint), ['a']);
  assert.deepEqual(added.map(v => v.fingerprint), ['c']);
  assert.equal(fixed, 1, 'b was in the baseline and is gone');
});

test('classify counts a partial fix of a duplicated violation', () => {
  // three identical violations recorded, two remain, so one was genuinely fixed
  const { known, added, fixed } = classify(
    [{ fingerprint: 'a' }, { fingerprint: 'a' }],
    { counts: { a: 3 } }
  );

  assert.equal(known.length, 2);
  assert.equal(added.length, 0);
  assert.equal(fixed, 1);
});

test('a fourth copy of a triple-recorded violation counts as new', () => {
  const { known, added } = classify(
    Array.from({ length: 4 }, () => ({ fingerprint: 'a' })),
    { counts: { a: 3 } }
  );

  assert.equal(known.length, 3);
  assert.equal(added.length, 1, 'the extra one is new debt');
});

test('a baseline round-trips through disk', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dl-baseline-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, '.design-lint-baseline.json');

  const items = [{ fingerprint: 'a' }, { fingerprint: 'a' }, { fingerprint: 'b' }];
  const written = writeBaseline(path, items);
  assert.equal(written.total, 3);

  const read = readBaseline(path);
  assert.equal(read.counts.a, 2);
  assert.equal(read.counts.b, 1);
  assert.equal(classify(items, read).added.length, 0, 'its own output is fully known');
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
  writeFileSync(path, JSON.stringify({ version: 99, counts: { a: 1 } }));

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
