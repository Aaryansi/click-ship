/**
 * Typography Rule - Ensures typography values match design system
 */

import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse.default || _traverse;

export const meta = {
  name: 'typography',
  description: 'Enforce typography values from design system',
  category: 'design-system',
  fixable: true
};

const DEFAULT_FONT_SIZES = [12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72, 96, 128];
const DEFAULT_FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

export function run(context) {
  const { code, filePath, tokens } = context;
  const violations = [];
  const fontSizeScale = buildFontSizeScale(tokens);
  const fontWeights = buildFontWeights(tokens);

  let ast;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
      errorRecovery: true
    });
  } catch { return violations; }

  traverse(ast, {
    ObjectProperty(path) { checkStyleProperty(path, violations, fontSizeScale, fontWeights, filePath); },
    JSXAttribute(path) {
      if (path.node.name?.name === 'className') checkClassName(path, violations, fontSizeScale, filePath);
    }
  });

  return violations;
}

function buildFontSizeScale(tokens) {
  const scale = new Set(DEFAULT_FONT_SIZES);
  if (tokens?.typography?.fontSize) {
    for (const value of Object.values(tokens.typography.fontSize)) {
      const px = toPixels(value);
      if (px !== null) scale.add(px);
    }
  }
  return Array.from(scale).sort((a, b) => a - b);
}

function buildFontWeights(tokens) {
  const weights = new Set(DEFAULT_FONT_WEIGHTS);
  if (tokens?.typography?.fontWeight) {
    for (const value of Object.values(tokens.typography.fontWeight)) {
      const num = parseInt(value, 10);
      if (!isNaN(num)) weights.add(num);
    }
  }
  return Array.from(weights).sort((a, b) => a - b);
}

function checkStyleProperty(path, violations, fontSizeScale, fontWeights, filePath) {
  const key = path.node.key;
  const value = path.node.value;

  let propName;
  if (key.type === 'Identifier') propName = key.name;
  else if (key.type === 'StringLiteral') propName = key.value;
  else return;

  if (propName === 'fontSize') checkFontSize(value, path.node.loc, violations, fontSizeScale, filePath);
  if (propName === 'fontWeight') checkFontWeight(value, path.node.loc, violations, fontWeights, filePath);
}

function checkFontSize(value, loc, violations, scale, filePath) {
  let pxValue = null, originalValue = null;

  if (value.type === 'NumericLiteral') { pxValue = value.value; originalValue = `${value.value}`; }
  else if (value.type === 'StringLiteral') {
    const match = value.value.match(/^(\d+(?:\.\d+)?)(px|rem|em)?$/);
    if (match) { pxValue = toPixelsWithUnit(parseFloat(match[1]), match[2] || 'px'); originalValue = value.value; }
  }

  if (pxValue === null) return;

  if (!scale.some(s => Math.abs(s - pxValue) < 0.5)) {
    const suggestion = findClosestValue(pxValue, scale);
    violations.push({
      rule: 'typography',
      severity: 'error',
      message: `Font size '${originalValue}' (${pxValue}px) is not in the typography scale`,
      file: filePath,
      line: loc.start.line,
      column: loc.start.column,
      value: originalValue,
      suggestion: suggestion ? `Use ${suggestion}px` : null
    });
  }
}

function checkFontWeight(value, loc, violations, weights, filePath) {
  let weightValue = null, originalValue = null;

  if (value.type === 'NumericLiteral') { weightValue = value.value; originalValue = `${value.value}`; }
  else if (value.type === 'StringLiteral') {
    const num = parseInt(value.value, 10);
    if (!isNaN(num)) { weightValue = num; originalValue = value.value; }
  }

  if (weightValue === null) return;

  if (!weights.includes(weightValue)) {
    const suggestion = findClosestValue(weightValue, weights);
    violations.push({
      rule: 'typography',
      severity: 'warn',
      message: `Font weight '${originalValue}' is not a standard weight`,
      file: filePath,
      line: loc.start.line,
      column: loc.start.column,
      value: originalValue,
      suggestion: suggestion ? `Use ${suggestion}` : null
    });
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

  const textSizeRegex = /text-\[(\d+(?:\.\d+)?)(px|rem|em)?\]/g;
  let match;

  while ((match = textSizeRegex.exec(classString)) !== null) {
    const pxValue = toPixelsWithUnit(parseFloat(match[1]), match[2] || 'px');
    if (!scale.some(s => Math.abs(s - pxValue) < 0.5)) {
      violations.push({
        rule: 'typography',
        severity: 'error',
        message: `Arbitrary font size '${match[0]}' (${pxValue}px) is not in the typography scale`,
        file: filePath,
        line: path.node.loc.start.line,
        column: path.node.loc.start.column + match.index,
        value: match[0],
        suggestion: `Use a Tailwind text size class`
      });
    }
  }
}

function toPixels(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  if (Array.isArray(value)) return toPixels(value[0]);
  const match = value.match(/^(\d+(?:\.\d+)?)(px|rem|em)?$/);
  if (!match) return null;
  return toPixelsWithUnit(parseFloat(match[1]), match[2] || 'px');
}

function toPixelsWithUnit(num, unit) {
  switch (unit) { case 'px': return num; case 'rem': case 'em': return num * 16; default: return num; }
}

function findClosestValue(value, array) {
  let closest = null, minDiff = Infinity;
  for (const v of array) { const diff = Math.abs(v - value); if (diff < minDiff) { minDiff = diff; closest = v; } }
  return closest;
}

export function fix(content, violation) {
  if (!violation.fix) return null;
  return content.replace(violation.fix.oldValue, violation.fix.newValue);
}

export default { meta, run, fix };
