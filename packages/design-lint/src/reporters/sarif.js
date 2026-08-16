/**
 * SARIF Reporter - GitHub Security tab format
 */

const SARIF_VERSION = '2.1.0';

export function format(violations, options = {}) {
  const { toolName = 'design-lint', toolVersion = '1.0.0' } = options;

  const sarif = {
    version: SARIF_VERSION,
    runs: [{
      tool: {
        driver: {
          name: toolName,
          version: toolVersion,
          informationUri: 'https://github.com/click-ship/design-lint',
          rules: generateRules(violations)
        }
      },
      results: violations.map(v => formatResult(v))
    }]
  };

  return JSON.stringify(sarif, null, 2);
}

function generateRules(violations) {
  const rules = new Map();

  for (const v of violations) {
    if (!rules.has(v.rule)) {
      rules.set(v.rule, {
        id: v.rule,
        name: v.rule,
        shortDescription: { text: 'Design system rule: ' + v.rule },
        defaultConfiguration: { level: 'warning' }
      });
    }
  }

  return Array.from(rules.values());
}

function formatResult(violation) {
  return {
    ruleId: violation.rule,
    level: violation.severity === 'error' ? 'error' : 'warning',
    message: { text: violation.message },
    locations: [{
      physicalLocation: {
        artifactLocation: { uri: violation.file },
        // SARIF regions are 1-based, but babel reports columns 0-based, so a violation
        // at the start of a line emitted startColumn: 0 and GitHub code scanning
        // rejected the whole upload
        region: {
          startLine: Math.max(1, violation.line ?? 1),
          startColumn: Math.max(1, (violation.column ?? 0) + 1)
        }
      }
    }]
  };
}

export default { format };
