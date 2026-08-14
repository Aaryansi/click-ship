/**
 * Configuration loader for design-lint
 */

import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';

const CONFIG_FILES = [
  'design-lint.config.js',
  'design-lint.config.mjs',
  '.design-lintrc',
  '.design-lintrc.json',
  '.design-lintrc.js'
];

const DEFAULT_CONFIG = {
  extends: 'auto',
  rules: {
    'color-tokens': 'error',
    'spacing-scale': 'warn',
    'typography': 'error',
    'border-radius': 'warn'
  },
  ignore: [
    '**/node_modules/**',
    '**/*.test.tsx',
    '**/*.test.ts',
    '**/*.spec.tsx',
    '**/*.spec.ts',
    '**/dist/**',
    '**/build/**'
  ]
};

export async function loadConfig(rootDir) {
  for (const configFile of CONFIG_FILES) {
    const configPath = join(rootDir, configFile);

    if (existsSync(configPath)) {
      try {
        if (configFile.endsWith('.json') || configFile === '.design-lintrc') {
          const content = readFileSync(configPath, 'utf-8');
          return mergeConfig(JSON.parse(content));
        }

        if (configFile.endsWith('.js') || configFile.endsWith('.mjs')) {
          // pathToFileURL on an absolute path, not string concatenation. 'file://' + a
          // relative path parses as file://<first-segment>/... so the segment becomes a
          // host, and node rejects it with 'File URL host must be "localhost" or empty'.
          // the failure was swallowed by the catch below, so a relative cwd silently
          // fell back to DEFAULT_CONFIG and the project's own rules were ignored.
          const module = await import(pathToFileURL(resolve(configPath)).href);
          return mergeConfig(module.default || module);
        }
      } catch (error) {
        console.warn('Warning: Failed to load config from ' + configPath + ': ' + error.message);
      }
    }
  }

  return DEFAULT_CONFIG;
}

export function mergeConfig(userConfig) {
  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    rules: { ...DEFAULT_CONFIG.rules, ...userConfig.rules },
    ignore: userConfig.ignore || DEFAULT_CONFIG.ignore
  };
}

export function generateConfig() {
  return 'export default ' + JSON.stringify(DEFAULT_CONFIG, null, 2) + ';';
}

export { DEFAULT_CONFIG };
export default { loadConfig, mergeConfig, generateConfig, DEFAULT_CONFIG };
