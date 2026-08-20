import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scanDeclarations, positionOf } from '../../src/css/declarations.js';
import { findColorLiterals, splitValues, asLength } from '../../src/css/values.js';
import { runAllRules } from '../../src/rules/index.js';

// ---- the scanner ----

const propertiesIn = (css) => scanDeclarations(css).map(d => d.property);

test('reads the declarations in a block', () => {
  const found = scanDeclarations('.a { color: red; padding: 8px; }');

  assert.deepEqual(found.map(d => [d.property, d.value]), [['color', 'red'], ['padding', '8px']]);
});

test('a custom property is a token being defined, not a violation', () => {
  // flagging `--brand: #ff0000` would mean flagging the design system for existing
  assert.deepEqual(propertiesIn(':root { --brand: #ff0000; }'), []);
});

test('a selector is not a declaration', () => {
  // `a:hover` has a colon in it and used to look exactly like one
  assert.deepEqual(propertiesIn('.a:hover { color: red; }'), ['color']);
  assert.deepEqual(propertiesIn('a::before { content: ""; }'), ['content']);
});

test('an at-rule prelude is not a declaration', () => {
  // `@media (min-width: 768px)` is the trap here
  assert.deepEqual(propertiesIn('@media (min-width: 768px) { .a { color: red; } }'), ['color']);
  assert.deepEqual(propertiesIn("@import 'x.css';"), []);
  assert.deepEqual(propertiesIn('@supports (display: grid) { .a { gap: 8px; } }'), ['gap']);
});

test('commented-out code is not linted', () => {
  assert.deepEqual(propertiesIn('/* color: #ff0000; */ .a { padding: 8px; }'), ['padding']);
  assert.deepEqual(propertiesIn('.a { // color: #ff0000;\n padding: 8px; }'), ['padding']);
});

test('a semicolon inside a string does not end the declaration', () => {
  const [declaration] = scanDeclarations('.a { font-family: "Weird;Font", sans-serif; }');

  assert.equal(declaration.value, '"Weird;Font", sans-serif');
});

test('a url is not read as a comment', () => {
  // the `//` in https:// is the reason this needs saying
  const [declaration] = scanDeclarations('.a { background: url(http://example.com/a.png); }');

  assert.equal(declaration.value, 'url(http://example.com/a.png)');
});

test('scss nesting does not confuse it', () => {
  assert.deepEqual(propertiesIn('.a { color: red; .b { padding: 8px; } margin: 0; }'),
    ['color', 'padding', 'margin']);
});

test('a declaration with no trailing semicolon still counts', () => {
  assert.deepEqual(propertiesIn('.a { color: red }'), ['color']);
});

test('offsets point at the value, not the line', () => {
  const css = '.a {\n  color: #ff0000;\n}';
  const [declaration] = scanDeclarations(css);
  const { line, column } = positionOf(css, declaration.start);

  assert.equal(css.slice(declaration.start, declaration.end), '#ff0000');
  assert.equal(line, 2);
  assert.equal(column, 9);
});

// ---- picking values apart ----

test('finds a colour anywhere in the value', () => {
  // a gradient is half correct and half not, and the wrong half still counts
  const found = findColorLiterals('linear-gradient(var(--a), #ff0000)');

  assert.equal(found.length, 1);
  assert.equal(found[0].text, '#ff0000');
});

test('finds a colour in a shorthand', () => {
  const found = findColorLiterals('1px solid #ff0000');
  assert.deepEqual(found.map(f => f.text), ['#ff0000']);
});

test('splits a shorthand but keeps functions whole', () => {
  assert.deepEqual(splitValues('8px 13px').map(p => p.text), ['8px', '13px']);
  assert.deepEqual(splitValues('calc(1rem + 2px) 0').map(p => p.text), ['calc(1rem + 2px)', '0']);
});

