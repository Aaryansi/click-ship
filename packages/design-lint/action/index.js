/**
 * GitHub Action entry point for Design Lint
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { writeFileSync, existsSync } from 'fs';
import { isAbsolute, resolve, relative, posix, sep } from 'path';
import { pathToFileURL } from 'url';
import { lint } from '../src/index.js';
import { loadConfig } from '../src/config.js';
import { BASELINE_FILE, readBaseline, classify } from '../src/baseline.js';
import { findDrift, withUsageCounts } from '../src/drift.js';
import { explainUnavailable } from '../src/reporters/drift.js';
import { formatPRComment, formatDriftSection } from '../src/reporters/github.js';
import { format as formatSarif } from '../src/reporters/sarif.js';

// lets a re-run find and update its own comment instead of stacking a new one on the PR
// every time someone pushes
const COMMENT_MARKER = '<!-- design-lint-report -->';

// how many violations become inline annotations. GitHub silently drops annotations past
// ~50 per run, so there is no point emitting more
const MAX_ANNOTATIONS = 50;

// drift shares that same budget. on first adoption a repo can easily have 60+ drifted
// tokens, and emitting one warning each pushed every real lint annotation out of the run
const MAX_DRIFT_WARNINGS = 10;

// core.getBooleanInput throws when the value is empty, which happens whenever an input
// is left out and action.yml's default is not applied (composite actions, older runners,
// anything invoking the bundle directly). a missing flag should fall back, not crash.
function booleanInput(name, fallback) {
  const raw = core.getInput(name).trim().toLowerCase();
  if (raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;

  core.warning(`Input '${name}' expected true or false but got '${raw}', using ${fallback}.`);
  return fallback;
}

function parsePatterns(raw) {
  const patterns = (raw || '')
    .split(',')
    .map(pattern => pattern.trim())
    .filter(Boolean);

  return patterns.length > 0 ? patterns : ['src/**/*.{tsx,jsx,ts,js}'];
}

/**
 * Load a config file named by the `config` input.
 *
 * The old code called require() here, which does not exist in this package: it is
 * "type": "module", so the whole action is ESM and any run that set the input crashed
 * with "require is not defined". Dynamic import needs a file:// URL for absolute paths
 * on Windows, and JSON needs an import attribute.
 */
async function loadConfigInput(configPath, cwd) {
  if (!configPath) return undefined;

  const absolute = isAbsolute(configPath) ? configPath : resolve(cwd, configPath);
  const href = pathToFileURL(absolute).href;

  if (absolute.endsWith('.json')) {
    const module = await import(href, { with: { type: 'json' } });
    return module.default;
  }

  const module = await import(href);
  return module.default || module;
}

async function upsertComment(octokit, { owner, repo, issueNumber, body }) {
  const marked = `${COMMENT_MARKER}\n${body}`;

  // listComments returns oldest first, so an unpaginated call only sees the first 100
  // and a busy PR would start stacking new comments again, which is the thing the
  // marker exists to prevent
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100
  });

  const existing = comments.find(comment => comment.body?.includes(COMMENT_MARKER));

  if (existing) {
    await octokit.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body: marked });
    return 'updated';
  }

  await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body: marked });
  return 'created';
}

/**
 * Rewrite violation paths so they are relative to the repository root.
 *
 * lint() reports paths relative to its own cwd, i.e. to working-directory. GitHub
 * resolves both annotation `file=` and SARIF `artifactLocation.uri` against the
 * repo root, so in a monorepo every annotation pointed at a path that does not
 * exist and was silently dropped from the diff, and SARIF attributed alerts to
 * files that were not there. PR comment blob links 404 for the same reason.
 */
function toWorkspacePaths(violations, cwd) {
  const workspace = process.env.GITHUB_WORKSPACE;
  if (!workspace) return violations;

  const prefix = relative(workspace, cwd);
  // already at the root, or somehow outside the workspace, in which case leave it be
  if (!prefix || prefix.startsWith('..') || isAbsolute(prefix)) return violations;

  const posixPrefix = prefix.split(sep).join(posix.sep);
  return violations.map(violation => ({
    ...violation,
    file: posix.join(posixPrefix, String(violation.file).split(sep).join(posix.sep))
  }));
}

