#!/usr/bin/env node

/**
 * DesignLint CLI
 */

import { program } from 'commander';
import { lint } from './index.js';
import { loadConfig, generateConfig } from './config.js';
import { format } from './reporters/index.js';
import { writeFileSync } from 'fs';

program
  .name('design-lint')
  .description('Design system enforcement for your codebase')
  .version('1.0.0');

program
  .argument('[patterns...]', 'File patterns to lint', ['src/**/*.{tsx,jsx,ts,js}'])
  .option('-c, --config <path>', 'Path to config file')
  .option('-f, --format <type>', 'Output format (console, json, sarif, github)', 'console')
  .option('--fix', 'Attempt to fix violations')
  .option('-v, --verbose', 'Show detailed output')
  .option('--init', 'Generate config file')
  .action(async (patterns, options) => {
    try {
      // Handle init
      if (options.init) {
        const configContent = generateConfig();
        writeFileSync('design-lint.config.js', configContent);
        console.log('Created design-lint.config.js');
        process.exit(0);
      }

      // Run linting
      const result = await lint(patterns, {
        cwd: process.cwd(),
        fix: options.fix
      });

      // Format output
      const output = format(result.violations, options.format, {
        verbose: options.verbose
      });

      console.log(output);

      // Exit with error if violations found
      const hasErrors = result.violations.some(v => v.severity === 'error');
      process.exit(hasErrors ? 1 : 0);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
