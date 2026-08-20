import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveVars, evaluateCalc, resolveValue } from '../../src/parsers/css-value.js';

const vars = new Map([
  ['--radius', '0.625rem'],
  ['--spacing', '0.25rem'],
  ['--base', '16px'],
  ['--brand', 'oklch(0.62 0.19 260)'],
  ['--alias', 'var(--brand)'],
  ['--loop', 'var(--loop)']
]);

test('follows a var() to what it holds', () => {
  assert.equal(resolveVars('var(--base)', vars), '16px');
  assert.equal(resolveVars('1px solid var(--brand)', vars), '1px solid oklch(0.62 0.19 260)');
});

test('follows a chain of var()s', () => {
  assert.equal(resolveVars('var(--alias)', vars), 'oklch(0.62 0.19 260)');
});

test('a var() that points at itself does not hang', () => {
  // a stylesheet can be wrong, and spinning forever is not an acceptable response
  assert.equal(resolveVars('var(--loop)', vars), 'var(--loop)');
});

test('an undefined var falls back to what the browser would use', () => {
  assert.equal(resolveVars('var(--nope, 12px)', vars), '12px');
  assert.equal(resolveVars('var(--nope)', vars), 'var(--nope)', 'no fallback means nothing to say');
});

test('evaluates the calc tailwind v4 themes are built from', () => {
  // six of shadcn's seven radius tokens are exactly this shape
  assert.equal(resolveValue('calc(var(--radius) * 0.8)', vars), '0.5rem');
  assert.equal(resolveValue('calc(var(--radius) * 2.2)', vars), '1.375rem');
  assert.equal(resolveValue('calc(var(--spacing) * 4)', vars), '1rem');
});

test('handles the arithmetic around it', () => {
  assert.equal(evaluateCalc('calc(16px + 4px)'), '20px');
  assert.equal(evaluateCalc('calc(16px * 2 + 8px)'), '40px');
  assert.equal(evaluateCalc('calc((16px + 4px) / 2)'), '10px', 'parens inside calc are ordinary css');
  assert.equal(evaluateCalc('calc(calc(16px * 2) + 2px)'), '34px');
  assert.equal(evaluateCalc('calc(-1 * 16px)'), '-16px');
});

test('refuses arithmetic it cannot do honestly', () => {
  // reconciling rem against px needs a root font size nobody told us
  assert.equal(evaluateCalc('calc(1rem + 4px)'), 'calc(1rem + 4px)');
  assert.equal(evaluateCalc('calc(100% - 16px)'), 'calc(100% - 16px)');
  assert.equal(evaluateCalc('calc(16px * 2rem)'), 'calc(16px * 2rem)', 'a length times a length is not a length');
  assert.equal(evaluateCalc('calc(16px / 0)'), 'calc(16px / 0)');
});

test('malformed input comes back untouched rather than half-evaluated', () => {
  assert.equal(evaluateCalc('calc('), 'calc(');
  assert.equal(evaluateCalc('calc((16px)'), 'calc((16px)');
  assert.equal(evaluateCalc('calc(16px +)'), 'calc(16px +)');
  assert.equal(evaluateCalc('calc(url(x))'), 'calc(url(x))');
});

test('a value with no calc or var is left exactly alone', () => {
  assert.equal(resolveValue('0.5rem', vars), '0.5rem');
  assert.equal(resolveValue('oklch(0.5 0 0)', vars), 'oklch(0.5 0 0)');
  assert.equal(resolveValue('Inter, sans-serif', vars), 'Inter, sans-serif');
});

test('float noise is rounded away', () => {
  // 0.30000000000000004rem is technically correct and useless
  assert.equal(evaluateCalc('calc(0.1rem * 3)'), '0.3rem');
});
