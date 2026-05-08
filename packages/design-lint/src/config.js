/**
 * Configuration loader for design-lint
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

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
          const module = await import('file://' + configPath);
          return mergeConfig(module.default || module);
        }
      } catch (error) {
        console.warn('Warning: Failed to load config from ' + configPath + ': ' + error.message);
      }
    }
  }

  return DEFAULT_CONFIG;
}

function mergeConfig(userConfig) {
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
export default { loadConfig, generateConfig, DEFAULT_CONFIG };
