/**
 * HTML Reporter - a shareable snapshot of design system health
 *
 * One self-contained file: no external stylesheet, no script, no font, no network.
 * A report that only renders on a machine with connectivity is not much use as an
 * artifact you attach to a pull request or hand to someone.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// violation values and file paths are attacker-influenced in the sense that they come
// from whatever is in the source, so nothing reaches the document unescaped
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ESCAPES[char]);
}

function groupBy(items, key) {
  const groups = new Map();
  for (const item of items) {
    const value = item[key];
    groups.set(value, (groups.get(value) ?? 0) + 1);
  }
  return [...groups.entries()].sort((a, b) => b[1] - a[1]);
}

function bar(count, max) {
  const width = max > 0 ? Math.round((count / max) * 100) : 0;
  return `<div class="bar"><span style="width:${width}%"></span></div>`;
}

/**
 * @param violations  what the run found
 * @param options.files      every file scanned, so "clean" has a denominator
 * @param options.drift      output of findDrift, when a Figma export exists
 * @param options.baseline   classification against a recorded baseline
 */
export function format(violations, options = {}) {
  const { files = [], drift = null, baseline = null, projectName = '' } = options;

  const errors = violations.filter(v => v.severity === 'error').length;
  const warnings = violations.filter(v => v.severity === 'warn').length;

  const filesWithViolations = new Set(violations.map(v => v.file));
  const scanned = files.length;
  const clean = Math.max(0, scanned - filesWithViolations.size);

  // deliberately "files with no violations" rather than a percentage of values
  // tokenized. the honest denominator for the latter is every value the rules could
  // have examined, which nothing currently counts, and inventing one produces a
  // headline number that is subtly wrong in a way nobody can check.
  // floored, and 100 reserved for genuinely spotless: rounding printed "100% clean"
  // with a file listed as dirty in the table directly underneath
  const cleanPct = scanned === 0 || clean === scanned
    ? 100
    : Math.min(99, Math.floor((clean / scanned) * 100));

  const byRule = groupBy(violations, 'rule');
  const byFile = groupBy(violations, 'file').slice(0, 10);
  const worstCount = byFile.length > 0 ? byFile[0][1] : 0;

  const generated = new Date().toISOString().replace('T', ' ').slice(0, 16);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design system report${projectName ? ` — ${escapeHtml(projectName)}` : ''}</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff; --fg: #18181b; --muted: #71717a; --line: #e4e4e7;
    --card: #fafafa; --error: #dc2626; --warn: #d97706; --ok: #16a34a; --accent: #6366f1;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0b0b0e; --fg: #f4f4f5; --muted: #a1a1aa; --line: #27272a;
      --card: #141418; --error: #f87171; --warn: #fbbf24; --ok: #4ade80; --accent: #818cf8;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2.5rem 1.5rem; background: var(--bg); color: var(--fg);
    font: 15px/1.6 ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
  }
  main { max-width: 52rem; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 .25rem; letter-spacing: -.01em; }
  h2 { font-size: .8rem; text-transform: uppercase; letter-spacing: .08em;
       color: var(--muted); margin: 2.5rem 0 .75rem; font-weight: 600; }
  .sub { color: var(--muted); margin: 0 0 2rem; font-size: .9rem; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: .75rem; }
  .tile { background: var(--card); border: 1px solid var(--line); border-radius: .6rem; padding: 1rem; }
  .tile .n { font-size: 1.9rem; font-weight: 650; letter-spacing: -.02em; line-height: 1.1; }
  .tile .l { color: var(--muted); font-size: .78rem; margin-top: .15rem; }
  .err { color: var(--error); } .wrn { color: var(--warn); } .ok { color: var(--ok); }
  table { width: 100%; border-collapse: collapse; }
  td { padding: .45rem 0; border-bottom: 1px solid var(--line); vertical-align: middle; }
  td.n { text-align: right; width: 3.5rem; font-variant-numeric: tabular-nums; color: var(--muted); }
  td.b { width: 40%; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85em; }
  .bar { background: var(--line); border-radius: 999px; height: .4rem; overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--accent); border-radius: 999px; }
  .drift { background: var(--card); border: 1px solid var(--line); border-radius: .6rem;
           padding: .85rem 1rem; margin-bottom: .6rem; }
  .drift .name { font-weight: 600; }
  .swatch { display: inline-block; width: .8rem; height: .8rem; border-radius: .2rem;
            border: 1px solid var(--line); vertical-align: -1px; margin-right: .3rem; }
  .empty { color: var(--muted); font-style: italic; }
  footer { color: var(--muted); font-size: .78rem; margin-top: 3rem;
           border-top: 1px solid var(--line); padding-top: 1rem; }
  .wrap { overflow-x: auto; }
