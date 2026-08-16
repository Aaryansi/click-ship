import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format } from '../../src/reporters/index.js';

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
