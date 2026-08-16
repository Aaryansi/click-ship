/**
 * Color Tokens Rule - Ensures colors match design system tokens
 */

import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import { findClosestColor, isOpaque, REWRITE_LIMIT } from '../color.js';

const traverse = _traverse.default || _traverse;

export const meta = {
  name: 'color-tokens',
  description: 'Enforce color values from design system tokens',
  category: 'design-system',
  fixable: true
};

const COLOR_PROPERTIES = [
  'color', 'backgroundColor', 'background', 'borderColor',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'outlineColor', 'fill', 'stroke', 'caretColor'
];

export function run(context) {
  const { code, filePath, tokens } = context;
  const violations = [];

  if (!tokens?.colors || Object.keys(tokens.colors).length === 0) return violations;

  let ast;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
      errorRecovery: true
    });
  } catch { return violations; }

  traverse(ast, {
    ObjectProperty(path) { checkStyleProperty(path, violations, tokens.colors, filePath); },
    JSXAttribute(path) {
      if (path.node.name?.name === 'className') {
        checkClassName(path, violations, tokens.colors, filePath, tokens.bySource?.tailwind?.colors);
      }
    }
  });

  return violations;
}

function checkStyleProperty(path, violations, colorTokens, filePath) {
  const key = path.node.key;
  const value = path.node.value;

  let propName;
  if (key.type === 'Identifier') propName = key.name;
  else if (key.type === 'StringLiteral') propName = key.value;
  else return;

  if (!COLOR_PROPERTIES.includes(propName)) return;

  if (value.type === 'StringLiteral') {
    const colorValue = value.value;
    if (isHardcodedColor(colorValue)) {
      const suggestion = findClosestColorToken(colorValue, colorTokens);
      violations.push({
        rule: 'color-tokens',
        severity: 'error',
        message: `Hardcoded color '${colorValue}' should use a design token`,
        file: filePath,
        line: path.node.loc.start.line,
        column: path.node.loc.start.column,
        value: colorValue,
        suggestion: suggestion ? `Use '${suggestion.name}' (${suggestion.value})` : null
      });
    }
  }
}

function checkClassName(path, violations, colorTokens, filePath, tailwindColors) {
  const value = path.node.value;
  let literal = null;

  if (value?.type === 'StringLiteral') literal = value;
  else if (value?.type === 'JSXExpressionContainer' && value.expression.type === 'StringLiteral') {
    literal = value.expression;
  }

  const classString = literal?.value;
  if (!classString) return;

  const colorRegex = /(bg|text|border|ring)-\[(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\]/g;
  let match;

  while ((match = colorRegex.exec(classString)) !== null) {
    const [arbitraryClass, prefix, colorValue] = match;
    const suggestion = findClosestColorToken(colorValue, colorTokens);

    // position of the class itself, not of the `className` attribute. the +1 steps
    // over the opening quote. reporting the attribute's column put every one of these
    // about eleven characters to the left, in the middle of `className=`.
    const start = literal.start + 1 + match.index;

    violations.push({
      rule: 'color-tokens',
      severity: 'error',
      message: `Arbitrary color '${arbitraryClass}' should use a design token`,
      file: filePath,
      line: literal.loc.start.line,
      column: literal.loc.start.column + 1 + match.index,
      value: arbitraryClass,
      suggestion: suggestion ? `Use '${prefix}-${suggestion.name}'` : null,
      fix: isSafeToRewrite(suggestion, colorValue, tailwindColors)
        ? { start, end: start + arbitraryClass.length, newValue: `${prefix}-${suggestion.name}` }
        : undefined
    });
  }
}

/**
 * Whether swapping this token in is guaranteed not to change the rendered page.
 *
 * Three separate ways that guarantee can fail, each of which produced a visible change
 * before it was checked:
 *   - the token name is not a class tailwind generates, so the element loses its colour
 *   - the source colour is translucent and the token is not, so the transparency goes
 *   - the colours are close but not close enough, so the shade visibly shifts
 */
function isSafeToRewrite(match, sourceValue, tailwindColors) {
  if (!match || match.ambiguous) return false;
  if (!tailwindColors || !(match.name in tailwindColors)) return false;
  if (!isOpaque(sourceValue) || !isOpaque(match.raw)) return false;

  return match.distance <= REWRITE_LIMIT;
}

function isHardcodedColor(value) {
  if (typeof value !== 'string') return false;
  if (value.startsWith('var(')) return false;
  if (['inherit', 'currentColor', 'transparent'].includes(value)) return false;
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return true;
  if (/^(rgb|rgba|hsl|hsla)\s*\(/i.test(value)) return true;
  return false;
}

// delegates to the shared OKLab implementation. this rule used to carry its own copy
// of the colour maths, measuring distance over raw sRGB channels with a cutoff of 50,
// which is not perceptually uniform: the same number means "identical" in one part of
// the space and "obviously different" in another.
function findClosestColorToken(color, colorTokens) {
  return findClosestColor(color, colorTokens);
}

export function fix(content, violation) {
  const target = violation.fix;
  if (!target) return null;

  // slice by offset rather than String.replace. replace() rewrites the first textual
  // occurrence anywhere in the file, so a class mentioned in a doc string or comment
  // got rewritten while the actual violation was left in place.
  return content.slice(0, target.start) + target.newValue + content.slice(target.end);
}

export default { meta, run, fix };
