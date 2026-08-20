/**
 * Console Reporter - Terminal output with colors
 */

import chalk from 'chalk';
import { basename } from 'path';

const plural = (n) => (n === 1 ? '' : 's');

/**
 * What the tool decided your design system is.
 *
 * Worth saying out loud, because the failure that matters here is silent: with no token
 * source found, every rule falls back to built-in defaults and then reports confidently
 * against a design system that is not yours. That looks identical to working.
 */
export function describeSources(tokens, { verbose = false } = {}) {
  const sources = tokens?.sources ?? [];

  if (sources.length === 0) {
    return chalk.yellow(
      'No design tokens found, so this ran against built-in defaults rather than your ' +
      'design system.\n' +
      chalk.dim('  Expected a tailwind config, a stylesheet declaring custom properties, or a tokens.json.')
    );
  }

  const counted = sources.map(source => {
    const paths = Array.isArray(source.path) ? source.path : [source.path];
    // -v prints the whole path, because "which globals.css?" is a real question in a
    // monorepo and a basename cannot answer it
    const label = verbose
      ? paths.join(', ')
      : (paths.length > 1 ? `${paths.length} stylesheets` : basename(String(paths[0])));
    return `${source.type} (${label})`;
  });

  const total = countTokens(tokens);
  const summary = `Tokens from ${counted.join(', ')}` + (total ? ` — ${total} token${plural(total)}` : '');
  return chalk.dim(summary);
}

function countTokens(tokens) {
  if (!tokens) return 0;
  const typography = tokens.typography ?? {};
  const groups = [
    tokens.colors, tokens.spacing, tokens.borderRadius, tokens.shadows,
    typography.fontSize, typography.fontFamily, typography.fontWeight, typography.lineHeight
  ];
  return groups.reduce((total, group) => total + Object.keys(group ?? {}).length, 0);
}

export function format(violations, options = {}) {
  const { tokens, verbose = false } = options;
  // a run that found nothing has to say so whether or not it found violations
  const preamble = tokens ? describeSources(tokens, { verbose }) + '\n' : '';

  if (violations.length === 0) {
    return preamble + chalk.green('No design system violations found!\n');
  }

  const lines = [preamble.trimEnd()].filter(Boolean);
  const byFile = groupByFile(violations);

  lines.push('');
  lines.push(chalk.red.bold(
    violations.length + ' Design System Violation' + plural(violations.length)
  ));
  lines.push('');

  for (const [file, fileViolations] of Object.entries(byFile)) {
    lines.push(chalk.underline(file));

    for (const v of fileViolations) {
      const severity = v.severity === 'error' ? chalk.red('x') : chalk.yellow('!');
      // violations carry babel's 0-based column. editors, eslint and stylelint all
      // report columns 1-based, so printing it raw sent people one character to the
      // left of the thing being complained about.
      const location = chalk.dim(
        Math.max(1, v.line ?? 1) + ':' + (Math.max(0, v.column ?? 0) + 1)
      );
      const rule = chalk.dim('[' + v.rule + ']');

      lines.push('  ' + location + '  ' + severity + ' ' + v.message + ' ' + rule);

      // shown by default. the suggestion is the part someone can act on, and hiding it
      // behind -v meant the common run told people they had a problem and not what to do
      // about it. the github and eslint reporters have always shown it.
      if (v.suggestion) {
        lines.push(chalk.cyan('         -> ' + v.suggestion));
      }
    }
    lines.push('');
  }

  const errors = violations.filter(v => v.severity === 'error').length;
  const warnings = violations.filter(v => v.severity === 'warn').length;

  lines.push(chalk.bold('Summary:'));
  if (errors > 0) lines.push(chalk.red('  ' + errors + ' error' + plural(errors)));
  if (warnings > 0) lines.push(chalk.yellow('  ' + warnings + ' warning' + plural(warnings)));
  lines.push('');

  return lines.join('\n');
}

function groupByFile(violations) {
  const groups = {};
  for (const v of violations) {
    const file = v.file || 'unknown';
    if (!groups[file]) groups[file] = [];
    groups[file].push(v);
  }
  return groups;
}

export function summary(violations) {
  const errors = violations.filter(v => v.severity === 'error').length;
  const warnings = violations.filter(v => v.severity === 'warn').length;
  return { total: violations.length, errors, warnings };
}

export default { format, summary };
