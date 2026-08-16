/**
 * Figma to code token drift.
 *
 * Design systems keep the same tokens in two places and they quietly diverge: somebody
 * nudges a colour in Figma, nobody changes the code, and six months later the two are
 * a shade apart everywhere. Linting hardcoded values is well covered ground; nothing
 * watches the two sources of truth for disagreement.
 *
 * Reads a Tokens Studio export committed to the repo. No Figma API, no token, no
 * Enterprise plan, and it runs offline in CI.
 */

import { colorDistance, normalizeColor, JUST_NOTICEABLE } from './color.js';
import { toPixels } from './parsers/tailwind.js';

// which parsers describe the code side. figma is the design side; everything else is
// what the code actually ships.
const CODE_SOURCES = ['tailwind', 'css-vars', 'tokens-json'];

// words that describe the *category* rather than the token, so `color-primary` and
// `primary` are recognisably the same thing on either side of the comparison
const CATEGORY_WORDS = new Set([
  'color', 'colors', 'colour', 'colours',
  'space', 'spacing', 'size', 'sizes', 'sizing',
  'radius', 'radii', 'border', 'borderradius', 'rounded',
  'font', 'fontsize', 'fontsizes', 'text', 'type', 'typography',
  'shadow', 'shadows', 'elevation',
  // tokens studio set names, which prefix everything in an export
  'global', 'core', 'base', 'semantic', 'theme', 'tokens', 'primitives'
]);

/**
 * Reduce a token name to the part that actually identifies it.
 *
 * Figma exports carry their set name and a category prefix (`global.color-primary`)
 * while a tailwind config usually does not (`primary`). Comparing the raw strings
 * finds nothing, so both sides are stripped to a comparable tail.
 */
export function normalizeTokenName(name) {
  const words = String(name)
    .split(/[.\-_/\s]+/)
    .map(word => word.trim().toLowerCase())
    .filter(Boolean);

  const meaningful = words.filter(word => !CATEGORY_WORDS.has(word));

  // everything was a category word, so keep the last one rather than nothing
  return (meaningful.length > 0 ? meaningful : words.slice(-1)).join('-');
}

/**
 * Whether two token values disagree.
 *
 * Any real difference is drift, including one too small to see: the point is that the
 * two sources of truth have diverged, and imperceptible gaps are exactly the ones that
 * survive for years and then widen. What is *not* drift is the same value written
 * differently, so `#FFF` and `#ffffff` agree, and so do `1rem` and `16px`.
 *
 * The perceptual distance still comes back as detail, so a report can lead with the
 * ones anyone would notice.
 */
function compareValues(a, b) {
  const colorA = normalizeColor(a);
  const colorB = normalizeColor(b);
  if (colorA && colorB) {
    const distance = colorDistance(colorA, colorB);
    return {
      drifted: colorA !== colorB,
      visible: distance > JUST_NOTICEABLE,
      detail: distance > 0 ? `ΔE ${distance.toFixed(4)}${distance > JUST_NOTICEABLE ? ', visible' : ', not visible'}` : null
    };
  }

  const pxA = toPixels(a);
  const pxB = toPixels(b);
  if (pxA !== null && pxB !== null) {
    // a hair of float error from rem conversion is not a disagreement
    const drifted = Math.abs(pxA - pxB) > 0.001;
    return { drifted, visible: drifted, detail: drifted ? `${pxA}px vs ${pxB}px` : null };
  }

  const drifted = String(a).trim() !== String(b).trim();
  return { drifted, visible: drifted, detail: null };
}

const CATEGORIES = [
  ['colors', 'colors'],
  ['spacing', 'spacing'],
  ['borderRadius', 'borderRadius'],
  ['shadows', 'shadows']
];

function flatten(source, category) {
  if (category === 'typography') return source?.typography?.fontSize ?? {};
  return source?.[category] ?? {};
}

/**
 * Compare the Figma export against whatever the code declares.
 *
 * Returns `available: false` rather than an empty result when there is no export to
 * compare against, so the caller can say "nothing to do" instead of "all clear",
 * which are very different messages.
 */
export function findDrift(tokens) {
  const figma = tokens?.bySource?.figma;
  if (!figma) {
    return { available: false, drifted: [], compared: 0, codeSources: [] };
  }

  const codeSources = CODE_SOURCES.filter(name => tokens.bySource?.[name]);
  if (codeSources.length === 0) {
    return { available: false, drifted: [], compared: 0, codeSources: [], reason: 'no code tokens' };
  }

  const drifted = [];
  let compared = 0;

  for (const [category] of [...CATEGORIES, ['typography']]) {
    const figmaTokens = flatten(figma, category);

    // index the code side by normalized name so `color-primary` finds `primary`
    const codeByName = new Map();
    for (const sourceName of codeSources) {
      for (const [name, value] of Object.entries(flatten(tokens.bySource[sourceName], category))) {
        const key = normalizeTokenName(name);
        if (!codeByName.has(key)) codeByName.set(key, { name, value, source: sourceName });
      }
    }

    for (const [figmaName, figmaValue] of Object.entries(figmaTokens)) {
      const match = codeByName.get(normalizeTokenName(figmaName));
      if (!match) continue;

      compared += 1;
      const { drifted: isDrifted, visible, detail } = compareValues(match.value, figmaValue);
      if (!isDrifted) continue;

      drifted.push({
        category,
        figmaName,
        figmaValue,
        codeName: match.name,
        codeValue: match.value,
        codeSource: match.source,
        visible,
        detail
      });
    }
  }

  return { available: true, drifted, compared, codeSources };
}

/**
 * How many times the code actually uses a token, so the report can lead with the ones
 * that matter. A token nobody references is a rename waiting to happen; one used in
 * forty places is a real problem.
 */
export function countUsages(sources, codeName) {
  const escaped = codeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // matches `bg-primary`, `text-primary`, `var(--color-primary)` and `theme.primary`
  const pattern = new RegExp(`[-.(]${escaped}\\b|\\b${escaped}-`, 'g');

  let total = 0;
  for (const code of sources) {
    total += (code.match(pattern) ?? []).length;
  }
  return total;
}

export default { findDrift, normalizeTokenName, countUsages };
