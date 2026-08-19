import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeColor, colorDistance, findClosestColor, parseColor, toOklab, JUST_NOTICEABLE } from '../src/color.js';

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

// ---- alpha, from the --fix review ----

test('parseColor carries alpha instead of discarding it', async () => {
  const { parseColor } = await import('../src/color.js');

  assert.deepEqual(parseColor('#3b82f6'), { hex: '#3b82f6', alpha: 1 });
  assert.equal(parseColor('#3b82f680').alpha.toFixed(2), '0.50');
  assert.equal(parseColor('rgba(59, 130, 246, 0.5)').alpha, 0.5);
  assert.equal(parseColor('rgb(59 130 246 / 50%)').alpha, 0.5);
  assert.equal(parseColor('#3b82f6ff').alpha, 1);
});

test('isOpaque distinguishes a scrim from a solid fill', async () => {
  const { isOpaque } = await import('../src/color.js');

  assert.equal(isOpaque('#3b82f6'), true);
  assert.equal(isOpaque('#3b82f6ff'), true);
  assert.equal(isOpaque('#3b82f680'), false);
  assert.equal(isOpaque('rgba(59,130,246,0.5)'), false);
  assert.equal(isOpaque('not-a-color'), false);
});

test('a translucent colour still measures against the opaque token', async () => {
  const { colorDistance } = await import('../src/color.js');

  // distance is about hue, so this is 0. opacity is handled separately, which is why
  // a distance check alone was not enough to keep --fix safe
  assert.equal(colorDistance('#3b82f680', '#3b82f6'), 0);
});

// ---- modern css colour notation ----

test('reads oklch, which is the whole tailwind v4 palette', () => {
  // a linter that cannot read its project's colours silently enforces its own defaults
  assert.equal(parseColor('oklch(1 0 0)').hex, '#ffffff');
  assert.equal(parseColor('oklch(0 0 0)').hex, '#000000');
  assert.equal(parseColor('oklch(0.708 0 0)').hex, '#a1a1a1');
});

test('oklch lightness may be a percentage', () => {
  assert.equal(parseColor('oklch(50% 0 0)').hex, parseColor('oklch(0.5 0 0)').hex);
});

test('oklch alpha survives, since opacity is part of the token', () => {
  assert.equal(parseColor('oklch(0.5 0 0 / 0.25)').alpha, 0.25);
  assert.equal(parseColor('oklch(0.5 0 0 / 25%)').alpha, 0.25);
  assert.equal(parseColor('oklch(0.5 0 0)').alpha, 1);
});

test('reads oklab as well as oklch', () => {
  // the same colour in both notations must agree, or drift would fire between them
  assert.equal(parseColor('oklab(0.5 0 0)').hex, parseColor('oklch(0.5 0 0)').hex);
});

test('reads hsl in both the legacy and modern forms', () => {
  assert.equal(parseColor('hsl(0 100% 50%)').hex, '#ff0000');
  assert.equal(parseColor('hsl(120, 100%, 25%)').hex, '#008000');
  assert.equal(parseColor('hsl(217 91% 60%)').hex, parseColor('hsl(217, 91%, 60%)').hex);
  assert.equal(parseColor('hsla(0 100% 50% / 50%)').alpha, 0.5);
});

test('a negative or oversized hue wraps instead of failing', () => {
  assert.equal(parseColor('hsl(-120 100% 50%)').hex, parseColor('hsl(240 100% 50%)').hex);
  assert.equal(parseColor('hsl(480 100% 50%)').hex, parseColor('hsl(120 100% 50%)').hex);
});

test('an in-gamut oklch colour survives a round trip exactly', () => {
  // this is what makes the conversion trustworthy: it agrees with the toOklab already
  // used for every distance comparison in the tool
  for (const hex of ['#3b82f6', '#ef4444', '#22c55e', '#1a1a1a', '#fefefe', '#7f1d6a']) {
    const lab = toOklab(hex);
    const chroma = Math.hypot(lab.a, lab.b);
    const hue = Math.atan2(lab.b, lab.a) * 180 / Math.PI;

    assert.equal(parseColor(`oklch(${lab.L} ${chroma} ${hue})`).hex, hex, `${hex} did not survive`);
  }
});

test('an out-of-gamut colour loses chroma, not its hue', () => {
  // css color 4 says to hold lightness and hue and reduce chroma. clipping each channel
  // instead turns tailwind v4's blue-500 into a different, bluer colour, and comparing a
  // token against itself would then report drift.
  const mapped = parseColor('oklch(0.623 0.214 259.815)');
  const lab = toOklab(mapped.hex);
  const hue = (Math.atan2(lab.b, lab.a) * 180 / Math.PI + 360) % 360;

  assert.ok(Math.abs(hue - 259.815) < 2, `hue drifted to ${hue}`);
  assert.ok(Math.abs(lab.L - 0.623) < 0.02, `lightness drifted to ${lab.L}`);
  assert.ok(Math.hypot(lab.a, lab.b) < 0.214, 'chroma is what gives way');
});

test('nonsense in these notations is still nothing', () => {
  assert.equal(parseColor('oklch()'), null);
  assert.equal(parseColor('oklch(0.5 0)'), null);
  assert.equal(parseColor('hsl(0 100 50)'), null, 'hsl needs its percent signs');
  assert.equal(parseColor('color-mix(in oklab, #fff 50%, #000)'), null, 'not guessing at a mix');
});
