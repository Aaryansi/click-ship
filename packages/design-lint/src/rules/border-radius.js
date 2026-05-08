/**
 * Border Radius Rule
 *
 * Ensures border radius values match design system tokens
 */

import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse.default || _traverse;

export const meta = {
  name: 'border-radius',
  description: 'Enforce border radius values from design system',
  category: 'design-system',
  fixable: true
};

const DEFAULT_BORDER_RADIUS = {
  'none': 0, 'sm': 2, 'DEFAULT': 4, 'md': 6, 'lg': 8,
  'xl': 12, '2xl': 16, '3xl': 24, 'full': 9999
};

const RADIUS_PROPERTIES = [
  'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
  'borderBottomLeftRadius', 'borderBottomRightRadius'
];

export function run(context) {
  const { code, filePath, tokens } = context;
  const violations = [];
  const radiusScale = buildRadiusScale(tokens);

  let ast;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
      errorRecovery: true
    });
  } catch {
    return violations;
  }

  traverse(ast, {
    ObjectProperty(path) {
      checkStyleProperty(path, violations, radiusScale, filePath);
    },
    JSXAttribute(path) {
      if (path.node.name?.name === 'className') {
        checkClassName(path, violations, radiusScale, filePath);
      }
    }
  });

  return violations;
}

function buildRadiusScale(tokens) {
  const scale = { ...DEFAULT_BORDER_RADIUS };
  if (tokens?.borderRadius) {
    for (const [name, value] of Object.entries(tokens.borderRadius)) {
      const px = toPixels(value);
      if (px !== null) scale[name] = px;
    }
  }
  return scale;
}

function checkStyleProperty(path, violations, scale, filePath) {
  const key = path.node.key;
  const value = path.node.value;

  let propName;
  if (key.type === 'Identifier') propName = key.name;
  else if (key.type === 'StringLiteral') propName = key.value;
  else return;

  if (!RADIUS_PROPERTIES.includes(propName)) return;

  if (value.type === 'NumericLiteral') {
    checkRadiusValue(value.value, 'px', path.node.loc, violations, scale, filePath);
  }

  if (value.type === 'StringLiteral') {
    const match = value.value.match(/^(\d+(?:\.\d+)?)(px|rem|em)?$/);
    if (match) {
      checkRadiusValue(parseFloat(match[1]), match[2] || 'px', path.node.loc, violations, scale, filePath, value.value);
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

  const radiusRegex = /rounded(?:-[trbl]{1,2})?-\[(\d+(?:\.\d+)?)(px|rem|em)?\]/g;
  let match;

  while ((match = radiusRegex.exec(classString)) !== null) {
    const pxValue = toPixelsWithUnit(parseFloat(match[1]), match[2] || 'px');
    const scaleValues = Object.values(scale);

    if (!scaleValues.some(s => Math.abs(s - pxValue) < 0.5)) {
      const suggestion = findClosestRadius(pxValue, scale);
      violations.push({
        rule: 'border-radius',
        severity: 'warn',
        message: `Arbitrary border radius '${match[0]}' is not in the design system scale`,
        file: filePath,
        line: path.node.loc.start.line,
        column: path.node.loc.start.column + match.index,
        value: match[0],
        suggestion: suggestion ? `Use 'rounded-${suggestion.name}'` : null
      });
    }
  }
}

function checkRadiusValue(num, unit, loc, violations, scale, filePath, originalValue = null) {
  const pxValue = toPixelsWithUnit(num, unit);
  const scaleValues = Object.values(scale);

  if (!scaleValues.some(s => Math.abs(s - pxValue) < 0.5)) {
    const suggestion = findClosestRadius(pxValue, scale);
    violations.push({
      rule: 'border-radius',
      severity: 'warn',
      message: `Border radius '${originalValue || num + unit}' (${pxValue}px) is not in the design system scale`,
      file: filePath,
      line: loc.start.line,
      column: loc.start.column,
      value: originalValue || `${num}${unit}`,
      suggestion: suggestion ? `Use 'rounded-${suggestion.name}' (${suggestion.value}px)` : null
    });
  }
}

function toPixels(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d+(?:\.\d+)?)(px|rem|em)?$/);
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

function findClosestRadius(value, scale) {
  let closest = null, minDiff = Infinity;
  for (const [name, radius] of Object.entries(scale)) {
    if (name === 'full' && value < 100) continue;
    const diff = Math.abs(radius - value);
    if (diff < minDiff) { minDiff = diff; closest = { name: name === 'DEFAULT' ? '' : name, value: radius }; }
  }
  return closest;
}

export function fix(content, violation) {
  if (!violation.fix) return null;
  return content.replace(violation.fix.oldValue, violation.fix.newValue);
}

export default { meta, run, fix };
