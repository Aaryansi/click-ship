/**
 * design-lint as an eslint plugin.
 *
 * The CLI and the Action catch drift at review time. This catches it while someone is
 * still typing, in the editor they already have open, with the squiggle they already
 * know how to read. Same rules, same tokens, same fixes: the rule logic is not
 * reimplemented here, it is called.
 */

import { lintCode } from '../index.js';
import { rules as designRules, defaultRuleConfig } from '../rules/index.js';
import { loadTokens } from './tokens.js';

// eslint has already parsed the file with the user's chosen parser, so anything that
// reaches us is valid. our own parse can still fail on syntax babel handles differently
// (exotic decorator proposals, and so on), and taking down someone's whole lint run over
// that would be worse than this rule quietly not applying to one file.
function violationsFor(ruleName, context) {
  const filePath = context.filename ?? context.getFilename?.();

  // `<input>` and `<text>` are eslint's names for a virtual file. there is no project
  // around them to read tokens from
  if (!filePath || filePath.startsWith('<')) return [];

  const settings = context.settings?.['design-lint'] ?? {};
  const rootDir = settings.root ?? context.cwd ?? process.cwd();

  let tokens;
  try {
    tokens = settings.tokens ?? loadTokens(rootDir);
  } catch {
    return [];
  }

  try {
    return lintCode(context.sourceCode.getText(), { filePath, tokens })
      .filter(violation => violation.rule === ruleName);
  } catch {
    return [];
  }
}

function createRule(ruleName) {
  const meta = designRules[ruleName]?.meta ?? {};

  return {
    meta: {
      type: 'problem',
      docs: {
        description: meta.description ?? `Enforce the ${ruleName} design system rule`,
        url: `https://github.com/Aaryansi/click-ship/tree/master/packages/design-lint#${ruleName}`
      },
      // only some violations carry a fix. a colour with no close token has nothing safe
      // to rewrite to, and guessing is how an autofix loses people's trust
      fixable: 'code',
      schema: []
    },

    create(context) {
      return {
        // one pass over the whole file rather than per-node: the underlying rules do
        // their own traversal, and running them per node would lint the file n times
        'Program:exit'() {
          for (const violation of violationsFor(ruleName, context)) {
            const report = {
              loc: { line: violation.line, column: violation.column },
              message: violation.suggestion
                ? `${violation.message}. ${violation.suggestion}`
                : violation.message
            };

            if (violation.fix) {
              report.fix = fixer => fixer.replaceTextRange(
                [violation.fix.start, violation.fix.end],
                violation.fix.newValue
              );
            }

            context.report(report);
          }
        }
      };
    }
  };
}

export const rules = Object.fromEntries(
  Object.keys(designRules).map(name => [name, createRule(name)])
);

const plugin = {
  meta: { name: '@click-ship/design-lint', version: '1.0.0' },
  rules
};

// the severities the CLI already uses, so a rule does not mean one thing in CI and
// another in the editor
plugin.configs = {
  recommended: {
    plugins: { 'design-lint': plugin },
    rules: Object.fromEntries(
      Object.entries(defaultRuleConfig).map(([name, severity]) => [`design-lint/${name}`, severity])
    )
  }
};

export { plugin };
export default plugin;
