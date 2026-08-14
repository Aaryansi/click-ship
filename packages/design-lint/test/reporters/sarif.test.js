import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format as formatSarif } from '../../src/reporters/sarif.js';
import { format } from '../../src/reporters/index.js';

const violations = [
  {
    rule: 'color-tokens',
    severity: 'error',
    message: "Hardcoded color '#ff0000' should use a design token",
    file: 'src/Button.tsx',
    line: 6,
    column: 8,
    value: '#ff0000'
  },
  {
    rule: 'spacing-scale',
    severity: 'warn',
    message: "Spacing value '15px' (15px) is not in the spacing scale",
    file: 'src/Button.tsx',
    line: 7,
    column: 8,
    value: '15px'
  },
  {
    rule: 'color-tokens',
    severity: 'error',
    message: "Arbitrary color 'bg-[#f0f0f0]' should use a design token",
    file: 'src/Card.tsx',
    line: 4,
    column: 9,
    value: 'bg-[#f0f0f0]'
  }
];

test('emits parseable SARIF 2.1.0', () => {
  const sarif = JSON.parse(formatSarif(violations));

  assert.equal(sarif.version, '2.1.0');
  assert.ok(Array.isArray(sarif.runs));
  assert.equal(sarif.runs.length, 1);
});

test('declares the tool driver GitHub needs to attribute results', () => {
  const { runs } = JSON.parse(formatSarif(violations));
  const driver = runs[0].tool.driver;

  assert.equal(driver.name, 'design-lint');
  assert.ok(driver.version, 'a version is required');
  assert.ok(driver.informationUri);
});

test('declares each distinct rule exactly once', () => {
  const { runs } = JSON.parse(formatSarif(violations));
  const ids = runs[0].tool.driver.rules.map(r => r.id);

  assert.deepEqual(ids.sort(), ['color-tokens', 'spacing-scale'],
    'three violations, two distinct rules');
});

test('maps severities onto SARIF levels', () => {
  const { runs } = JSON.parse(formatSarif(violations));
  const levels = runs[0].results.map(r => r.level);

  assert.deepEqual(levels, ['error', 'warning', 'error'], 'warn becomes warning');
});

test('every result carries a rule id, a message and a location', () => {
  const { runs } = JSON.parse(formatSarif(violations));

  assert.equal(runs[0].results.length, violations.length);

  for (const result of runs[0].results) {
    assert.ok(result.ruleId, 'ruleId is required');
    assert.ok(result.message?.text, 'message.text is required');

    const physical = result.locations?.[0]?.physicalLocation;
    assert.ok(physical?.artifactLocation?.uri, 'a file uri is required');
    assert.ok(physical?.region?.startLine > 0, 'a 1-indexed startLine is required');
  }
});

test('points results at the right files', () => {
  const { runs } = JSON.parse(formatSarif(violations));
  const uris = runs[0].results.map(r => r.locations[0].physicalLocation.artifactLocation.uri);

  assert.deepEqual(uris, ['src/Button.tsx', 'src/Button.tsx', 'src/Card.tsx']);
});

// babel reports columns 0-based, SARIF regions are 1-based. a violation at the very
// start of a line used to emit startColumn: 0 and GitHub code scanning rejected the
// whole upload. the fixtures above all sit at columns 8 and 9, which is why nothing
// here caught it originally.
test('startColumn is 1-based as SARIF requires', () => {
  const atLineStart = [{ rule: 'color-tokens', severity: 'error', message: 'm', file: 'a.tsx', line: 1, column: 0 }];
  const { runs } = JSON.parse(formatSarif(atLineStart));
  const region = runs[0].results[0].locations[0].physicalLocation.region;

  assert.equal(region.startColumn, 1, 'a 0-based column 0 becomes 1');
  assert.equal(region.startLine, 1);
});

test('columns are shifted consistently, not just clamped', () => {
  const { runs } = JSON.parse(formatSarif(violations));
  const columns = runs[0].results.map(r => r.locations[0].physicalLocation.region.startColumn);

  // fixtures sit at 0-based 8, 8, 9
  assert.deepEqual(columns, [9, 9, 10]);
});

test('a violation missing a position still produces a valid region', () => {
  const sparse = [{ rule: 'color-tokens', severity: 'error', message: 'm', file: 'a.tsx' }];
  const region = JSON.parse(formatSarif(sparse)).runs[0].results[0].locations[0].physicalLocation.region;

  assert.ok(region.startLine >= 1 && region.startColumn >= 1, `got ${JSON.stringify(region)}`);
});

test('an empty run is still valid SARIF', () => {
  const sarif = JSON.parse(formatSarif([]));

  assert.equal(sarif.version, '2.1.0');
  assert.deepEqual(sarif.runs[0].results, []);
  assert.deepEqual(sarif.runs[0].tool.driver.rules, []);
});

test('the reporter registry routes by name', () => {
  const viaRegistry = JSON.parse(format(violations, 'sarif'));

  assert.equal(viaRegistry.version, '2.1.0');
  assert.equal(viaRegistry.runs[0].results.length, 3);
});

test('the json reporter round-trips the violations intact', () => {
  const parsed = JSON.parse(format(violations, 'json'));

  // the point of a round trip is that nothing is dropped or renamed on the way out,
  // so compare the whole array rather than grepping the stringified blob
  assert.deepEqual(parsed.violations, violations);
});

test('the json reporter summarises counts alongside the violations', () => {
  const parsed = JSON.parse(format(violations, 'json'));

  assert.ok(parsed.summary, 'a summary block is part of the contract');
  assert.equal(parsed.summary.errors, 2);
  assert.equal(parsed.summary.warnings, 1);
});
