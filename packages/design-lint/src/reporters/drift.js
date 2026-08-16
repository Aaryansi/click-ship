/**
 * Drift Reporter - what disagrees between Figma and the code
 */

import chalk from 'chalk';

export function formatDrift(drifted, { compared = 0, codeSources = [] } = {}) {
  const sources = codeSources.join(' and ') || 'the code';

  if (drifted.length === 0) {
    return chalk.green(
      `Figma and ${sources} agree on all ${compared} shared token${compared === 1 ? '' : 's'}.\n`
    );
  }

  const lines = [''];
  lines.push(chalk.yellow.bold(
    `${drifted.length} token${drifted.length === 1 ? '' : 's'} drifted from Figma` +
    chalk.dim(`  (of ${compared} compared against ${sources})`)
  ));
  lines.push('');

  for (const entry of drifted) {
    const name = chalk.bold(entry.codeName);
    const scope = chalk.dim(`[${entry.category}]`);
    lines.push(`  ${name} ${scope}`);
    lines.push(`    ${chalk.dim('code ')}${chalk.red(entry.codeValue)}   ${chalk.dim(entry.codeSource)}`);
    lines.push(`    ${chalk.dim('figma')} ${chalk.green(entry.figmaValue)}   ${chalk.dim(entry.figmaName)}`);

    const notes = [];
    if (entry.detail) notes.push(entry.detail);
    // usage count is what turns a list into a priority order
    if (entry.usages > 0) notes.push(`${entry.usages} usage${entry.usages === 1 ? '' : 's'} in code`);
    else notes.push('not referenced in the scanned files');
    lines.push(`    ${chalk.dim(notes.join('  ·  '))}`);
    lines.push('');
  }

  const visible = drifted.filter(entry => entry.visible).length;
  if (visible > 0) {
    lines.push(chalk.dim(`${visible} of these would be noticeable side by side.`));
  }
  lines.push(chalk.dim('Update whichever side is wrong. Neither is authoritative by default.'));
  lines.push('');

  return lines.join('\n');
}

export default { formatDrift };
