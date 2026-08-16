/**
 * Color Tokens Rule - Ensures colors match design system tokens
 */

import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import { findClosestColor, JUST_NOTICEABLE } from '../color.js';

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
      if (path.node.name?.name === 'className') checkClassName(path, violations, tokens.colors, filePath);
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

function checkClassName(path, violations, colorTokens, filePath) {
  const value = path.node.value;
  let classString = '';

  if (value?.type === 'StringLiteral') classString = value.value;
  else if (value?.type === 'JSXExpressionContainer' && value.expression.type === 'StringLiteral') {
    classString = value.expression.value;
  }

  if (!classString) return;

  const colorRegex = /(bg|text|border|ring)-\[(#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\))\]/g;
  let match;

  while ((match = colorRegex.exec(classString)) !== null) {
    const [arbitraryClass, prefix, colorValue] = match;
    const suggestion = findClosestColorToken(colorValue, colorTokens);

    violations.push({
      rule: 'color-tokens',
      severity: 'error',
      message: `Arbitrary color '${arbitraryClass}' should use a design token`,
      file: filePath,
      line: path.node.loc.start.line,
      column: path.node.loc.start.column + match.index,
      value: arbitraryClass,
      suggestion: suggestion ? `Use '${prefix}-${suggestion.name}'` : null,
      // only offered when swapping it in cannot change how the page looks, and when
      // one token is unambiguously the right one
      fix: isSafeToRewrite(suggestion)
        ? { oldValue: arbitraryClass, newValue: `${prefix}-${suggestion.name}` }
        : undefined
    });
  }
}

function isSafeToRewrite(match) {
  return Boolean(match) && !match.ambiguous && match.distance <= JUST_NOTICEABLE;
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
  if (!violation.fix) return null;
  return content.replace(violation.fix.oldValue, violation.fix.newValue);
}

export default { meta, run, fix };
