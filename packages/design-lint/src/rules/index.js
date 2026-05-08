/**
 * Design Lint Rules
 *
 * Registry of all available linting rules
 */

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
export function runAllRules(context) {
  const { config } = context;
  const allViolations = [];

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
      const violations = rule.run(context);
      allViolations.push(...violations);
    } catch (error) {
      console.warn(`Warning: Rule '${name}' failed: ${error.message}`);
    }
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
