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
});

test('suggests a usable class name for an off-scale radius', () => {
  const violations = lint(jsx(`    <div className="rounded-[5px]" />`));

  // 4px (DEFAULT) and 6px (md) are equidistant from 5px and the lower wins. tailwind
  // spells DEFAULT as a bare `rounded`, so the suggestion must not carry a suffix.
  // this used to read "Use 'rounded-'" with a dangling hyphen.
  assert.equal(violations[0].suggestion, "Use 'rounded'");
});

test('suggests a named class when a named radius is closest', () => {
  const violations = lint(jsx(`    <div className="rounded-[11px]" />`));

  assert.equal(violations[0].suggestion, "Use 'rounded-xl'", '12px is xl');
});

test('the style-object suggestion is a usable class too', () => {
  const violations = lint(jsx(`    <div style={{ borderRadius: '5px' }} />`));

  assert.equal(violations[0].suggestion, "Use 'rounded' (4px)");
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
