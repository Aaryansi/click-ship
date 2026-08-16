/**
 * Console Reporter - Terminal output with colors
 */

import chalk from 'chalk';

const plural = (n) => (n === 1 ? '' : 's');

export function format(violations, options = {}) {
  if (violations.length === 0) {
    return chalk.green('No design system violations found!\n');
  }

  const { verbose = false } = options;
  const lines = [];
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

      if (v.suggestion && verbose) {
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
