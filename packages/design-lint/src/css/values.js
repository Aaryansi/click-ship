/**
 * Picking the interesting parts out of a declaration value.
 *
 * `border: 1px solid #ff0000` is three values in a trench coat, and only one of them is a
 * colour. Everything here reports the offset of the part it found, so a report points at
 * `#ff0000` rather than at the start of the line.
 */

// hex, and the functional notations. kept in step with parseColor, which is what actually
// decides whether a match is a colour we can do anything with.
const COLOR_PATTERN =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\s*\([^()]*\)/gi;

/**
 * Colour literals anywhere in a value, including inside a gradient.
 *
 * Deliberately position-agnostic: `linear-gradient(var(--a), #ff0000)` is half correct and
 * half not, and the half that is wrong is still worth saying.
 */
export function findColorLiterals(value) {
  const found = [];
  COLOR_PATTERN.lastIndex = 0;

  let match;
  while ((match = COLOR_PATTERN.exec(value)) !== null) {
    found.push({ text: match[0], offset: match.index });
  }

  return found;
}

/**
 * Split a shorthand into its top-level parts, keeping each one's offset.
 *
 * `padding: 8px 13px` is two values to check. Functions stay whole, so
 * `margin: calc(1rem + 2px) 0` splits into two and not five.
 */
export function splitValues(value) {
  const parts = [];
  let depth = 0;
  let start = -1;

  for (let index = 0; index <= value.length; index++) {
    const char = value[index];
    const isBreak = index === value.length || (depth === 0 && /\s|,/.test(char));

    if (char === '(') depth++;
    else if (char === ')') depth = Math.max(0, depth - 1);

    if (isBreak) {
      if (start !== -1) {
        parts.push({ text: value.slice(start, index), offset: start });
        start = -1;
      }
      continue;
    }

    if (start === -1) start = index;
  }

  return parts;
}

// `8px`, `1.5rem`, `-2px`. a bare `0` needs no unit and is always fine, so it is not here.
const LENGTH = /^(-?\d*\.?\d+)(px|rem|em|%|vh|vw|vmin|vmax|ch|ex|pt|pc|cm|mm|in)$/i;

/**
 * A length worth checking against a scale, or null.
 *
 * Returns null for the things that are never violations: zero, keywords like `auto`, and
 * anything referring to a token or computed at runtime.
 */
export function asLength(text) {
  if (typeof text !== 'string') return null;

  const value = text.trim();
  // already a token, or something whose value we cannot know
  if (/var\(|calc\(|clamp\(|min\(|max\(|env\(|\$[a-z]/i.test(value)) return null;

  const match = LENGTH.exec(value);
  if (!match) return null;

  const number = parseFloat(match[1]);
  // zero is zero in every unit and in every design system
  if (number === 0) return null;

  // percentages are relative to something we cannot see, so they are not scale values
  if (match[2] === '%') return null;

  return { number, unit: match[2].toLowerCase() };
}

/**
 * Whether a value defers to something else, in which case there is nothing to enforce.
 */
export function isReference(value) {
  return /var\(|\$[a-z-]|@[a-z-]|theme\(/i.test(String(value));
}
