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

// ---- what --fix is allowed to rewrite ----

const fixTokens = { colors: { 'blue-500': '#3b82f6', brand: '#6366f1' } };
const lintFix = (code) => lintCode(code, { filePath: 'Demo.tsx', tokens: fixTokens })
  .filter(v => v.rule === 'color-tokens');

test('offers a fix when the token is perceptually identical', () => {
  // one step off #3b82f6, nobody can see the difference
  const [violation] = lintFix(jsx(`    <div className="bg-[#3b82f7]" />`));

  assert.deepEqual(violation.fix, { oldValue: 'bg-[#3b82f7]', newValue: 'bg-blue-500' });
});

test('offers a fix on an exact match', () => {
  const [violation] = lintFix(jsx(`    <div className="text-[#6366f1]" />`));

  assert.deepEqual(violation.fix, { oldValue: 'text-[#6366f1]', newValue: 'text-brand' });
});

test('refuses to rewrite a colour anyone could see change', () => {
  // #4f46e5 is indigo, visibly not #3b82f6. the old raw-sRGB threshold of 50 would
  // have called it a match and rewritten it.
  const [violation] = lintFix(jsx(`    <div className="border-[#4f46e5]" />`));

  assert.ok(violation, 'still reported');
  assert.equal(violation.fix, undefined, 'but never rewritten');
});

test('keeps the utility prefix when rewriting', () => {
  const violations = lintFix(jsx(`    <div className="bg-[#3b82f7] text-[#3b82f7] ring-[#3b82f7]" />`));

  assert.deepEqual(
    violations.map(v => v.fix?.newValue),
    ['bg-blue-500', 'text-blue-500', 'ring-blue-500']
  );
});

test('never offers a fix for a hardcoded value in a style object', () => {
  // swapping in a token name there would need an import and a JS reference, so it is
  // reported but left for a human
  const [violation] = lintFix(jsx(`    <div style={{ color: '#3b82f7' }} />`));

  assert.ok(violation);
  assert.equal(violation.fix, undefined);
});
