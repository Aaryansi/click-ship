/**
 * Border Radius Rule
 *
 * Ensures border radius values match design system tokens
 */

import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import { valueLoc } from './loc.js';

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
    checkRadiusValue(value.value, 'px', valueLoc(value), violations, scale, filePath);
  }

  if (value.type === 'StringLiteral') {
    const match = value.value.match(/^(\d+(?:\.\d+)?)(px|rem|em)?$/);
    if (match) {
      checkRadiusValue(parseFloat(match[1]), match[2] || 'px', valueLoc(value), violations, scale, filePath, value.value);
    }
  }
}

function checkClassName(path, violations, scale, filePath) {
  const value = path.node.value;
  let literal = null;

  if (value?.type === 'StringLiteral') literal = value;
  else if (value?.type === 'JSXExpressionContainer' && value.expression.type === 'StringLiteral') {
    literal = value.expression;
  }

  const classString = literal?.value;
  if (!classString) return;

  const radiusRegex = /(rounded(?:-[trbl]{1,2})?)-\[(\d+(?:\.\d+)?)(px|rem|em)?\]/g;
  let match;

  while ((match = radiusRegex.exec(classString)) !== null) {
    const [arbitraryClass, prefix, rawValue, unit] = match;
    const pxValue = toPixelsWithUnit(parseFloat(rawValue), unit || 'px');
    const scaleValues = Object.values(scale);

    if (!scaleValues.some(s => Math.abs(s - pxValue) < 0.5)) {
      const suggestion = findClosestRadius(pxValue, scale);
      violations.push({
        rule: 'border-radius',
        severity: 'warn',
        message: `Arbitrary border radius '${arbitraryClass}' is not in the design system scale`,
        file: filePath,
        line: literal.loc.start.line,
        column: literal.loc.start.column + 1 + match.index,
        value: arbitraryClass,
        // carry the side through. suggesting a bare `rounded` for `rounded-tl-[5px]`
        // tells someone to round all four corners instead of the one they asked for.
        suggestion: suggestion ? `Use '${radiusClassName(suggestion.name, prefix)}'` : null
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
      suggestion: suggestion ? `Use '${radiusClassName(suggestion.name)}' (${suggestion.value}px)` : null
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

// tailwind spells the DEFAULT radius as a bare `rounded`, with no suffix. building the
// class as `rounded-${name}` therefore produced `rounded-` with a dangling hyphen
// whenever DEFAULT won, which is not a class anyone can paste.
function radiusClassName(name, prefix = 'rounded') {
  return name ? `${prefix}-${name}` : prefix;
}

export function fix(content, violation) {
  if (!violation.fix) return null;
  return content.replace(violation.fix.oldValue, violation.fix.newValue);
}

export default { meta, run, fix };
