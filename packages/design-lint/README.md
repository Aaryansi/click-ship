# @click-ship/design-lint

> Design system enforcement for your codebase - ESLint for your design tokens

Design Lint ensures your code follows your design system by detecting:
- Hardcoded colors instead of design tokens
- Spacing values outside your scale
- Typography not matching your system
- Border radius values off-scale

## Installation

```bash
npm install -D @click-ship/design-lint
# or
npx design-lint ./src
```

## Quick Start

```bash
# Lint your source files
npx design-lint src/**/*.tsx

# Generate config file
npx design-lint --init

# Output as JSON
npx design-lint --format json
```

## GitHub Action

Add to your workflow:

```yaml
name: Design Lint
on: [pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: click-ship/design-lint@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Configuration

Create `design-lint.config.js`:

```javascript
export default {
  extends: 'auto',
  
  tokens: {
    source: './tailwind.config.js',
  },

  rules: {
    'color-tokens': 'error',
    'spacing-scale': 'warn',
    'typography': 'error',
    'border-radius': 'warn'
  },

  ignore: [
    '**/node_modules/**',
    '**/*.test.tsx'
  ]
};
```

## Rules

### color-tokens
Detects hardcoded colors that should use design tokens.

### spacing-scale  
Ensures spacing values follow your scale (e.g., 4px grid).

### typography
Validates font sizes and weights match your system.

### border-radius
Checks border radius values against tokens.

## Adopting on an existing codebase

Pointing any checker at a codebase that predates it produces thousands of violations,
and a build that is red from day one gets switched off. Record what is already there,
then only new violations fail:

```bash
design-lint --baseline          # record the current state, commit the file
design-lint                     # from now on, only new violations gate
```

A run against a baseline reports what changed either way:

```
Baseline: 412 known, 3 fixed, 1 new.
Re-run with --baseline to lock in the 3 you fixed.
```

Only *new* violations are printed and only new errors fail the run, so the one thing
somebody just introduced is not buried in years of accumulated debt. Fixed violations
are reported so the number visibly comes down.

Violations are identified by file, rule and value rather than by position, so a
baseline survives reformatting, moved code and `--fix`. Commit
`.design-lint-baseline.json` alongside your source; the GitHub Action reads it
automatically.

## CLI Options

```
design-lint [patterns...] [options]

Options:
  -c, --config <path>       Path to config file
  -f, --format <type>       Output format (console, json, sarif, github)
  --fix                     Rewrite violations that can be fixed safely
  --baseline                Record current violations and exit
  --baseline-file <path>    Where the baseline lives (default .design-lint-baseline.json)
  -v, --verbose             Show detailed output
  --init                    Generate config file
```

## Programmatic API

```javascript
import { lint, lintCode } from '@click-ship/design-lint';

const result = await lint(['src/**/*.tsx']);
console.log(result.violations);
```

## License

MIT