function annotate(violations) {
  for (const violation of violations.slice(0, MAX_ANNOTATIONS)) {
    const annotation = {
      file: violation.file,
      startLine: violation.line,
      title: `design-lint(${violation.rule})`
    };

    if (violation.severity === 'error') {
      core.error(violation.message, annotation);
    } else {
      core.warning(violation.message, annotation);
    }
  }
}

async function writeSummary({ violations, errors, warnings, fileCount, drift }) {
  const byRule = new Map();
  for (const violation of violations) {
    byRule.set(violation.rule, (byRule.get(violation.rule) || 0) + 1);
  }

  const summary = core.summary
    .addHeading('Design Lint', 2)
    .addRaw(`Scanned **${fileCount}** file${fileCount === 1 ? '' : 's'}. `)
    .addRaw(`Found **${errors}** error${errors === 1 ? '' : 's'} and **${warnings}** warning${warnings === 1 ? '' : 's'}.`)
    .addBreak();

  if (byRule.size > 0) {
    summary.addTable([
      [{ data: 'Rule', header: true }, { data: 'Violations', header: true }],
      ...[...byRule.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([rule, count]) => [rule, String(count)])
    ]);
  }

  if (drift?.available) {
    summary.addBreak();
    summary.addRaw(drift.drifted.length === 0
      ? `Figma and the code agree on all **${drift.compared}** shared tokens.`
      : `**${drift.drifted.length}** of **${drift.compared}** shared tokens have drifted from Figma.`);
  }

  // never let a cosmetic summary sink an otherwise good run
  try {
    await summary.write();
  } catch (error) {
    core.debug(`Could not write job summary: ${error.message}`);
  }
}

