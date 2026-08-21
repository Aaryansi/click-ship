# click-ship — where things stand

Written 2026-08-20, against `master` at `a8a25f9`.

This repo holds **two products** that grew out of one idea. One is finished and waiting on
a publish decision. The other is where the project started and is roughly half-built.

| | What it is | State |
|---|---|---|
| **design-lint** | A linter that enforces your design system, and catches when Figma and code disagree | **Ready.** 292 tests, CI on Node 20/22/24, validated on a real 3,829-file codebase |
| **click-ship** | A browser extension to tweak a live website and open a PR with the change | **Half-built.** Core loop works; 4,555 lines written but never wired up |

---

# Part 1 — design-lint

## The problem, in plain terms

A design system says "our blue is `#3b82f6`, our spacing goes 4, 8, 12, 16". Then:

1. Someone in a hurry writes `#3b82fb` or `padding: 13px`. Nobody notices in review.
2. A designer nudges the blue in Figma. Nobody changes the code. A year later the website
   and the design file are a shade apart *everywhere*, and nobody can say when it happened.

The first problem is well-covered ground. The second one is not, and it is the reason this
tool exists.

## What it does

### 1. Finds values that should have been tokens

```
$ design-lint

Tokens from tailwind (tailwind.config.js), css-vars (globals.css) — 84 tokens

3 Design System Violations

src/Button.tsx
  12:24  x Hardcoded color '#ff0000' should use a design token [color-tokens]
         -> Use 'error' (#ef4444)
  14:11  ! Spacing value '13px' (13px) is not in the spacing scale [spacing-scale]
         -> Use 12px
```

Four rules: `color-tokens`, `spacing-scale`, `typography`, `border-radius`.

It checks **both halves of a component**, which is the part most tools skip:

| Where | What it reads |
|---|---|
| `.tsx` `.jsx` `.ts` `.js` | `className` utilities and `style={{ }}` objects |
| `.css` `.scss` `.sass` `.less` | declarations, including inside `@media` and scss nesting |
| styled-components / emotion | ``styled.button` ` ``, ``styled(X)` ` ``, ``css` ` ``, ``createGlobalStyle` ` `` |

### 2. Catches Figma drift — the differentiated part

```
$ design-lint drift

2 tokens drifted from Figma  (of 5 compared against tailwind)

  primary [colors]
    code #3b82f6   tailwind
    figma #2563eb   global.color-primary
    ΔE 0.0823, visible  ·  40 usages in code
```

**No Figma API, no token, no Enterprise plan.** It reads an export already committed to
your repo, so it runs offline in CI. It reads whichever format your team already uses —
Tokens Studio, W3C design tokens (DTCG), or a raw Figma Variables export — detected from
the file's shape, with nothing to configure.

Design decisions that took the most thought:

- **Any real difference is drift, including one too small to see.** The invisible ones are
  exactly the ones that survive for years and then widen. Colours are compared in OKLab so
  the report can say which ones a human would actually notice.
- **The same value written differently is not drift.** `#FFF` and `#ffffff` agree, so do
  `1rem` and `16px`. A tool that cries wolf on notation gets switched off in a week.
- **Opacity is part of the token.** Comparing only the hex meant a designer changing a
  scrim from 50% to 25% produced a green "Figma and the code agree".
- **Aliases are skipped, not compared.** `{core.blue.500}` is a pointer, not a value.
- **Shadows are deliberately not compared at all.** Figma emits `0px 4px 8px 0px rgba(…)`,
  Tailwind writes `0 4px 8px 0 rgba(…)`, so a string comparison marks every shadow as
  drifted forever. Permanent false drift is worse than not checking.

### 3. Makes it adoptable on day one

Point any checker at an existing codebase and you get thousands of errors and a build
that is red immediately, which is how these tools get deleted the same afternoon.

```
$ design-lint --baseline      # records what is already there
$ design-lint                 # fails only on what is new
Baseline: 35 known, 2 fixed, 0 new.
```

Violations are fingerprinted on `(file, rule, value)` rather than line numbers, so a
baseline survives someone adding an import at the top of a file. It reports the **fixed**
count too, because a number going down is what makes a team feel the debt shrinking.

### 4. Runs everywhere you already work

One implementation of every rule, three surfaces, so the editor and CI cannot disagree:

