/**
 * GitHub Action entry point for Design Lint
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { lint } from '../src/index.js';
import { formatPRComment } from '../src/reporters/github.js';
import { format as formatSarif } from '../src/reporters/sarif.js';
import { writeFileSync } from 'fs';

async function run() {
  try {
    const patterns = core.getInput('patterns').split(',').map(p => p.trim());
    const configPath = core.getInput('config');
    const failOnError = core.getInput('fail-on-error') === 'true';
    const githubToken = core.getInput('github-token');
    const commentOnPR = core.getInput('comment-on-pr') === 'true';

    core.info('Running Design Lint...');

    const result = await lint(patterns, {
      cwd: process.cwd(),
      config: configPath ? require(configPath) : undefined
    });

    const { violations } = result;
    const errors = violations.filter(v => v.severity === 'error').length;
    const warnings = violations.filter(v => v.severity === 'warn').length;

    // Set outputs
    core.setOutput('violations', violations.length);
    core.setOutput('errors', errors);
    core.setOutput('warnings', warnings);

    // Generate SARIF
    const sarifOutput = formatSarif(violations);
    writeFileSync('design-lint-results.sarif', sarifOutput);
    core.setOutput('sarif', 'design-lint-results.sarif');

    // Comment on PR
    if (commentOnPR && githubToken && github.context.eventName === 'pull_request') {
      const octokit = github.getOctokit(githubToken);
      const { owner, repo } = github.context.repo;
      const prNumber = github.context.payload.pull_request.number;

      const comment = formatPRComment(violations, {
        repo: owner + '/' + repo,
        sha: github.context.sha
      });

      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: comment
      });
    }

    // Log summary
    if (violations.length === 0) {
      core.info('No design system violations found!');
    } else {
      core.warning(violations.length + ' design system violations found');

      for (const v of violations.slice(0, 10)) {
        if (v.severity === 'error') {
          core.error(v.message, { file: v.file, startLine: v.line });
        } else {
          core.warning(v.message, { file: v.file, startLine: v.line });
        }
      }
    }

    // Fail if errors and configured to fail
    if (failOnError && errors > 0) {
      core.setFailed(errors + ' design system errors found');
    }

  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