test('the values that are never violations are skipped', () => {
  assert.equal(asLength('0'), null, 'zero is zero in every design system');
  assert.equal(asLength('auto'), null);
  assert.equal(asLength('100%'), null, 'relative to something we cannot see');
  assert.equal(asLength('var(--space-4)'), null, 'already a token');
  assert.equal(asLength('calc(1rem * 2)'), null);
  assert.deepEqual(asLength('13px'), { number: 13, unit: 'px' });
});

// ---- the rules, end to end ----

const tokens = {
  colors: { primary: '#3b82f6', 'red-500': '#ef4444' },
  spacing: { 1: '4px', 2: '8px', 3: '12px', 4: '16px' },
  borderRadius: { md: '6px' },
  typography: { fontSize: { sm: '14px', base: '16px' }, fontWeight: {}, fontFamily: {}, lineHeight: {} },
  shadows: {},
  bySource: {}
};

const lintCSS = (code) => runAllRules({
  code,
  filePath: 'a.css',
  tokens,
  config: { rules: { 'color-tokens': 'error', 'spacing-scale': 'warn', typography: 'error', 'border-radius': 'warn' } }
});

test('a stylesheet full of hardcoded values no longer reports clean', () => {
  // this returned "No design system violations found!" before stylesheets were linted
  const violations = lintCSS('.btn { color: #ff0000; padding: 13px; border-radius: 7px; font-size: 13px; }');
  const rules = violations.map(v => v.rule).sort();

  assert.deepEqual(rules, ['border-radius', 'color-tokens', 'spacing-scale', 'typography']);
});

test('a stylesheet using its tokens reports nothing', () => {
  const violations = lintCSS('.btn { color: var(--primary); padding: 16px; border-radius: 6px; font-size: 14px; }');

  assert.deepEqual(violations, []);
});

test('the token definitions themselves are not violations', () => {
  const violations = lintCSS(':root { --brand: #ff0000; --space: 13px; }');

  assert.deepEqual(violations, [], 'a design system declaring its own values is the point');
});

test('each value in a shorthand is judged separately', () => {
  const violations = lintCSS('.a { padding: 16px 13px; }');

  assert.equal(violations.length, 1, '16px is on the scale and 13px is not');
  assert.equal(violations[0].value, '13px');
});

test('a violation in a stylesheet carries the same shape as one in jsx', () => {
  const [violation] = lintCSS('.a { color: #ff0000; }');

  // the baseline, the reporters and the action all key off these
  assert.equal(violation.rule, 'color-tokens');
  assert.equal(violation.severity, 'error');
  assert.equal(violation.file, 'a.css');
  assert.equal(violation.line, 1);
  assert.ok(violation.fingerprint, 'without this it cannot be baselined');
  assert.match(violation.suggestion, /red-500/);
});

test('a stylesheet is told what to use in css terms, not tailwind ones', () => {
  const [violation] = lintCSS('.a { border-radius: 7px; }');

  // `rounded-md` is not something anyone can paste into a stylesheet
  assert.doesNotMatch(violation.suggestion, /rounded-/);
  assert.match(violation.suggestion, /6px/);
});

test('turning a rule off turns it off in css too', () => {
  const violations = runAllRules({
    code: '.a { color: #ff0000; padding: 13px; }',
    filePath: 'a.css',
    tokens,
    config: { rules: { 'color-tokens': 'off', 'spacing-scale': 'warn' } }
  });

  assert.deepEqual(violations.map(v => v.rule), ['spacing-scale']);
});

test('scss and the other stylesheet extensions take the same path', () => {
  for (const file of ['a.scss', 'a.sass', 'a.less', 'a.pcss']) {
    const violations = runAllRules({
      code: '.a { color: #ff0000; }',
      filePath: file,
      tokens,
      config: { rules: { 'color-tokens': 'error' } }
    });

    assert.equal(violations.length, 1, `${file} was not linted`);
  }
});

test('a javascript file is still linted as javascript', () => {
  const violations = runAllRules({
    code: 'export const A = () => <div style={{ color: "#ff0000" }} />;',
    filePath: 'a.tsx',
    tokens,
    config: { rules: { 'color-tokens': 'error' } }
  });

  assert.equal(violations.length, 1, 'the css path must not have taken over');
});
