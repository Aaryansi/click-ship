import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format } from '../../src/reporters/index.js';
import { describeSources } from '../../src/reporters/console.js';

// chalk emits escape codes when it detects a tty; under `node --test` it does not, so
// the output compared here is plain text
const violations = [
  {
    rule: 'color-tokens',
    severity: 'error',
    message: "Hardcoded color '#ff0000' should use a design token",
    file: 'src/Button.tsx',
    line: 6,
    column: 8,          // babel, 0-based
    value: '#ff0000',
    suggestion: "Use 'error' (#ef4444)"
  },
  {
    rule: 'spacing-scale',
    severity: 'warn',
    message: "Spacing value '15px' (15px) is not in the spacing scale",
    file: 'src/Button.tsx',
    line: 7,
    column: 0,          // the very start of the line
    value: '15px'
  }
];

test('reports columns 1-based, the way editors and eslint do', () => {
  const output = format(violations, 'console');

  assert.match(output, /6:9/, '0-based 8 is column 9 to a human');
  assert.match(output, /7:1/, '0-based 0 is column 1, never 0');
  assert.doesNotMatch(output, /\b7:0\b/);
});

test('groups violations under their file', () => {
  const output = format(violations, 'console');

  assert.match(output, /src\/Button\.tsx/);
  assert.equal(output.match(/src\/Button\.tsx/g).length, 1, 'one heading, not one per violation');
});

test('shows the message and the rule that produced it', () => {
  const output = format(violations, 'console');

  assert.match(output, /Hardcoded color/);
  assert.match(output, /\[color-tokens\]/);
  assert.match(output, /\[spacing-scale\]/);
});

test('a clean run says so instead of printing an empty list', () => {
  const output = format([], 'console');

  assert.match(output, /No design system violations found/i);
});

test('survives a violation with no position at all', () => {
  const output = format([{ rule: 'r', severity: 'error', message: 'm', file: 'a.tsx' }], 'console');

  assert.doesNotMatch(output, /undefined/, 'a missing line or column must not print as undefined');
});

test('pluralises the heading correctly', () => {
  const one = format([violations[0]], 'console');
  const two = format(violations, 'console');

  assert.match(one, /1 Design System Violation\b/);
  assert.doesNotMatch(one, /1 Design System Violations/);
  assert.match(two, /2 Design System Violations/);
});

// ---- what design system did it actually use ----

test('says which token sources it found', () => {
  const output = describeSources({
    sources: [{ type: 'tailwind', path: '/repo/tailwind.config.js' }],
    colors: { primary: '#3b82f6' }, spacing: { 4: '16px' }
  });

  assert.match(output, /tailwind/);
  assert.match(output, /tailwind\.config\.js/);
  assert.match(output, /2 tokens/);
});

test('finding no tokens is said out loud, not passed over', () => {
  // this is the failure that looks exactly like success: every rule falls back to
  // built-in defaults and reports confidently against a design system that is not yours
  const output = describeSources({ sources: [], colors: {} });

  assert.match(output, /No design tokens found/);
  assert.match(output, /built-in defaults/);
});

test('a clean run still reports what it checked against', () => {
  const output = format([], 'console', { tokens: { sources: [{ type: 'tailwind', path: 'a.js' }], colors: { a: '#fff' } } });

  assert.match(output, /Tokens from/, 'a green run against nothing is the one to be suspicious of');
  assert.match(output, /No design system violations/);
});

test('the suggestion is shown without asking for it', () => {
  const output = format(
    [{ rule: 'color-tokens', severity: 'error', message: 'Hardcoded color', file: 'a.tsx', line: 1, column: 0, suggestion: "Use 'primary'" }],
    'console'
  );

  // hiding the actionable half behind -v meant the common run said there was a problem
  // and not what to do about it
  assert.match(output, /Use 'primary'/);
});

test('verbose gives the full path, since a basename cannot answer "which one"', () => {
  const tokens = { sources: [{ type: 'css-vars', path: ['/repo/apps/web/globals.css'] }], colors: {} };

  assert.doesNotMatch(describeSources(tokens), /apps\/web/);
  assert.match(describeSources(tokens, { verbose: true }), /apps\/web\/globals\.css/);
});