- **CLI** — `design-lint`, `design-lint drift`, `--fix`, `--format html|json|sarif|github`
- **GitHub Action** — comments on the PR, inline annotations, SARIF for code scanning
- **ESLint plugin** — `@click-ship/design-lint/eslint`, so you see it while typing

## Where the tokens come from

Nothing to configure. It finds whichever of these you already have:

| Source | What it reads |
|---|---|
| Tailwind v4 | `@theme { --color-primary: … }`, including `@theme inline` |
| Tailwind v3 | `tailwind.config.{js,ts,cjs,mjs}` |
| CSS variables | `:root { --primary: … }`, found by content rather than filename |
| Token JSON | `tokens.json`, `design-tokens.json` |

Colours are read as `oklch()`, `oklab()`, `hsl()`, `rgb()` and hex.

## Measured on a real codebase

Against `shadcn-ui/ui` (commit `25be24c`), median of three runs after a discarded warm-up:

| | Measured |
|---|---|
| Speed, one app | 284 files in **0.54s** |
| Speed, whole monorepo | 3,829 files in **5.0s**, no crashes |
| Findings, whole monorepo | 109 errors, 40 warnings — 18 of them in stylesheets |
| Baseline flow | 35 recorded → exits 0; a newly added violation still exits 1 |

Findings were spot-checked against the source rather than trusted, including `#61dafbaa`
nested inside a `drop-shadow(...)`, and a `padding: 0.125em 0.3em` where only the `0.3em`
was flagged because 2px is on that project's scale.

## The honest competitive read

**Well-covered ground.** "Don't hardcode values, use tokens" is not new.
`stylelint-declaration-strict-value` has done it in CSS for years,
`eslint-plugin-tailwindcss` flags arbitrary values, and Betterer does baseline-and-ratchet
generically. Our versions are better built, not conceptually novel.

**The real weakness in the drift wedge.** The *correct* fix for Figma↔code drift is one-way
generation: Figma → Style Dictionary or Terrazzo → code tokens. If you generate, you cannot
drift, and those tools are free and mature. So drift detection matters specifically to
teams stuck with two sources of truth they cannot collapse. That is a real audience, but
smaller than "everyone with a design system" — and it is the first rebuttal anyone will
raise, so it is better to position around it than be surprised by it.

**Where it is genuinely ahead.** Correctness nobody else bothers with:

- CSS Color 4 gamut mapping (hold lightness and hue, reduce chroma) rather than clipping
- `calc(var(--radius) * 0.8)` resolved rather than stored as text
- Tailwind v4 `@theme` with namespaces stripped to the name the class actually uses
- Baseline identity that survives unrelated edits
- Refusing to autofix an ambiguous match instead of guessing

That is the difference between a weekend tool and one a team trusts. It is also nearly
invisible in a README, which is a marketing problem, not an engineering one.

## What would have to be true to publish

Blocked only on things I cannot do:

1. Create the free **`click-ship` org on npmjs.com** — `@click-ship/design-lint` is scoped
   because unscoped `design-lint` is taken.
2. `npm login`.
3. Publish with `--access public` — scoped packages default to restricted, which would
   silently make it un-installable.

Everything else is done: 59.9 kB tarball, dead dependency dropped, `exports` map pinned,
LICENSE, README, CI green on Node 20/22/24, and launch drafts in `docs/launch-post.md`
with every number re-measured.

## What I would build next, in order

1. **Adoption trend over time.** The HTML report is a snapshot; "73%, +4% this week" is the
   artifact a design lead screenshots for their VP. Needs stored history. Nothing free does
   this well, and it is the strongest growth mechanic left.
2. **A Figma-side plugin** that shows drift inside Figma, so the designer sees it too. The
   repo already has a Figma plugin skeleton to build on.
3. **More framework coverage** — Vue SFC `<style>` blocks and Svelte, both of which are the
   same declaration scanner pointed at a different file shape.
4. **Component-level adoption analytics** — "42% of buttons use the Button component". This
   is what the commercial players actually sell, and it is a much bigger build.

---

# Part 2 — click-ship, the original idea

## What it was meant to be

Open any website you own, click an element, change the text or the colour in a sidebar,
hit save, and get a **GitHub pull request** with the real code change. No editor, no
finding the file, no branch. The pitch is "tweak the live site, ship the diff".

That is genuinely useful: the gap between "I can see what's wrong" and "I can fix it" is
where most small copy and style fixes die.

## What actually works today

The core loop is real:

