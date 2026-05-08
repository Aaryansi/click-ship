/**
 * JSON Reporter - Machine-readable output
 */

export function format(violations, options = {}) {
  const { pretty = true, includeMetadata = true } = options;

  const output = {
    violations,
    summary: {
      total: violations.length,
      errors: violations.filter(v => v.severity === 'error').length,
      warnings: violations.filter(v => v.severity === 'warn').length
    }
  };

  if (includeMetadata) {
    output.metadata = {
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  }

  return pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);
}

export function formatNDJSON(violations) {
  return violations.map(v => JSON.stringify(v)).join('\n');
}

export function parse(jsonString) {
  return JSON.parse(jsonString);
}

export default { format, formatNDJSON, parse };
