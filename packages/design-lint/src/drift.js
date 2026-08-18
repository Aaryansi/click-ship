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

import { colorDistance, normalizeColor, parseColor, JUST_NOTICEABLE } from './color.js';
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
  const colorA = parseColor(a);
  const colorB = parseColor(b);
  if (colorA && colorB) {
    const distance = colorDistance(colorA.hex, colorB.hex);
    // opacity is part of the token. comparing only the hex meant a designer changing a
    // scrim from 50% to 25% produced a green "figma and the code agree".
    // one 8-bit step. hex alpha cannot express anything finer than 1/255, so `#80` is
    // 0.50196 and comparing it to a literal 0.5 with a tighter tolerance would report
    // the same colour written two ways as drift.
    const alphaGap = Math.abs(colorA.alpha - colorB.alpha);
    const alphaDrifted = alphaGap > 1 / 255;

    const notes = [];
    if (distance > 0) notes.push(`ΔE ${distance.toFixed(4)}${distance > JUST_NOTICEABLE ? ', visible' : ', not visible'}`);
    if (alphaDrifted) notes.push(`opacity ${colorA.alpha} vs ${colorB.alpha}`);

    return {
      drifted: colorA.hex !== colorB.hex || alphaDrifted,
      visible: distance > JUST_NOTICEABLE || alphaGap > 0.05,
      detail: notes.join(', ') || null
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

// `{core.blue.500}` is a tokens studio reference that the parser stores verbatim.
// comparing it to a hex would report every semantic token as drifted.
function isAlias(value) {
  return typeof value === 'string' && /^\{.+\}$/.test(value.trim());
}

// shadows are deliberately absent. the figma parser reconstructs them as
// `0px 4px 8px 0px rgba(...)` while tailwind configs write `0 4px 8px 0 rgba(...)`, so
// a raw string comparison marks every shadow as drifted forever. permanent false drift
// is worse than not checking, and comparing them properly needs a shadow parser.
const CATEGORIES = [
  ['colors', 'colors'],
  ['spacing', 'spacing'],
  ['borderRadius', 'borderRadius']
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

    // two indexes. the exact one wins, because normalization is lossy: it strips
    // `text`, `border` and `color` as category words, so `text-primary`,
    // `border-primary` and `primary` all reduce to the same key. taking whichever
    // happened to be enumerated first paired figma's `color-primary` with the code's
    // `text-primary` and never compared the real `primary` at all.
    const exact = new Map();
    const normalized = new Map();
    const ambiguous = new Set();

    for (const sourceName of codeSources) {
      for (const [name, value] of Object.entries(flatten(tokens.bySource[sourceName], category))) {
        const entry = { name, value, source: sourceName };
        if (!exact.has(name)) exact.set(name, entry);

        const key = normalizeTokenName(name);
        const seen = normalized.get(key);
        if (!seen) normalized.set(key, entry);
        else if (seen.name !== name) ambiguous.add(key);
      }
    }

    for (const [figmaName, figmaValue] of Object.entries(figmaTokens)) {
      // a reference, not a value: comparing it to a hex would report every semantic
      // token as drifted
      if (isAlias(figmaValue)) continue;

      const key = normalizeTokenName(figmaName);
      // exact beats normalized, and an ambiguous key is skipped rather than guessed at
      const match = exact.get(figmaName) ?? exact.get(key) ??
        (ambiguous.has(key) ? null : normalized.get(key));
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

  // "we compared nothing" is not "they agree". a malformed export parses to an empty
  // token bag, and reporting that as agreement is the exact failure this module's
  // header says to avoid.
  if (compared === 0) {
    return { available: false, drifted: [], compared: 0, codeSources, reason: 'no shared tokens' };
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
  // the trailing guard matters: treating `-` as a boundary counted
  // `text-primary-foreground`, `bg-primary/50` and `--primary-x` as uses of `primary`,
  // inflating the number the whole priority order is built on
  const pattern = new RegExp(`[-.(]${escaped}(?![\\w-])`, 'g');

  let total = 0;
  for (const code of sources) {
    total += (code.match(pattern) ?? []).length;
  }
  return total;
}

export default { findDrift, normalizeTokenName, countUsages };
