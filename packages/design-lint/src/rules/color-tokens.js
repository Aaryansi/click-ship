/**
 * Color Tokens Rule - Ensures colors match design system tokens
 */

import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

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

  const colorRegex = /(?:bg|text|border|ring)-\[(#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\))\]/g;
  let match;

  while ((match = colorRegex.exec(classString)) !== null) {
    const colorValue = match[1];
    const suggestion = findClosestColorToken(colorValue, colorTokens);
    violations.push({
      rule: 'color-tokens',
      severity: 'error',
      message: `Arbitrary color '${match[0]}' should use a design token`,
      file: filePath,
      line: path.node.loc.start.line,
      column: path.node.loc.start.column + match.index,
      value: match[0],
      suggestion: suggestion ? `Use '${suggestion.name}'` : null
    });
  }
}

function isHardcodedColor(value) {
  if (typeof value !== 'string') return false;
  if (value.startsWith('var(')) return false;
  if (['inherit', 'currentColor', 'transparent'].includes(value)) return false;
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return true;
  if (/^(rgb|rgba|hsl|hsla)\s*\(/i.test(value)) return true;
  return false;
}

function findClosestColorToken(color, colorTokens) {
  const normalized = normalizeColor(color);
  if (!normalized) return null;

  let closest = null, minDistance = Infinity;

  for (const [name, tokenColor] of Object.entries(colorTokens)) {
    const tokenNormalized = normalizeColor(tokenColor);
    if (!tokenNormalized) continue;
    if (normalized === tokenNormalized) return { name, value: tokenColor, exact: true };
    const distance = colorDistance(normalized, tokenNormalized);
    if (distance < minDistance) { minDistance = distance; closest = { name, value: tokenColor, distance }; }
  }

  return closest && closest.distance < 50 ? closest : null;
}

function normalizeColor(color) {
  if (typeof color !== 'string') return null;
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [, r, g, b] = color.match(/^#(.)(.)(.)$/i);
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const rgbMatch = color.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return null;
}

function colorDistance(hex1, hex2) {
  const rgb1 = hexToRgb(hex1), rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return Infinity;
  return Math.sqrt(Math.pow(rgb1.r - rgb2.r, 2) + Math.pow(rgb1.g - rgb2.g, 2) + Math.pow(rgb1.b - rgb2.b, 2));
}

function hexToRgb(hex) {
  const match = hex.match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return null;
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) };
}

export function fix(content, violation) {
  if (!violation.fix) return null;
  return content.replace(violation.fix.oldValue, violation.fix.newValue);
}

export default { meta, run, fix };
