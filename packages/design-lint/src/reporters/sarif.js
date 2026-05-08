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
        region: {
          startLine: violation.line,
          startColumn: violation.column
        }
      }
    }]
  };
}

export default { format };