</style>
</head>
<body>
<main>
  <h1>Design system report${projectName ? ` <span class="sub">${escapeHtml(projectName)}</span>` : ''}</h1>
  <p class="sub">${scanned} file${scanned === 1 ? '' : 's'} scanned · ${generated} UTC</p>

  <div class="tiles">
    <div class="tile"><div class="n ${clean === scanned ? 'ok' : ''}">${cleanPct}%</div><div class="l">files with no violations</div></div>
    <div class="tile"><div class="n ${errors > 0 ? 'err' : 'ok'}">${errors}</div><div class="l">error${errors === 1 ? '' : 's'}</div></div>
    <div class="tile"><div class="n ${warnings > 0 ? 'wrn' : 'ok'}">${warnings}</div><div class="l">warning${warnings === 1 ? '' : 's'}</div></div>
    ${baseline ? `<div class="tile"><div class="n ${baseline.added.length > 0 ? 'err' : 'ok'}">${baseline.added.length}</div><div class="l">new since baseline</div></div>` : ''}
    ${baseline && baseline.fixed > 0 ? `<div class="tile"><div class="n ok">${baseline.fixed}</div><div class="l">fixed since baseline</div></div>` : ''}
  </div>

  <h2>By rule</h2>
  ${byRule.length === 0 ? '<p class="empty">Nothing to report.</p>' : `<div class="wrap"><table>
    ${byRule.map(([rule, count]) => `<tr>
      <td><code>${escapeHtml(rule)}</code></td>
      <td class="b">${bar(count, byRule[0][1])}</td>
      <td class="n">${count}</td>
    </tr>`).join('')}
  </table></div>`}

  <h2>Files with the most violations</h2>
  ${byFile.length === 0 ? '<p class="empty">Every scanned file is clean.</p>' : `<div class="wrap"><table>
    ${byFile.map(([file, count]) => `<tr>
      <td><code>${escapeHtml(file)}</code></td>
      <td class="b">${bar(count, worstCount)}</td>
      <td class="n">${count}</td>
    </tr>`).join('')}
  </table></div>`}

  <h2>Figma drift</h2>
  ${renderDrift(drift)}

  <footer>
    Generated by design-lint. ${baseline
      ? `Measured against a baseline of ${baselineTotal(baseline)} recorded violation${baselineTotal(baseline) === 1 ? '' : 's'}.`
      : 'No baseline recorded; every violation is counted.'}
  </footer>
</main>
</body>
</html>
`;
}

// the baseline recorded everything, including entries in files this run did not open,
// so leaving those out understates what the report is measured against
function baselineTotal(baseline) {
  return baseline.known.length + baseline.fixed + (baseline.unscanned ?? 0);
}

function renderDrift(drift) {
  if (!drift) return '<p class="empty">No Figma export found, so nothing was compared.</p>';
  if (!drift.available) {
    // pointing someone at the wrong missing thing wastes more time than saying nothing
    return drift.reason === 'no code tokens'
      ? '<p class="empty">A Figma export was found, but no code tokens to compare it against. Add a Tailwind config, CSS variables or a tokens.json.</p>'
      : '<p class="empty">No Figma export found, so nothing was compared.</p>';
  }
  if (drift.drifted.length === 0) {
    return `<p class="ok">Figma and the code agree on all ${drift.compared} shared token${drift.compared === 1 ? '' : 's'}.</p>`;
  }

  return drift.drifted.map(entry => {
    // only paint a swatch for something that is actually a colour
    const swatch = /^#[0-9a-f]{3,8}$/i.test(String(entry.codeValue ?? ''))
      ? `<span class="swatch" style="background:${escapeHtml(entry.codeValue)}"></span>`
      : '';
    const figmaSwatch = /^#[0-9a-f]{3,8}$/i.test(String(entry.figmaValue ?? ''))
      ? `<span class="swatch" style="background:${escapeHtml(entry.figmaValue)}"></span>`
      : '';

    return `<div class="drift">
      <div class="name"><code>${escapeHtml(entry.codeName)}</code> <span class="sub">${escapeHtml(entry.category)}</span></div>
      <div>${swatch}code <code class="err">${escapeHtml(entry.codeValue)}</code>
           &nbsp; ${figmaSwatch}figma <code class="ok">${escapeHtml(entry.figmaValue)}</code></div>
      <div class="sub">${escapeHtml([entry.detail, entry.usages !== undefined
        ? `${entry.usages} usage${entry.usages === 1 ? '' : 's'} in code` : null]
        .filter(Boolean).join('  ·  '))}</div>
    </div>`;
  }).join('');
}

export default { format };
