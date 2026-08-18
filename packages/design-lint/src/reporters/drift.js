/**
 * Drift Reporter - what disagrees between Figma and the code
 */

import chalk from 'chalk';

/**
 * Why there was nothing to compare.
 *
 * "no drift" and "we never checked" look identical in a green build, so every caller has
 * to be able to say which one happened, in the same words.
 */
export function explainUnavailable(reason) {
  if (reason === 'no code tokens') {
    return 'No code tokens found. Add a tailwind config, CSS variables or a tokens.json.';
  }
  if (reason === 'no shared tokens') {
    return 'A Figma export was found, but none of its token names line up with the code. Nothing was compared.';
  }
  return 'No Figma export found. Commit a Tokens Studio export as figma-tokens.json, tokens/figma.json or .figma/tokens.json.';
}

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

export default { formatDrift, explainUnavailable };
