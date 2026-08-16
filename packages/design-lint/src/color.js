/**
 * Colour comparison in OKLab.
 *
 * Both call sites used to measure distance as plain Euclidean distance over sRGB
 * channel values with a cutoff of 50. sRGB is not perceptually uniform, so that
 * number means completely different things in different parts of the space: 50 apart
 * in the greens is barely visible, while 50 apart in the blues is obviously a
 * different colour. Suggesting on that basis is merely unhelpful; *rewriting* source
 * on it is how you silently change a design.
 *
 * OKLab is designed so that Euclidean distance approximates perceived difference, so
 * one threshold behaves the same everywhere in the space.
 */

// ΔEOK at which a side-by-side difference starts to be visible on a small patch
export const JUST_NOTICEABLE = 0.02;

// what a rewrite is allowed to move a colour by. deliberately tighter than the JND:
// that figure is for small patches, and a page background or a large fill shows a
// smaller difference than a swatch does. at 0.02, #ffffff would be rewritten to
// #fafafa, turning a white page grey.
export const REWRITE_LIMIT = 0.01;

// close enough to be worth mentioning in a message, but not to act on unasked
export const SUGGESTION_LIMIT = 0.1;

/**
 * Split a colour into its opaque hex and its alpha.
 *
 * Alpha has to be carried, not discarded. Normalizing `#3b82f680` to `#3b82f6` makes a
 * 50% scrim look like an exact match for an opaque token, and rewriting it deletes the
 * transparency from someone's design.
 */
export function parseColor(color) {
  if (typeof color !== 'string') return null;

  const value = color.trim().toLowerCase();

  if (/^#[0-9a-f]{6}$/.test(value)) return { hex: value, alpha: 1 };

  if (/^#[0-9a-f]{8}$/.test(value)) {
    return { hex: value.slice(0, 7), alpha: parseInt(value.slice(7, 9), 16) / 255 };
  }

  if (/^#[0-9a-f]{3}$/.test(value)) {
    const [, r, g, b] = value.match(/^#(.)(.)(.)$/);
    return { hex: `#${r}${r}${g}${g}${b}${b}`, alpha: 1 };
  }

  if (/^#[0-9a-f]{4}$/.test(value)) {
    const [, r, g, b, a] = value.match(/^#(.)(.)(.)(.)$/);
    return { hex: `#${r}${r}${g}${g}${b}${b}`, alpha: parseInt(`${a}${a}`, 16) / 255 };
  }

  // covers both `rgb(59, 130, 246)` and the space-separated `rgb(59 130 246 / 50%)`
  const rgb = value.match(/^rgba?\s*\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)/);
  if (rgb) {
    const hex = (n) => Math.min(255, parseInt(n, 10)).toString(16).padStart(2, '0');
    let alpha = 1;
    if (rgb[4] !== undefined) {
      alpha = parseFloat(rgb[4]);
      if (rgb[5] === '%') alpha /= 100;
    }
    return { hex: `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`, alpha };
  }

  return null;
}

export function normalizeColor(color) {
  return parseColor(color)?.hex ?? null;
}

export function isOpaque(color) {
  const parsed = parseColor(color);
  return parsed !== null && parsed.alpha >= 1;
}

function hexToRgb(hex) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(hex);
  if (!match) return null;
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16)
  };
}

// sRGB is gamma encoded; undo that before any colour maths
function toLinear(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * sRGB to OKLab, per Björn Ottosson's reference conversion.
 */
export function toOklab(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  };
}

/**
 * Perceived difference between two colours. Returns Infinity when either side cannot
 * be understood, so callers treat "unknown" the same as "far away".
 */
export function colorDistance(a, b) {
  const first = toOklab(normalizeColor(a));
  const second = toOklab(normalizeColor(b));
  if (!first || !second) return Infinity;

  return Math.hypot(first.L - second.L, first.a - second.a, first.b - second.b);
}

/**
 * Closest token to a colour.
 *
 * `ambiguous` is set when a second token with a *different* value sits equally close,
 * which is the signal not to rewrite anything: we cannot tell which one the author
 * meant, and picking one at random is worse than leaving the code alone.
 */
export function findClosestColor(value, colorTokens, maxDistance = SUGGESTION_LIMIT) {
  const target = normalizeColor(value);
  if (!target) return null;

  const candidates = [];

  for (const [name, tokenValue] of Object.entries(colorTokens || {})) {
    const normalized = normalizeColor(tokenValue);
    if (!normalized) continue;

    const distance = colorDistance(target, normalized);
    if (distance <= maxDistance) {
      candidates.push({ name, value: normalized, raw: tokenValue, distance, exact: distance === 0 });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.distance - b.distance);
  const best = candidates[0];

  // ambiguity is not about being *exactly* equidistant, which floating point makes
  // vanishingly unlikely anyway. it is about more than one token being an equally
  // defensible swap: if two different values are both imperceptibly close, there is no
  // basis for choosing, so nothing gets rewritten. an exact hit settles the question.
  const rivals = candidates.filter(c => c.value !== best.value && c.distance <= JUST_NOTICEABLE);

  return { ...best, ambiguous: !best.exact && rivals.length > 0 };
}

export default { normalizeColor, toOklab, colorDistance, findClosestColor, JUST_NOTICEABLE, SUGGESTION_LIMIT };
