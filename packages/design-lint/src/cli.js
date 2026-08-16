#!/usr/bin/env node

/**
 * DesignLint CLI
 */

import { program } from 'commander';
import { isAbsolute, resolve } from 'path';
import { pathToFileURL } from 'url';
import { lint } from './index.js';
import { generateConfig } from './config.js';
import { format } from './reporters/index.js';
import { BASELINE_FILE, readBaseline, writeBaseline, classify } from './baseline.js';
import { writeFileSync } from 'fs';

// `--config` was accepted and then never passed to lint(), so pointing at a config
// file quietly did nothing
async function loadConfigFile(configPath, cwd) {
  if (!configPath) return undefined;

  const absolute = isAbsolute(configPath) ? configPath : resolve(cwd, configPath);
  const module = await import(pathToFileURL(absolute).href);
  return module.default || module;
}

program
  .name('design-lint')
  .description('Design system enforcement for your codebase')
  .version('1.0.0');

program
  .argument('[patterns...]', 'File patterns to lint', ['src/**/*.{tsx,jsx,ts,js}'])
  .option('-c, --config <path>', 'Path to config file')
  .option('-f, --format <type>', 'Output format (console, json, sarif, github)', 'console')
  .option('--fix', 'Attempt to fix violations')
  .option('--baseline', `Record current violations to ${BASELINE_FILE} and exit`)
  .option('--baseline-file <path>', 'Path to the baseline file', BASELINE_FILE)
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

      const cwd = process.cwd();
      const baselinePath = isAbsolute(options.baselineFile)
        ? options.baselineFile
        : resolve(cwd, options.baselineFile);

      // Run linting
      const result = await lint(patterns, {
        cwd,
        fix: options.fix,
        config: await loadConfigFile(options.config, cwd)
      });

      // Show fixed files if any
      if (options.fix && result.fixedFiles?.length > 0) {
        console.log(`Fixed ${result.fixedFiles.length} file(s)\n`);
      }

      if (options.baseline) {
        const written = writeBaseline(baselinePath, result.violations);
        console.log(
          `Recorded ${written.total} violation${written.total === 1 ? '' : 's'} to ${options.baselineFile}.\n` +
          'Future runs will only fail on violations added after this point.'
        );
        process.exit(0);
      }

      const baseline = readBaseline(baselinePath);
      const { known, added, fixed } = classify(result.violations, baseline);

      // with a baseline, only the new violations are worth printing: the known ones are
      // the debt someone already agreed to live with, and burying the new ones in
      // thousands of old ones is what makes people stop reading the output
      const output = format(baseline ? added : result.violations, options.format, {
        verbose: options.verbose
      });
      console.log(output);

      if (baseline) {
        const parts = [`${known.length} known`];
        if (fixed > 0) parts.push(`${fixed} fixed`);
        parts.push(`${added.length} new`);
        console.log(`Baseline: ${parts.join(', ')}.`);

        if (fixed > 0) {
          console.log(`Re-run with --baseline to lock in the ${fixed} you fixed.`);
        }
      }

      // only new errors gate the run. pre-existing ones are recorded debt, not a
      // reason to fail somebody's unrelated change
      const gating = baseline ? added : result.violations;
      process.exit(gating.some(v => v.severity === 'error') ? 1 : 0);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
