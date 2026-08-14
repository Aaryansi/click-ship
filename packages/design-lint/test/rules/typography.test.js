import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintCode } from '../../src/index.js';
import { tokens, jsx } from '../fixtures/tokens.js';

const lint = (code) => lintCode(code, { filePath: 'Demo.tsx', tokens })
  .filter(v => v.rule === 'typography');

test('flags an off-scale font size', () => {
  const violations = lint(jsx(`    <div style={{ fontSize: 13 }} />`));

  assert.equal(violations.length, 1);
  assert.equal(violations[0].severity, 'error');
  assert.match(violations[0].message, /Font size '13' \(13px\)/);
});

test('accepts a font size on the scale', () => {
  const violations = lint(jsx(`    <div style={{ fontSize: 16 }} />`));

  assert.deepEqual(violations, []);
});

test('flags an arbitrary tailwind text size', () => {
  const violations = lint(jsx(`    <div className="text-[13px]" />`));

  assert.equal(violations.length, 1);
  assert.equal(violations[0].value, 'text-[13px]');
  assert.equal(violations[0].severity, 'error');
});

test('accepts an arbitrary text size that lands on the scale', () => {
  const violations = lint(jsx(`    <div className="text-[16px]" />`));

  assert.deepEqual(violations, []);
});

test('flags a non-standard font weight as a warning, not an error', () => {
  const violations = lint(jsx(`    <div style={{ fontWeight: 550 }} />`));

  assert.equal(violations.length, 1);
  assert.equal(violations[0].severity, 'warn');
  assert.match(violations[0].message, /Font weight '550'/);
});

test('accepts a standard font weight', () => {
  const violations = lint(jsx(`    <div style={{ fontWeight: 600 }} />`));

  assert.deepEqual(violations, []);
});

test('converts rem font sizes before checking', () => {
  const onScale = lint(jsx(`    <div style={{ fontSize: '1rem' }} />`));
  assert.deepEqual(onScale, []);

  const offScale = lint(jsx(`    <div style={{ fontSize: '0.8rem' }} />`));
  assert.equal(offScale.length, 1);
  assert.match(offScale[0].message, /12\.8px/);
});

test('does not confuse an arbitrary colour class for a text size', () => {
  const violations = lint(jsx(`    <div className="text-[#333333]" />`));

  assert.deepEqual(violations, [], 'text-[#333333] is a colour, not a size');
});
