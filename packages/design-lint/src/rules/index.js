/**
 * Design Lint Rules
 *
 * Registry of all available linting rules
 */

import { fingerprint } from '../baseline.js';
import { parse } from '@babel/parser';
import { scanDeclarations } from '../css/declarations.js';
import { collectEmbeddedCSS } from '../css/embedded.js';
import colorTokens from './color-tokens.js';
import spacingScale from './spacing-scale.js';
import typography from './typography.js';
import borderRadius from './border-radius.js';

/**
 * All available rules
 */
export const rules = {
  'color-tokens': colorTokens,
  'spacing-scale': spacingScale,
  'typography': typography,
  'border-radius': borderRadius
};

/**
 * Default rule configuration
 */
export const defaultRuleConfig = {
  'color-tokens': 'error',
  'spacing-scale': 'warn',
  'typography': 'error',
  'border-radius': 'warn'
};

/**
 * Get a rule by name
 */
export function getRule(name) {
  return rules[name] || null;
}

/**
 * Get all rule names
 */
export function getRuleNames() {
  return Object.keys(rules);
}

/**
 * Get rule metadata
 */
export function getRuleMeta(name) {
  const rule = rules[name];
  return rule ? rule.meta : null;
}

/**
 * Run a specific rule
 */
export function runRule(name, context) {
  const rule = rules[name];
  if (!rule) {
    throw new Error(`Unknown rule: ${name}`);
  }

  return rule.run(context);
}

/**
 * Run all enabled rules
 */
// which files are stylesheets rather than javascript
const STYLESHEET = /\.(css|scss|sass|less|pcss|postcss)$/i;

function parseOnce(code) {
  try {
    return parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
      errorRecovery: true
    });
  } catch {
    // a file babel cannot read is one this tool has nothing to say about
    return null;
  }
}

// declarations found in styled-components templates, positioned as they sit in the file
function embeddedDeclarations(ast, code) {
  if (!ast) return [];

  return collectEmbeddedCSS(ast, code).flatMap(block =>
    scanDeclarations(block.text, { initialDepth: 1 }).map(declaration => ({
      ...declaration,
      start: declaration.start + block.offset,
      end: declaration.end + block.offset
    }))
  );
}

export function runAllRules(context) {
  const { config } = context;
  const isStylesheet = STYLESHEET.test(context.filePath ?? '');

  // parsed once and shared. every rule used to parse the same file itself, so a component
  // was run through babel four times to answer one question.
  const ast = isStylesheet ? null : parseOnce(context.code);

  // scanned once and shared, rather than each rule walking the same stylesheet again.
  // for javascript this is the css inside styled-components templates.
  const declarations = isStylesheet
    ? scanDeclarations(context.code)
    : embeddedDeclarations(ast, context.code);
  const allViolations = [];
  // the one place every violation passes through, so the single choke point for
  // stamping a stable identity onto each one

  for (const [name, rule] of Object.entries(rules)) {
    // Check if rule is enabled
    const ruleConfig = config.rules?.[name];

    if (ruleConfig === 'off' || ruleConfig === false) {
      continue;
    }

    if (ruleConfig === undefined && defaultRuleConfig[name] === undefined) {
      continue;
    }

    try {
      // a stylesheet has no javascript ast, so the rules take their other entry point
      const violations = isStylesheet
        ? (rule.runCSS?.({ ...context, declarations }) ?? [])
        : rule.run({ ...context, ast });
      allViolations.push(...violations);

      // css inside a styled-components template is css, and the ast rules do not see it
      if (!isStylesheet && declarations.length > 0) {
        allViolations.push(...(rule.runCSS?.({ ...context, declarations }) ?? []));
      }
    } catch (error) {
      console.warn(`Warning: Rule '${name}' failed: ${error.message}`);
    }
  }

  for (const violation of allViolations) {
    violation.fingerprint = fingerprint(violation);
  }

  return allViolations;
}

/**
 * Apply fix for a violation
 */
export function applyFix(name, content, violation, tokens) {
  const rule = rules[name];
  if (!rule || !rule.fix) {
    return null;
  }

  return rule.fix(content, violation, tokens);
}

/**
 * Check if a rule is fixable
 */
export function isFixable(name) {
  const rule = rules[name];
  return rule?.meta?.fixable === true;
}

export {
  colorTokens,
  spacingScale,
  typography,
  borderRadius
};

export default {
  rules,
  defaultRuleConfig,
  getRule,
  getRuleNames,
  getRuleMeta,
  runRule,
  runAllRules,
  applyFix,
  isFixable
};
