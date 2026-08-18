import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDrift, normalizeTokenName, countUsages } from '../src/drift.js';
import { formatDrift } from '../src/reporters/drift.js';

const tokensFor = (tailwind, figma) => ({
  bySource: {
    tailwind: { colors: {}, spacing: {}, borderRadius: {}, typography: { fontSize: {} }, ...tailwind },
    figma: { colors: {}, spacing: {}, borderRadius: {}, typography: { fontSize: {} }, ...figma }
  }
});

test('normalizes the two naming conventions onto each other', () => {
  // figma exports carry a set name and a category prefix, tailwind configs do not
  assert.equal(normalizeTokenName('global.color-primary'), normalizeTokenName('primary'));
  assert.equal(normalizeTokenName('core.colors.brand.500'), normalizeTokenName('brand-500'));
  assert.equal(normalizeTokenName('semantic.radius-lg'), normalizeTokenName('lg'));
  assert.equal(normalizeTokenName('global.space-md'), normalizeTokenName('md'));
});

test('a name made only of category words keeps something to match on', () => {
  // otherwise `global.color` would normalize to '' and collide with every other
  assert.notEqual(normalizeTokenName('global.color'), '');
  assert.notEqual(normalizeTokenName('global.color'), normalizeTokenName('global.spacing'));
});

test('distinct tokens do not collapse together', () => {
  assert.notEqual(normalizeTokenName('color-primary'), normalizeTokenName('color-secondary'));
  assert.notEqual(normalizeTokenName('brand-500'), normalizeTokenName('brand-600'));
});

test('reports a token whose value diverged', () => {
  const { drifted, compared } = findDrift(tokensFor(
    { colors: { primary: '#3b82f6' } },
    { colors: { 'global.color-primary': '#2563eb' } }
  ));

  assert.equal(compared, 1);
  assert.equal(drifted.length, 1);
  assert.equal(drifted[0].codeValue, '#3b82f6');
  assert.equal(drifted[0].figmaValue, '#2563eb');
  assert.equal(drifted[0].visible, true);
});

test('an invisible difference is still drift', () => {
  // this is the case worth catching: nobody sees it, nobody fixes it, and the two
  // sources keep separating
  const { drifted } = findDrift(tokensFor(
    { colors: { primary: '#3b82f6' } },
    { colors: { 'global.color-primary': '#3b82f9' } }
  ));

  assert.equal(drifted.length, 1);
  assert.equal(drifted[0].visible, false, 'flagged, but marked as not noticeable');
});

test('the same colour written differently is not drift', () => {
  const { drifted, compared } = findDrift(tokensFor(
    { colors: { white: '#FFF', brand: 'rgb(59, 130, 246)' } },
    { colors: { 'global.color-white': '#ffffff', 'global.color-brand': '#3b82f6' } }
  ));

  assert.equal(compared, 2);
  assert.deepEqual(drifted, [], 'notation is not disagreement');
});

test('the same length in different units is not drift', () => {
  const { drifted } = findDrift(tokensFor(
    { spacing: { md: '16px' } },
    { spacing: { 'global.space-md': '1rem' } }
  ));

  assert.deepEqual(drifted, []);
});

test('a genuine spacing difference is reported in pixels', () => {
  const { drifted } = findDrift(tokensFor(
    { spacing: { lg: '24px' } },
    { spacing: { 'global.space-lg': '20px' } }
  ));

  assert.equal(drifted.length, 1);
  assert.match(drifted[0].detail, /24px vs 20px/);
});

test('tokens that exist on only one side are skipped rather than reported', () => {
  // a token Figma has and the code does not is a different problem from drift, and
  // reporting it here would bury the actual disagreements
  const { drifted, compared } = findDrift(tokensFor(
    { colors: { primary: '#3b82f6' } },
    { colors: { 'global.color-primary': '#3b82f6', 'global.color-unused': '#123456' } }
  ));

  assert.equal(compared, 1);
  assert.equal(drifted.length, 0);
});

test('says there is nothing to compare rather than claiming agreement', () => {
  const noFigma = findDrift({ bySource: { tailwind: { colors: { a: '#000000' } } } });
  assert.equal(noFigma.available, false);

  const noCode = findDrift({ bySource: { figma: { colors: { a: '#000000' } } } });
  assert.equal(noCode.available, false);
  assert.equal(noCode.reason, 'no code tokens');
});

test('missing token data does not throw', () => {
  assert.equal(findDrift({}).available, false);
  assert.equal(findDrift(undefined).available, false);
});

test('counts how often a token is actually used', () => {
  const sources = [
    `<div className="bg-primary text-primary" />`,
    `<span className="border-primary" />`,
    `const x = 'primarySchool';`
  ];

  assert.equal(countUsages(sources, 'primary'), 3, 'three utility classes, not the unrelated word');
});

test('counts a css variable reference', () => {
  assert.equal(countUsages(['color: var(--color-brand);'], 'color-brand'), 1);
});

test('a token nobody uses counts zero', () => {
  assert.equal(countUsages([`<div className="bg-other" />`], 'primary'), 0);
});

test('the report distinguishes agreement from having nothing to say', () => {
  const agreed = formatDrift([], { compared: 12, codeSources: ['tailwind'] });
  assert.match(agreed, /agree on all 12/);
});

test('the report leads with the values and where they came from', () => {
  const output = formatDrift(
    [{
      category: 'colors',
      codeName: 'primary', codeValue: '#3b82f6', codeSource: 'tailwind',
      figmaName: 'global.color-primary', figmaValue: '#2563eb',
      visible: true, detail: 'ΔE 0.0823, visible', usages: 7
    }],
    { compared: 5, codeSources: ['tailwind'] }
  );

  assert.match(output, /1 token drifted/);
  assert.match(output, /#3b82f6/);
  assert.match(output, /#2563eb/);
  assert.match(output, /7 usages/);
  assert.match(output, /noticeable side by side/);
});