async function run() {
  try {
    const workingDirectory = core.getInput('working-directory') || process.cwd();
    const cwd = isAbsolute(workingDirectory) ? workingDirectory : resolve(process.cwd(), workingDirectory);

    // a typo here used to lint zero files and report a clean pass forever, which is the
    // worst possible failure for a checker: green while checking nothing
    if (!existsSync(cwd)) {
      core.setFailed(`working-directory '${workingDirectory}' does not exist (resolved to ${cwd})`);
      return;
    }

    const patterns = parsePatterns(core.getInput('patterns'));
    const failOnError = booleanInput('fail-on-error', true);
    const commentOnPR = booleanInput('comment-on-pr', true);
    const githubToken = core.getInput('github-token');
    const sarifFile = core.getInput('sarif-file') || 'design-lint-results.sarif';
    const baselineFile = core.getInput('baseline-file') || BASELINE_FILE;
    const checkDrift = booleanInput('check-drift', true);
    const failOnDrift = booleanInput('fail-on-drift', false);

    // a gate on a check that never runs passes forever, and looks like it is working
    if (failOnDrift && !checkDrift) {
      core.warning('fail-on-drift is set but check-drift is off, so nothing gates the build. Enable check-drift.');
    }

    let config;
    try {
      config = await loadConfigInput(core.getInput('config'), cwd);
    } catch (error) {
      // a bad path here is a workflow mistake worth failing on, rather than silently
      // linting against defaults and reporting a clean run
      core.setFailed(`Could not load config '${core.getInput('config')}': ${error.message}`);
      return;
    }

    core.info(`Running design-lint in ${cwd}`);
    core.info(`Patterns: ${patterns.join(', ')}`);

    const result = await lint(patterns, { cwd, config });
    const { violations: rawViolations, fileCount, files } = result;

    // CI is the whole reason baselining exists: without it, turning the action on over
    // an existing codebase fails every build until someone fixes years of debt
    const baseline = readBaseline(resolve(cwd, baselineFile));
    const { known, added, fixed, unscanned } = classify(rawViolations, baseline, files);
    if (baseline) {
      core.info(
        `Baseline: ${known.length} known, ${fixed} fixed, ${added.length} new` +
        (unscanned > 0 ? `, ${unscanned} in files not scanned` : '')
      );
    }

    // everything downstream reports on what this change actually introduced
    const violations = toWorkspacePaths(baseline ? added : rawViolations, cwd);

    const errors = violations.filter(v => v.severity === 'error').length;
    const warnings = violations.filter(v => v.severity === 'warn').length;

    core.setOutput('violations', violations.length);
    core.setOutput('errors', errors);
    core.setOutput('warnings', warnings);
    core.setOutput('files-scanned', fileCount);
    core.setOutput('known', baseline ? known.length : 0);
    core.setOutput('fixed', baseline ? fixed : 0);

    // matching nothing is nearly always a misconfigured pattern rather than a clean repo
    if (fileCount === 0) {
      core.warning(`No files matched ${patterns.join(', ')} in ${cwd}. Nothing was checked.`);
    }

    const sarifPath = resolve(cwd, sarifFile);
    try {
      writeFileSync(sarifPath, formatSarif(violations));
      // downstream steps run from the workspace root, so hand back a path they can use
      // directly rather than one relative to working-directory
      const workspace = process.env.GITHUB_WORKSPACE;
      const forConsumers = workspace ? relative(workspace, sarifPath).split(sep).join(posix.sep) : sarifPath;
      core.setOutput('sarif', forConsumers);
    } catch (error) {
      core.warning(`Could not write SARIF to ${sarifPath}: ${error.message}`);
      core.setOutput('sarif', '');
    }

    // the reason this action exists is to catch a disagreement the day it appears, and
    // until now the check that finds one only ran on someone's laptop
    const drift = checkDrift
      // its own file set, not the lint patterns: those are js-only, and counting usages
      // over them reported every css-variable token as unused
      // an empty ignore list would walk node_modules and credit a dependency's classes
      // to this codebase, so fall back to the project's config rather than to nothing
      ? await withUsageCounts(findDrift(result.tokens), {
          cwd,
          ignore: config?.ignore ?? (await loadConfig(cwd)).ignore ?? []
        })
      : null;
    const driftCount = drift?.available ? drift.drifted.length : 0;
    core.setOutput('drifted', driftCount);

    annotate(violations);

    // after the violation annotations, so a drift-heavy repo cannot starve them
    if (drift?.available && driftCount > 0) {
      for (const entry of drift.drifted.slice(0, MAX_DRIFT_WARNINGS)) {
        core.warning(
          `${entry.codeName} is ${entry.codeValue} in code but ${entry.figmaValue} in Figma` +
          (entry.detail ? ` (${entry.detail})` : ''),
          { title: `design-lint(drift)` }
        );
      }
      core.info(`${driftCount} token${driftCount === 1 ? '' : 's'} drifted from Figma.`);
      if (driftCount > MAX_DRIFT_WARNINGS) {
        core.info(`Only the ${MAX_DRIFT_WARNINGS} most-used are annotated. The full list is in the job summary.`);
      }
    } else if (drift?.available) {
      core.info(`Figma and the code agree on all ${drift.compared} shared tokens.`);
    } else if (checkDrift) {
      // a green build reporting drifted=0 because it never compared anything is the
      // failure this whole feature exists to avoid
      core.warning(`Drift was not checked. ${explainUnavailable(drift?.reason)}`);
    }
    await writeSummary({ violations, errors, warnings, fileCount, drift });

    if (violations.length === 0) {
      core.info(`No design system violations found across ${fileCount} files.`);
    } else {
      core.info(`${violations.length} design system violations across ${fileCount} files.`);
    }

    const pullRequest = github.context.payload.pull_request;
    if (commentOnPR && githubToken && pullRequest) {
      try {
        const octokit = github.getOctokit(githubToken);
        const { owner, repo } = github.context.repo;
        const body = formatPRComment(violations, {
          repo: `${owner}/${repo}`,
          sha: github.context.sha
        }) + formatDriftSection(drift);

        const action = await upsertComment(octokit, {
          owner,
          repo,
          issueNumber: pullRequest.number,
          body
        });
        core.info(`PR comment ${action}.`);
      } catch (error) {
        // a fork PR gets a read-only token, and that must not turn a passing lint into
        // a failing job
        core.warning(`Could not comment on the pull request: ${error.message}`);
      }
    } else if (commentOnPR && !pullRequest) {
      core.debug('Not a pull_request event, skipping the PR comment.');
    } else if (commentOnPR && !githubToken) {
      core.warning('comment-on-pr is enabled but no github-token was provided.');
    }

    if (failOnError && errors > 0) {
      core.setFailed(`${errors} design system error${errors === 1 ? '' : 's'} found`);
    } else if (failOnDrift && driftCount > 0) {
      // separate from failOnError on purpose: drift is usually not caused by the change
      // under review, so gating on it is opt-in
      core.setFailed(`${driftCount} token${driftCount === 1 ? '' : 's'} drifted from Figma`);
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

run();
