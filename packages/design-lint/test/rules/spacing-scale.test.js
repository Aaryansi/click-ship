import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintCode } from '../../src/index.js';
import { tokens, jsx } from '../fixtures/tokens.js';

const lint = (code) => lintCode(code, { filePath: 'Demo.tsx', tokens })
  .filter(v => v.rule === 'spacing-scale');

test('flags an off-scale value in a style object', () => {
  const violations = lint(jsx(`    <div style={{ padding: '15px' }} />`));

  assert.equal(violations.length, 1);
  assert.equal(violations[0].severity, 'warn');
  assert.match(violations[0].message, /'15px' \(15px\)/);
  // 14 and 16 are both one away, and the scan keeps the first strictly-closer hit,
  // so the lower of the two wins
  assert.match(violations[0].suggestion, /Use 14px/);
});

test('accepts a value that is on the scale', () => {
  const violations = lint(jsx(`    <div style={{ padding: '16px', margin: '8px' }} />`));

  assert.deepEqual(violations, []);
});

test('flags an arbitrary tailwind spacing class', () => {
  const violations = lint(jsx(`    <div className="p-[15px]" />`));

  assert.equal(violations.length, 1);
  assert.equal(violations[0].value, 'p-[15px]');
});

test('accepts an arbitrary class that lands on the scale', () => {
  const violations = lint(jsx(`    <div className="p-[16px] mb-[8px]" />`));

  assert.deepEqual(violations, []);
});

test('converts rem to pixels before checking', () => {
  // 1rem is 16px and on the scale
  const onScale = lint(jsx(`    <div style={{ padding: '1rem' }} />`));
  assert.deepEqual(onScale, []);

  // 1.1rem is 17.6px, far enough from both 16 and 20 to be off-scale.
  // note 0.9rem would NOT flag: 14.4px sits inside the half-pixel tolerance around 14
  const offScale = lint(jsx(`    <div style={{ padding: '1.1rem' }} />`));
  assert.equal(offScale.length, 1);
  assert.match(offScale[0].message, /17\.6px/);
});

test('tolerates sub-pixel drift around a scale value', () => {
  // 0.9rem is 14.4px and the scale has 14, within the 0.5px tolerance
  const violations = lint(jsx(`    <div style={{ padding: '0.9rem' }} />`));

  assert.deepEqual(violations, []);
});

test('reads bare numbers as pixels', () => {
  const violations = lint(jsx(`    <div style={{ marginTop: 15 }} />`));

  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /15px/);
});

test('ignores spacing-shaped values on non-spacing properties', () => {
  const violations = lint(jsx(`    <div style={{ zIndex: '15px' }} />`));

  assert.deepEqual(violations, []);
});

test('picks up project spacing tokens beyond the built-in scale', () => {
  const withOdd = {
    ...tokens,
    spacing: { ...tokens.spacing, odd: '15px' }
  };
  const violations = lintCode(jsx(`    <div style={{ padding: '15px' }} />`), {
    filePath: 'Demo.tsx',
    tokens: withOdd
  }).filter(v => v.rule === 'spacing-scale');

  assert.deepEqual(violations, [], '15px is legal once the project declares it');
});
