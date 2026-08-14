import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintCode } from '../../src/index.js';
import { tokens, jsx } from '../fixtures/tokens.js';

const lint = (code) => lintCode(code, { filePath: 'Demo.tsx', tokens })
  .filter(v => v.rule === 'border-radius');

test('flags an off-scale radius in a style object', () => {
  const violations = lint(jsx(`    <div style={{ borderRadius: '5px' }} />`));

  assert.equal(violations.length, 1);
  assert.equal(violations[0].severity, 'warn');
  assert.match(violations[0].message, /Border radius '5px' \(5px\)/);
});

test('accepts a radius on the scale', () => {
  // 6px is md in the built-in scale
  const violations = lint(jsx(`    <div style={{ borderRadius: '6px' }} />`));

  assert.deepEqual(violations, []);
});

test('flags an arbitrary tailwind radius class', () => {
  const violations = lint(jsx(`    <div className="rounded-[5px]" />`));

  assert.equal(violations.length, 1);
  assert.equal(violations[0].value, 'rounded-[5px]');
  assert.match(violations[0].suggestion, /rounded-/);
});

test('accepts an arbitrary radius class that lands on the scale', () => {
  const violations = lint(jsx(`    <div className="rounded-[8px]" />`));

  assert.deepEqual(violations, []);
});

test('handles side-specific radius classes', () => {
  const violations = lint(jsx(`    <div className="rounded-tl-[5px]" />`));

  assert.equal(violations.length, 1);
  assert.equal(violations[0].value, 'rounded-tl-[5px]');
});

test('accepts named tailwind radius classes untouched', () => {
  const violations = lint(jsx(`    <div className="rounded-lg rounded-full" />`));

  assert.deepEqual(violations, [], 'named classes are already on the scale');
});

test('picks up project radius tokens beyond the built-in scale', () => {
  const withOdd = { ...tokens, borderRadius: { ...tokens.borderRadius, odd: '5px' } };
  const violations = lintCode(jsx(`    <div className="rounded-[5px]" />`), {
    filePath: 'Demo.tsx',
    tokens: withOdd
  }).filter(v => v.rule === 'border-radius');

  assert.deepEqual(violations, []);
});
