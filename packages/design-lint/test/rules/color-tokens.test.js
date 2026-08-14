import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintCode } from '../../src/index.js';
import { tokens, jsx } from '../fixtures/tokens.js';

const lint = (code) => lintCode(code, { filePath: 'Demo.tsx', tokens })
  .filter(v => v.rule === 'color-tokens');

test('flags a hardcoded hex in a style object', () => {
  const violations = lint(jsx(`    <div style={{ color: '#ff0000' }} />`));

  assert.equal(violations.length, 1);
  assert.equal(violations[0].severity, 'error');
  assert.equal(violations[0].value, '#ff0000');
  assert.match(violations[0].message, /Hardcoded color '#ff0000'/);
});

test('flags an arbitrary tailwind colour class', () => {
  const violations = lint(jsx(`    <div className="bg-[#f0f0f0] p-4" />`));

  assert.equal(violations.length, 1);
  assert.equal(violations[0].value, 'bg-[#f0f0f0]');
  assert.match(violations[0].message, /Arbitrary color/);
});

test('flags every arbitrary colour on one element, not just the first', () => {
  const violations = lint(jsx(`    <div className="bg-[#f0f0f0] text-[#333333] border-[#666666]" />`));

  assert.equal(violations.length, 3);
  assert.deepEqual(
    violations.map(v => v.value),
    ['bg-[#f0f0f0]', 'text-[#333333]', 'border-[#666666]']
  );
});

test('passes on css variables and keywords', () => {
  const violations = lint(jsx(`    <div style={{ color: 'var(--color-primary)', backgroundColor: 'transparent' }} />`));

  assert.deepEqual(violations, []);
});

test('ignores colour-shaped values on non-colour properties', () => {
  const violations = lint(jsx(`    <div style={{ content: '#ff0000' }} />`));

  assert.deepEqual(violations, []);
});

test('suggests the exact token when the literal already matches one', () => {
  // still a violation: the point is to use the token, not to retype its value
  const violations = lint(jsx(`    <div style={{ color: '#6366f1' }} />`));

  assert.equal(violations.length, 1);
  assert.match(violations[0].suggestion, /primary/);
});

test('reports nothing when the project has no colour tokens to compare against', () => {
  const violations = lintCode(jsx(`    <div style={{ color: '#ff0000' }} />`), {
    filePath: 'Demo.tsx',
    tokens: { colors: {} }
  }).filter(v => v.rule === 'color-tokens');

  assert.deepEqual(violations, []);
});

test('reports a usable line number', () => {
  const violations = lint(jsx(`    <div\n      style={{ color: '#ff0000' }}\n    />`));

  assert.equal(violations.length, 1);
  assert.ok(violations[0].line > 0, 'line should be 1-indexed and positive');
  assert.equal(violations[0].file, 'Demo.tsx');
});
