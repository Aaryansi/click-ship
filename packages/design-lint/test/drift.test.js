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

// ---- from the review of #18 ----

const cat = (over = {}) => ({ colors: {}, spacing: {}, borderRadius: {}, typography: { fontSize: {} }, ...over });
const sides = (tailwind, figma) => ({ bySource: { tailwind: cat(tailwind), figma: cat(figma) } });

test('an exact name beats a normalized one', () => {
  // text-primary, border-primary and primary all normalize to `primary`, so taking
  // whichever came first paired figma's color-primary with text-primary and never
  // compared the real one
  const { drifted } = findDrift(sides(
    { colors: { 'text-primary': '#111111', primary: '#3b82f6' } },
    { colors: { 'global.color-primary': '#2563eb' } }
  ));

  assert.equal(drifted.length, 1);
  assert.equal(drifted[0].codeName, 'primary');
  assert.equal(drifted[0].codeValue, '#3b82f6');
});

test('an ambiguous normalized name is skipped rather than guessed', () => {
  // nothing here is exactly `color-primary`, and two code tokens claim the key, so
  // there is no basis to pick one
  const { drifted, compared } = findDrift(sides(
    { colors: { 'text-primary': '#111111', 'border-primary': '#222222' } },
    { colors: { 'global.color-primary': '#2563eb' } }
  ));

  assert.equal(compared, 0);
  assert.deepEqual(drifted, []);
});

test('an opacity change is drift, not agreement', () => {
  const { drifted } = findDrift(sides(
    { colors: { scrim: 'rgba(0, 0, 0, 0.5)' } },
    { colors: { 'global.color-scrim': 'rgba(0, 0, 0, 0.25)' } }
  ));

  assert.equal(drifted.length, 1, 'a designer halving a scrim must not read as agreeing');
  assert.match(drifted[0].detail, /opacity/);
});

test('the same colour at the same opacity still agrees', () => {
  const { drifted } = findDrift(sides(
    { colors: { scrim: 'rgba(0, 0, 0, 0.5)' } },
    { colors: { 'global.color-scrim': '#00000080' } }
  ));

  assert.deepEqual(drifted, [], '#00000080 is the same as rgba(0,0,0,0.5)');
});

test('a tokens studio alias is skipped, not reported as drift', () => {
  const { drifted } = findDrift(sides(
    { colors: { primary: '#3b82f6' } },
    { colors: { 'semantic.color-primary': '{core.blue.500}' } }
  ));

  assert.deepEqual(drifted, [], 'a reference is not a value to compare against');
});

test('comparing nothing is not agreement', () => {
  // a malformed export parses to an empty bag, and "agree on all 0 shared tokens"
  // is a green light nobody earned
  const empty = findDrift(sides({ colors: { primary: '#3b82f6' } }, { colors: {} }));

  assert.equal(empty.available, false);
  assert.equal(empty.reason, 'no shared tokens');
});

test('names that share nothing produce no comparison', () => {
  const unrelated = findDrift(sides(
    { colors: { primary: '#3b82f6' } },
    { colors: { 'global.color-elsewhere': '#000000' } }
  ));

  assert.equal(unrelated.available, false);
});

test('shadows are not compared, because the two formats never match', () => {
  // figma emits `0px 4px 8px 0px rgba(...)`, tailwind writes `0 4px 8px 0 rgba(...)`
  const { available } = findDrift({
    bySource: {
      tailwind: cat({ shadows: { md: '0 4px 8px 0 rgba(0,0,0,0.1)' } }),
      figma: cat({ shadows: { 'global.shadow-md': '0px 4px 8px 0px rgba(0,0,0,0.1)' } })
    }
  });

  assert.equal(available, false, 'permanent false drift is worse than not checking');
});

test('usage counting does not swallow longer token names', () => {
  const line = 'text-primary-foreground bg-primary/50 --primary-x border-primary';

  // only bg-primary and border-primary are uses of `primary`
  assert.equal(countUsages([line], 'primary'), 2);
});

// ---- from the review of #20 ----

import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withUsageCounts, USAGE_PATTERNS } from '../src/drift.js';
import { formatDriftSection } from '../src/reporters/github.js';
import { explainUnavailable } from '../src/reporters/drift.js';

function scratch(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'dl-usage-'));
  for (const [name, contents] of Object.entries(files)) {
    const full = join(dir, name);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, contents);
  }
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const driftOf = (...names) => ({
  available: true,
  compared: names.length,
  codeSources: ['tailwind'],
  drifted: names.map(codeName => ({
    category: 'colors', codeName, codeValue: '#3b82f6',
    figmaName: `global.color-${codeName}`, figmaValue: '#2563eb',
    visible: true, detail: null
  }))
});

test('a css-only token is not reported as unused', async (t) => {
  // the default patterns are js-only, so counting usages over them made every
  // css-variable token report zero usages and sort below tokens nobody touches
  const dir = scratch(t, {
    'src/theme.css': ':root { --color-brand: #3b82f6; }\n.a { color: var(--color-brand); }',
    'src/App.tsx': '<div className="p-4" />'
  });

  const { drifted } = await withUsageCounts(driftOf('color-brand'), { cwd: dir });
  assert.equal(drifted[0].usages, 2);
});

test('usage counting stays inside the project ignore list', async (t) => {
  const dir = scratch(t, {
    'src/App.tsx': '<div className="bg-primary" />',
    'src/vendor/dist/bundle.js': '"bg-primary bg-primary bg-primary"'
  });

  const { drifted } = await withUsageCounts(driftOf('primary'), { cwd: dir, ignore: ['**/dist/**'] });
  assert.equal(drifted[0].usages, 1, 'a dependency using the class is not this codebase using it');
});

test('the most-used drift comes first', async (t) => {
  const dir = scratch(t, {
    'src/App.tsx': '<div className="bg-primary text-primary border-primary" />\n<i className="bg-rare" />'
  });

  const { drifted } = await withUsageCounts(driftOf('rare', 'primary'), { cwd: dir });
  assert.deepEqual(drifted.map(entry => entry.codeName), ['primary', 'rare']);
});

test('nothing to count is not an error', async (t) => {
  const dir = scratch(t, { 'README.md': 'no source here' });

  const { drifted } = await withUsageCounts(driftOf('primary'), { cwd: dir });
  assert.equal(drifted[0].usages, 0);
});

test('the default patterns cover stylesheets', () => {
  assert.match(USAGE_PATTERNS.join(), /css/, 'this default is the whole fix; a regression here is silent');
});

test('the PR drift table is capped so the comment still posts', () => {
  const many = driftOf(...Array.from({ length: 60 }, (_, i) => `token-${i}`));
  const section = formatDriftSection(many);

  const rows = section.split('\n').filter(line => line.startsWith('| `token-'));
  assert.equal(rows.length, 25);
  assert.match(section, /and 35 more/);
  assert.match(section, /60 tokens drifted/, 'the count is the real total, not the rows shown');
});

test('a clean run adds no drift block at all', () => {
  assert.equal(formatDriftSection({ available: true, drifted: [] }), '');
  assert.equal(formatDriftSection({ available: false, drifted: [] }), '');
  assert.equal(formatDriftSection(null), '');
});

test('every unavailable reason says what to do about it', () => {
  assert.match(explainUnavailable('no code tokens'), /tailwind config/);
  assert.match(explainUnavailable('no shared tokens'), /line up/);
  assert.match(explainUnavailable(undefined), /figma-tokens\.json/);
});
