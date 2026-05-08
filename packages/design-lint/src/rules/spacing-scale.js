/**
 * Spacing Scale Rule - Ensures spacing follows design system scale
 */

import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse.default || _traverse;

export const meta = {
  name: 'spacing-scale',
  description: 'Enforce spacing values from design system scale',
  category: 'design-system',
  fixable: true
};

const SPACING_PROPERTIES = [
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'gap', 'rowGap', 'columnGap', 'top', 'right', 'bottom', 'left',
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight'
];

const DEFAULT_SPACING_SCALE = [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 96];

export function run(context) {
  const { code, filePath, tokens } = context;
  const violations = [];
  const spacingScale = buildSpacingScale(tokens);

  let ast;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
      errorRecovery: true
    });
  } catch { return violations; }

  traverse(ast, {
    ObjectProperty(path) { checkStyleProperty(path, violations, spacingScale, filePath); },
    JSXAttribute(path) {
      if (path.node.name?.name === 'className') checkClassName(path, violations, spacingScale, filePath);
    }
  });

  return violations;
}

function buildSpacingScale(tokens) {
  const scale = new Set(DEFAULT_SPACING_SCALE);
  if (tokens?.spacing) {
    for (const value of Object.values(tokens.spacing)) {
      const px = toPixels(value);
      if (px !== null) scale.add(px);
    }
  }
  return Array.from(scale).sort((a, b) => a - b);
}

function checkStyleProperty(path, violations, scale, filePath) {
  const key = path.node.key;
  const value = path.node.value;

  let propName;
  if (key.type === 'Identifier') propName = key.name;
  else if (key.type === 'StringLiteral') propName = key.value;
  else return;

  if (!SPACING_PROPERTIES.includes(propName)) return;

  if (value.type === 'NumericLiteral') {
    checkSpacingValue(value.value, 'px', path.node.loc, violations, scale, filePath);
  }

  if (value.type === 'StringLiteral') {
    const match = value.value.match(/^(-?\d+(?:\.\d+)?)(px|rem|em)?$/);
    if (match) {
      checkSpacingValue(parseFloat(match[1]), match[2] || 'px', path.node.loc, violations, scale, filePath, value.value);
    }
  }
}

function checkClassName(path, violations, scale, filePath) {
  const value = path.node.value;
  let classString = '';

  if (value?.type === 'StringLiteral') classString = value.value;
  else if (value?.type === 'JSXExpressionContainer' && value.expression.type === 'StringLiteral') {
    classString = value.expression.value;
  }

  if (!classString) return;

  const spacingRegex = /(?:m|p|gap|space|w|h)(?:[xytblr])?-\[(-?\d+(?:\.\d+)?)(px|rem|em)?\]/g;
  let match;

  while ((match = spacingRegex.exec(classString)) !== null) {
    const pxValue = toPixelsWithUnit(parseFloat(match[1]), match[2] || 'px');
    if (!scale.some(s => Math.abs(s - pxValue) < 0.5)) {
      const suggestion = findClosestSpacing(pxValue, scale);
      violations.push({
        rule: 'spacing-scale',
        severity: 'warn',
        message: `Arbitrary spacing '${match[0]}' (${pxValue}px) is not in the spacing scale`,
        file: filePath,
        line: path.node.loc.start.line,
        column: path.node.loc.start.column + match.index,
        value: match[0],
        suggestion: suggestion ? `Use ${suggestion.value}px` : null
      });
    }
  }
}

function checkSpacingValue(num, unit, loc, violations, scale, filePath, originalValue = null) {
  if (typeof num !== 'number') return;
  const pxValue = toPixelsWithUnit(num, unit);
  if (pxValue < 0) return;

  if (!scale.some(s => Math.abs(s - pxValue) < 0.5)) {
    const suggestion = findClosestSpacing(pxValue, scale);
    violations.push({
      rule: 'spacing-scale',
      severity: 'warn',
      message: `Spacing value '${originalValue || num + unit}' (${pxValue}px) is not in the spacing scale`,
      file: filePath,
      line: loc.start.line,
      column: loc.start.column,
      value: originalValue || `${num}${unit}`,
      suggestion: suggestion ? `Use ${suggestion.value}px` : null
    });
  }
}

function toPixels(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const match = value.match(/^(-?\d+(?:\.\d+)?)(px|rem|em)?$/);
  if (!match) return null;
  return toPixelsWithUnit(parseFloat(match[1]), match[2] || 'px');
}

function toPixelsWithUnit(num, unit) {
  switch (unit) {
    case 'px': return num;
    case 'rem': case 'em': return num * 16;
    default: return num;
  }
}

function findClosestSpacing(value, scale) {
  let closest = null, minDiff = Infinity;
  for (const s of scale) {
    const diff = Math.abs(s - value);
    if (diff < minDiff) { minDiff = diff; closest = { value: s, diff }; }
  }
  return closest;
}

export function fix(content, violation) {
  if (!violation.fix) return null;
  return content.replace(violation.fix.oldValue, violation.fix.newValue);
}

export default { meta, run, fix };
