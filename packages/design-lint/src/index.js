/**
 * DesignLint - Design system enforcement for your codebase
 *
 * @module @click-ship/design-lint
 */

import { readFileSync } from 'fs';
import fg from 'fast-glob';
import { loadConfig } from './config.js';
import { parseAllTokens } from './parsers/index.js';
import { runAllRules, rules } from './rules/index.js';
import { format, print } from './reporters/index.js';

/**
 * Lint files for design system violations
 */
export async function lint(patterns, options = {}) {
  const {
    cwd = process.cwd(),
    config: userConfig,
    fix = false
  } = options;

  // Load configuration
  const config = userConfig || await loadConfig(cwd);

  // Parse design tokens
  const tokens = await parseAllTokens(cwd, config.tokens);

  // Find files to lint
  const files = await fg(patterns, {
    cwd,
    ignore: config.ignore || [],
    absolute: true
  });

  const allViolations = [];

  // Lint each file
  for (const filePath of files) {
    try {
      const code = readFileSync(filePath, 'utf-8');
      const relativePath = filePath.replace(cwd, '').replace(/^[\/\\]/, '');

      const context = {
        code,
        filePath: relativePath,
        tokens,
        config
      };

      const violations = runAllRules(context);
      allViolations.push(...violations);
    } catch (error) {
      console.warn('Warning: Failed to lint ' + filePath + ': ' + error.message);
    }
  }

  return {
    violations: allViolations,
    fileCount: files.length,
    tokens
  };
}

/**
 * Lint a single file
 */
export async function lintFile(filePath, options = {}) {
  const { cwd = process.cwd(), tokens, config } = options;

  const code = readFileSync(filePath, 'utf-8');
  const relativePath = filePath.replace(cwd, '').replace(/^[\/\\]/, '');

  const context = {
    code,
    filePath: relativePath,
    tokens: tokens || await parseAllTokens(cwd),
    config: config || await loadConfig(cwd)
  };

  return runAllRules(context);
}

/**
 * Lint code string directly
 */
export function lintCode(code, options = {}) {
  const { filePath = 'input.tsx', tokens = {}, config = {} } = options;

  const context = {
    code,
    filePath,
    tokens,
    config
  };

  return runAllRules(context);
}

// Re-export modules
export { loadConfig } from './config.js';
export { parseAllTokens } from './parsers/index.js';
export { rules, runAllRules } from './rules/index.js';
export { format, print } from './reporters/index.js';

export default {
  lint,
  lintFile,
  lintCode,
  loadConfig,
  parseAllTokens,
  rules,
  format
};