- **Chrome extension (MV3)**, 5,763 lines — content script with a sidebar, element picker,
  preview, modal; a background service worker; GitHub identity via `chrome.identity`.
- **Server** (Fastify), with three endpoints that are genuinely implemented:
  - `POST /auth/github` — auth exchange
  - `POST /edit` — locate the source of the clicked element, apply the edit, open a PR
  - `POST /close-pr` — close it again
- **AST-based source location** so an edit lands on the right JSX node rather than a
  string replace.

## What is written but not connected

This is the important part for planning.

**4,555 lines are never imported by the server.** `packages/server/index.js` imports only
Fastify, cors, git, fetch and Octokit. Everything below is written, committed, and dead:

| Module | Lines | Intended job |
|---|---|---|
| `routes/figma.js` | 404 | Figma plugin endpoints |
| `routes/linear.js` | 429 | Linear issue linking |
| `routes/slack.js` | 351 | Slack commands and events |
| `lib/ai.js` | 497 | AI-assisted edits |
| `lib/ast-locator.js` | 494 | Source location |
| `lib/auth.js` | 343 | Auth |
| `lib/design-tokens.js` | 486 | Token awareness |
| `lib/github.js` | 581 | GitHub operations |
| `lib/slack-notifications.js` | 445 | Slack notifications |
| `lib/supabase.js` | 525 | Persistence |

**The extension calls six endpoints that do not exist.** It expects `/edit/preview`,
`/merge-pr`, `/repos`, `/repos/by-hostname`, `POST /annotations` and `GET /annotations`.
None are implemented. Any feature in the UI that depends on them is a dead button.

**Every handler in `routes/*.js` uses `preHandler: [fastify.authenticate]`,** a decorator
nothing registers. Those routes would throw on the first request even if they were mounted.

## The honest read on this half

The pieces are not junk — the AST locator and the GitHub PR flow are the hard parts and
they work. But it is currently a demo with a large amount of scaffolding around it, and the
scaffolding was written ahead of the wiring. Two independent things are true:

- The **core loop is a genuinely good demo** and always was.
- The **surface area is much larger than the working part**, which is the failure mode
  where a project feels stuck: every direction looks half-done.

There is also a real question this half has to answer that design-lint does not: **who
hosts the server?** It needs a GitHub token with write access to the user's repo. That is a
trust and security surface, an ongoing cost, and the reason products like this are usually
either self-hosted or a funded SaaS.

## The plan, if you come back to it

Ordered so each step ends with something that works, rather than more scaffolding:

**Phase 7a — make the extension honest.** Remove or disable every control that calls a
missing endpoint. A UI where two-thirds of the buttons silently fail is worse than a
smaller UI that works. Cheapest step, biggest immediate improvement.

**Phase 7b — wire what is already written.** Register `routes/*.js`, add the
`fastify.authenticate` decorator they all assume, and delete or merge the duplicate
implementations between `index.js` and `lib/`. This is mostly deletion and connection, not
new code. 4,555 lines either become real or should go.

**Phase 7c — implement the six missing endpoints.** `/repos` and `/repos/by-hostname`
first, since the extension cannot map a live site to a repo without them, and that mapping
is the whole premise.

**Phase 7d — decide the hosting story.** Self-hosted first is the honest answer: a
`docker compose up`, your own GitHub token, your own machine. It removes the trust problem
entirely and is the only version shippable without funding.

**Phase 7e — then, and only then, the integrations.** Slack, Linear and the Figma plugin
are multipliers on a working product and worth nothing before one exists.

## Known housekeeping

- The repo lives in `~/Documents`, which iCloud syncs. It has already corrupted `.git`
  internals once and leaves `" 2"` duplicate files (there are some in
  `packages/extension/dist/` right now). Moving the repo somewhere unsynced would remove a
  whole class of confusing failure.
- `packages/figma-plugin` is a skeleton — four source files, a manifest, and a build.

---

# The decision in front of you

**design-lint** is finished, tested, measured and honest about its own weaknesses. The only
question is whether to spend the name and publish, or keep building. My read: the CSS gap
that would have made it dismissible is closed, and the remaining gap between it and
"impossible to ignore" is the adoption-trend feature, not more correctness.

**click-ship** is the more original idea and the weaker artifact. It needs a decision about
hosting before any more code is worth writing.

They do not compete for anything except your time — different users, different problems,
and design-lint needs no infrastructure at all.
