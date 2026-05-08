/**
 * Design Lint Reporters
 *
 * Output formatters for different environments
 */

import consoleReporter from './console.js';
import githubReporter from './github.js';
import jsonReporter from './json.js';
import sarifReporter from './sarif.js';

/**
 * Available reporters
 */
export const reporters = {
  console: consoleReporter,
  github: githubReporter,
  json: jsonReporter,
  sarif: sarifReporter
};

/**
 * Get a reporter by name
 */
export function getReporter(name) {
  return reporters[name] || null;
}

/**
 * Format violations using specified reporter
 */
export function format(violations, reporterName, options = {}) {
  const reporter = getReporter(reporterName);

  if (!reporter) {
    throw new Error(`Unknown reporter: ${reporterName}`);
  }

  switch (reporterName) {
    case 'console':
      return reporter.format(violations, options);
    case 'github':
      return reporter.formatPRComment(violations, options);
    case 'json':
      return reporter.format(violations, options);
    case 'sarif':
      return reporter.format(violations, options);
    default:
      return reporter.format(violations, options);
  }
}

/**
 * Print violations to console
 */
export function print(violations, options = {}) {
  const output = consoleReporter.format(violations, options);
  console.log(output);
}

/**
 * Get reporter names
 */
export function getReporterNames() {
  return Object.keys(reporters);
}

/**
 * Create multi-reporter that outputs to multiple formats
 */
export function createMultiReporter(reporterNames) {
  return {
    format(violations, options = {}) {
      const results = {};

      for (const name of reporterNames) {
        results[name] = format(violations, name, options);
      }

      return results;
    }
  };
}

export {
  consoleReporter,
  githubReporter,
  jsonReporter,
  sarifReporter
};

export default {
  reporters,
  getReporter,
  format,
  print,
  getReporterNames,
  createMultiReporter
};
