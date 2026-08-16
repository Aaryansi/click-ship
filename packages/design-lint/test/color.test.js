import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeColor, colorDistance, findClosestColor, JUST_NOTICEABLE } from '../src/color.js';

test('normalizeColor folds every spelling onto one form', () => {
  assert.equal(normalizeColor('#FFF'), '#ffffff');
  assert.equal(normalizeColor('#6366F1'), '#6366f1');
  assert.equal(normalizeColor('  #6366f1  '), '#6366f1');
  assert.equal(normalizeColor('rgb(99, 102, 241)'), '#6366f1');
  assert.equal(normalizeColor('rgba(99, 102, 241, 0.5)'), '#6366f1');
  assert.equal(normalizeColor('#6366f1ff'), '#6366f1', 'alpha byte dropped');
  assert.equal(normalizeColor('nonsense'), null);
  assert.equal(normalizeColor(null), null);
});

test('identical colours are zero apart however they are written', () => {
  assert.equal(colorDistance('#6366f1', '#6366F1'), 0);
  assert.equal(colorDistance('#6366f1', 'rgb(99, 102, 241)'), 0);
});

test('an unreadable colour is treated as far away, never as close', () => {
  assert.equal(colorDistance('#6366f1', 'not-a-color'), Infinity);
  assert.equal(colorDistance(undefined, '#6366f1'), Infinity);
});

// the reason the rule moved off raw sRGB distance. these two pairs are the same
// distance apart in sRGB, so a single channel-space threshold has to treat them the
// same, yet one pair is visually near-identical and the other is plainly different.
test('perceptual distance separates pairs that sRGB distance cannot', () => {
  const greens = colorDistance('#00ff00', '#22ff22');
  const blues = colorDistance('#0000ff', '#2222ff');

  const rgbDistance = (a, b) => Math.hypot(
    ...[0, 1, 2].map(i => parseInt(a.slice(1 + i * 2, 3 + i * 2), 16) - parseInt(b.slice(1 + i * 2, 3 + i * 2), 16))
  );

  assert.equal(
    Math.round(rgbDistance('#00ff00', '#22ff22')),
    Math.round(rgbDistance('#0000ff', '#2222ff')),
    'sRGB calls these equally far apart'
  );
  assert.ok(blues > greens * 3, `but the blues are much further perceptually (${blues} vs ${greens})`);
  assert.ok(greens < JUST_NOTICEABLE, 'the greens are safe to swap');
  assert.ok(blues > JUST_NOTICEABLE, 'the blues are not');
});

test('findClosestColor prefers an exact token', () => {
  const match = findClosestColor('#6366f1', { brand: '#6366f1', other: '#6366f2' });

  assert.equal(match.name, 'brand');
  assert.equal(match.exact, true);
  assert.equal(match.distance, 0);
});

test('findClosestColor ignores tokens beyond the limit', () => {
  assert.equal(findClosestColor('#ff0000', { blue: '#0000ff' }), null);
});

test('findClosestColor flags a tie between two different tokens as ambiguous', () => {
  // both sit the same distance either side, so there is no basis to pick one
  const match = findClosestColor('#808080', { lighter: '#818181', darker: '#7f7f7f' });

  assert.ok(match, 'still reports the nearest for the message');
  assert.equal(match.ambiguous, true, 'but marks it unusable for a rewrite');
});

test('two tokens sharing one value are not ambiguous', () => {
  // aliases are common in design systems and both rewrite to the same colour
  const match = findClosestColor('#6366f1', { brand: '#6366f1', primary: '#6366f1' });

  assert.equal(match.ambiguous, false);
  assert.equal(match.distance, 0);
});

test('an exact hit is never ambiguous', () => {
  const match = findClosestColor('#6366f1', { brand: '#6366f1', near: '#6366f2' });

  assert.equal(match.ambiguous, false, 'an exact match settles it');
});
