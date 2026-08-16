#!/usr/bin/env node

/**
 * DesignLint CLI
 */

import { program } from 'commander';
import { isAbsolute, resolve } from 'path';
import { pathToFileURL } from 'url';
import { lint } from './index.js';
import { loadConfig, generateConfig } from './config.js';
import { format } from './reporters/index.js';
import { BASELINE_FILE, readBaseline, writeBaseline, classify } from './baseline.js';
import { writeFileSync, readFileSync } from 'fs';
import fg from 'fast-glob';
import { parseAllTokens } from './parsers/index.js';
import { findDrift, countUsages } from './drift.js';
import { formatDrift } from './reporters/drift.js';

// `--config` was accepted and then never passed to lint(), so pointing at a config
// file quietly did nothing
async function loadConfigFile(configPath, cwd) {
  if (!configPath) return undefined;

  const absolute = isAbsolute(configPath) ? configPath : resolve(cwd, configPath);
  const href = pathToFileURL(absolute).href;

  // json is a supported config format, and importing one without the attribute throws
  if (absolute.endsWith('.json')) {
    const module = await import(href, { with: { type: 'json' } });
    return module.default;
  }

  const module = await import(href);
  return module.default || module;
}

program
  .name('design-lint')
  .description('Design system enforcement for your codebase')
  .version('1.0.0');

program
  .command('drift')
  .description('Report tokens that disagree between Figma and the code')
  .argument('[patterns...]', 'Files to count token usages in', ['src/**/*.{tsx,jsx,ts,js}'])
  .option('--fail-on-drift', 'Exit non-zero when any token has drifted', false)
  .action(async (patterns, options) => {
    try {
      const cwd = process.cwd();
      const tokens = await parseAllTokens(cwd);
      const result = findDrift(tokens);

      if (!result.available) {
        // saying "no drift" when there was nothing to compare would be a lie
        console.log(
          result.reason === 'no code tokens'
            ? 'No code tokens found. Add a tailwind config, CSS variables or a tokens.json.'
            : 'No Figma export found. Commit a Tokens Studio export as figma-tokens.json, tokens/figma.json or .figma/tokens.json.'
        );
        process.exit(0);
      }

      // the project's ignore list, not an empty one: counting usages must not walk
      // node_modules and attribute a dependency's classes to this codebase
      const { ignore } = await loadConfig(cwd);
      const files = await fg(patterns, { cwd, ignore: ignore ?? [], absolute: true });
      const sources = files.map(file => readFileSync(file, 'utf-8'));

      const withUsage = result.drifted
        .map(entry => ({ ...entry, usages: countUsages(sources, entry.codeName) }))
        .sort((a, b) => b.usages - a.usages || Number(b.visible) - Number(a.visible));

      console.log(formatDrift(withUsage, {
        compared: result.compared,
        codeSources: result.codeSources
      }));

      process.exit(options.failOnDrift && withUsage.length > 0 ? 1 : 0);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

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
        // `--baseline mine.json` is a natural typo: --baseline takes no argument, so
        // mine.json is parsed as the *pattern*, matches nothing, and would otherwise
        // overwrite a populated baseline with an empty one
        if (result.fileCount === 0) {
          console.error(
            `Refusing to write a baseline: no files matched ${patterns.join(', ')}.\n` +
            'Check the pattern, or pass --baseline-file to choose where it is written.'
          );
          process.exit(1);
        }

        const written = writeBaseline(baselinePath, result.violations);
        console.log(
          `Recorded ${written.total} violation${written.total === 1 ? '' : 's'} to ${options.baselineFile}.\n` +
          'Future runs will only fail on violations added after this point.'
        );
        process.exit(0);
      }

      const baseline = readBaseline(baselinePath);
      const { known, added, fixed, unscanned } = classify(result.violations, baseline, result.files);

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
        if (unscanned > 0) parts.push(`${unscanned} in files not scanned`);

        // stderr, so `-f json > out.json` stays parseable. this used to be appended to
        // stdout after the formatter, which made json and sarif output invalid.
        console.error(`Baseline: ${parts.join(', ')}.`);

        // only worth suggesting when this run actually covered everything the baseline
        // knows about, otherwise re-recording would quietly drop the untouched files
        if (fixed > 0 && unscanned === 0) {
          console.error(`Re-run with --baseline to lock in the ${fixed} you fixed.`);
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
