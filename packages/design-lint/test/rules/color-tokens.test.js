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

// bySource matters: a fix may only name a class tailwind actually generates, so a
// fixture without provenance is correctly refused
const fixPalette = { 'blue-500': '#3b82f6', brand: '#6366f1' };
const fixTokens = { colors: fixPalette, bySource: { tailwind: { colors: fixPalette } } };
const lintFix = (code) => lintCode(code, { filePath: 'Demo.tsx', tokens: fixTokens })
  .filter(v => v.rule === 'color-tokens');

test('offers a fix when the token is perceptually identical', () => {
  // one step off #3b82f6, nobody can see the difference
  const code = jsx(`    <div className="bg-[#3b82f7]" />`);
  const [violation] = lintFix(code);

  assert.equal(violation.fix.newValue, 'bg-blue-500');
  assert.equal(code.slice(violation.fix.start, violation.fix.end), 'bg-[#3b82f7]');
});

test('offers a fix on an exact match', () => {
  const code = jsx(`    <div className="text-[#6366f1]" />`);
  const [violation] = lintFix(code);

  assert.equal(violation.fix.newValue, 'text-brand');
  assert.equal(code.slice(violation.fix.start, violation.fix.end), 'text-[#6366f1]');
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

// ---- guarantees --fix has to keep, from the review of #16 ----

const tailwindOnly = {
  colors: { 'blue-500': '#3b82f6', 'gray-50': '#fafafa' },
  bySource: { tailwind: { colors: { 'blue-500': '#3b82f6', 'gray-50': '#fafafa' } } }
};
const lintTw = (code) => lintCode(code, { filePath: 'Demo.tsx', tokens: tailwindOnly })
  .filter(v => v.rule === 'color-tokens');

test('never rewrites a translucent colour to an opaque token', () => {
  // a 50% scrim becoming solid is a visible change, and the hex compares as identical
  for (const cls of ['bg-[#3b82f680]', 'bg-[rgba(59,130,246,0.5)]', 'bg-[rgb(59 130 246 / 50%)]']) {
    const [violation] = lintTw(jsx(`    <div className="${cls}" />`));
    assert.equal(violation?.fix, undefined, `${cls} must not be rewritten`);
  }
});

test('never rewrites to a token name tailwind did not generate', () => {
  const cssVarTokens = {
    colors: { 'color-brand-primary': '#3b82f6' },
    bySource: { 'css-vars': { colors: { 'color-brand-primary': '#3b82f6' } } }
  };

  const [violation] = lintCode(jsx(`    <div className="bg-[#3b82f6]" />`), {
    filePath: 'Demo.tsx',
    tokens: cssVarTokens
  }).filter(v => v.rule === 'color-tokens');

  assert.ok(violation, 'still reported');
  // bg-color-brand-primary is not a class tailwind emits, so the element would end up
  // with no background at all
  assert.equal(violation.fix, undefined);
});

test('does not rewrite white to off-white', () => {
  const [violation] = lintTw(jsx(`    <div className="bg-[#ffffff]" />`));

  assert.equal(violation.fix, undefined, 'a white page must not quietly turn grey');
});

test('points at the class, not at the className attribute', () => {
  const line = `    <div className="bg-[#3b82f7]" />`;
  const [violation] = lintTw(jsx(line));

  assert.equal(violation.column, line.indexOf('bg-[#3b82f7]'),
    'the column should land on the offending class');
});

test('the fix carries the exact source range', () => {
  const code = jsx(`    <div className="bg-[#3b82f7]" />`);
  const [violation] = lintTw(code);

  assert.equal(code.slice(violation.fix.start, violation.fix.end), 'bg-[#3b82f7]',
    'the recorded range must cover exactly the class being replaced');
});
