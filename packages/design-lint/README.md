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

## Where your tokens come from

Nothing to configure. It finds whichever of these your project already has:

| Source | What it reads |
|---|---|
| Tailwind v4 | `@theme { --color-primary: … }`, including `@theme inline` |
| Tailwind v3 | `tailwind.config.{js,ts,cjs,mjs}` |
| CSS variables | `:root { --primary: … }`, found by content rather than by filename |
| Token JSON | `tokens.json`, `design-tokens.json` |

Tailwind v4 themes are written in terms of each other, so `--radius-md: calc(var(--radius)
* 0.8)` is worked out rather than stored as text, and namespaces are stripped to the name
the class actually uses: `--radius-md` is `rounded-md`, `--text-sm` is `text-sm`. A single
`--spacing: 0.25rem` generates the scale it stands for, because in v4 every `p-4` is
`calc(var(--spacing) * 4)`.

Colours are read in `oklch()`, `oklab()`, `hsl()`, `rgb()` and hex. That matters more than
it sounds: Tailwind v4's entire default palette is written in oklch, and a linter that
cannot read a project's colours quietly enforces its own defaults instead of the design
system.

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

### What gets checked

The same four rules run over both sides of a component, because a design system lives in
CSS at least as much as it lives in JSX:

| | Checked |
|---|---|
| `.tsx` `.jsx` `.ts` `.js` | `className` utilities and `style={{ }}` objects |
| `.css` `.scss` `.sass` `.less` | declarations, including inside `@media` and scss nesting |
| styled-components / emotion | `styled.button\`\``, `styled(X)\`\``, `css\`\``, `createGlobalStyle\`\`` |

In a stylesheet, a custom property being *defined* is never a violation — `--brand:
#ff0000` in `:root` is the design system declaring itself. A value that already refers to
a token (`var()`, `calc()`, a scss variable) is left alone, as are `0`, `auto` and
percentages. Shorthands are judged one value at a time, so `padding: 16px 13px` reports
only the 13px.

In a styled-components template, a value that is entirely interpolated
(`border-radius: ${p => p.round ? '7px' : '0'}`) is left alone, because nobody knows what
it evaluates to. A literal sitting next to an interpolation is still checked.

## In your editor

The CLI catches violations at review time. The ESLint plugin catches them while you are
still typing, using the same rules, the same tokens and the same fixes.

```js
// eslint.config.js
import designLint from '@click-ship/design-lint/eslint';

export default [
  {
    files: ['**/*.{jsx,tsx}'],
    ...designLint.configs.recommended
  }
];
```

That maps to the same severities the CLI uses, so a rule does not mean one thing in CI
and another in the editor:

| Rule | Severity |
|---|---|
| `design-lint/color-tokens` | error |
| `design-lint/typography` | error |
| `design-lint/spacing-scale` | warn |
| `design-lint/border-radius` | warn |

Set them yourself instead if you want, and `eslint --fix` applies the same rewrites
`design-lint --fix` does. Violations with no safe rewrite are reported and left alone.

Tokens are read from the ESLint working directory and reloaded when the files they came
from change, so editing `tailwind.config.js` takes effect without restarting the editor.
In a monorepo where tokens live above the package being linted, point at them:

```js
settings: { 'design-lint': { root: '/path/to/repo-root' } }
```

## Shareable report

```bash
design-lint -f html 'src/**/*.tsx' > design-report.html
```

One self-contained file, no network requests, readable in light or dark. It carries the
share of files with no violations, a breakdown by rule, the files carrying the most
debt, any Figma drift ordered by how heavily each token is used, and movement against
the baseline if one exists.

The headline figure is *files with no violations* rather than a percentage of values
tokenized. The honest denominator for the latter is every value the rules could have
examined, which nothing counts today, and a made-up denominator produces a number
nobody can check.

## Figma drift

Design systems keep the same tokens in two places and they quietly diverge: somebody
nudges a colour in Figma, nobody changes the code, and months later the two are a shade
apart everywhere.

```bash
design-lint drift
```

```
2 tokens drifted from Figma  (of 5 compared against tailwind)

  primary [colors]
    code #3b82f6   tailwind
    figma #2563eb   global.color-primary
    ΔE 0.0823, visible  ·  7 usages in code
```

Drifted tokens are ordered by how often the code actually uses them, so the ones that
matter come first. Add `--fail-on-drift` to gate CI on it.

The GitHub Action runs the same check on every pull request. Drifted tokens are added
to the PR comment and the job summary, and the ten most-used are raised as job warnings.
It is on by default and does not fail the build, because drift is usually not caused by
the change under review:

```yaml
- uses: Aaryansi/click-ship/packages/design-lint/action@master
  with:
    check-drift: true       # default
    fail-on-drift: false    # default
```

Reads an export committed to the repo as `figma-tokens.json`, `figma-variables.json`,
`tokens/figma.json` or `.figma/tokens.json`. No Figma API, no token, no Enterprise plan,
and it runs offline.

Whichever way your team already exports is read as-is, with no conversion step and
nothing to configure:

| Export | Looks like | Comes from |
|---|---|---|
| Tokens Studio | `{ "value": "#2563eb", "type": "color" }` | the Tokens Studio plugin |
| W3C design tokens (DTCG) | `{ "$value": "#2563eb", "$type": "color" }` | Style Dictionary v4, Terrazzo, most modern pipelines |
| Figma Variables | `{ "resolvedType": "COLOR", "valuesByMode": {…} }` | the Figma REST/plugin variables payload, saved to a file |

The format is detected from the file's shape. Figma Variables use 0-1 RGBA floats and
carry a value per mode; the collection's default mode is the one compared, and alpha is
kept, so a scrim going from 50% to 25% reads as drift rather than agreement. Aliases
(`{core.blue.500}`, `VARIABLE_ALIAS`) are pointers rather than values, so they are
skipped instead of being reported as drifted against every hex they reference.

Names are matched across conventions, so `global.color-primary` in the export lines up
with `primary` in a Tailwind config. Any real difference counts as drift, including one
too small to see, because those are the ones that survive for years. The same value
written differently does not: `#FFF` and `#ffffff` agree, and so do `1rem` and `16px`.

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
