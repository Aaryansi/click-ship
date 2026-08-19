# Launch post drafts

Three versions of the same story, for the three places it gets told. Every number here
was measured, not estimated — see "Where the numbers come from" at the bottom before
changing any of them.

---

## Show HN

**Show HN: Design-lint – catch when your Figma tokens and your code disagree**

Design systems keep the same tokens in two places. Somebody nudges a colour in Figma,
nobody changes the code, and a year later the two are a shade apart everywhere. Nothing
watches for that. Linting hardcoded hex values is well-covered ground; the disagreement
between the two sources of truth is not.

Design-lint does both, from the CLI, CI, and your editor.

The part I haven't seen elsewhere for free:

```
$ design-lint drift

2 tokens drifted from Figma  (of 5 compared against tailwind)

  primary [colors]
    code #3b82f6   tailwind
    figma #2563eb   global.color-primary
    ΔE 0.0823, visible  ·  40 usages in code
```

**No Figma API, no token, no Enterprise plan.** It reads an export already committed to
your repo, so it runs offline in CI. It reads whichever format you already use — Tokens
Studio, W3C design tokens (DTCG), or a raw Figma Variables export — detected from the
file's shape, with nothing to configure.

Some decisions that turned out to matter more than I expected:

- **Any real difference is drift, including one too small to see.** The invisible ones
  are exactly the ones that survive for years and then widen. Colours are compared in
  OKLab so the report can tell you which ones anyone would actually notice.
- **The same value written differently is not drift.** `#FFF` and `#ffffff` agree, and so
  do `1rem` and `16px`. A tool that cries wolf on notation gets turned off in a week.
- **Opacity is part of the token.** Comparing only the hex meant a designer changing a
  scrim from 50% to 25% produced a green "Figma and the code agree".
- **Aliases are skipped, not compared.** `{core.blue.500}` is a pointer, not a value.
- **Shadows are deliberately not compared at all.** Figma emits `0px 4px 8px 0px rgba(…)`
  and Tailwind writes `0 4px 8px 0 rgba(…)`, so a string comparison marks every shadow as
  drifted forever. Permanent false drift is worse than not checking.

The other half is adoption. Point any checker at a codebase that predates it and you get
thousands of violations and a build that's red on day one, which is how these tools get
deleted. So `--baseline` records what's already there and CI only fails on what's new,
and it reports the **fixed** count too, because a number that goes down is the only thing
that makes a team feel the debt shrinking. Violations are fingerprinted on
`(file, rule, value)` rather than line numbers, so a baseline survives someone adding an
import at the top of the file.

Same rules run in three places, from one implementation: `design-lint` in the terminal, a
GitHub Action that comments on the PR, and an ESLint plugin so you see it while typing.

MIT. It needs no network, no account, and no inference — the whole thing is static
analysis.

---

## X / Twitter thread

**1.** Your Figma file says `#2563eb`. Your Tailwind config says `#3b82f6`.

Nobody notices for a year.

I built a linter that catches this, and it doesn't need the Figma API.

**2.** It reads a token export already committed to your repo. Tokens Studio, W3C design
tokens, or a raw Figma Variables dump — it detects which one from the file's shape.

No API token. No Enterprise plan. Runs offline in CI.

**3.** The subtle part: any real difference counts as drift, including differences too
small to see.

Those are the ones that survive for years and then widen.

Colours are compared in OKLab, so it can also tell you which ones a human would notice.

**4.** What is *not* drift: the same value written differently.

`#FFF` = `#ffffff`. `1rem` = `16px`.

A tool that cries wolf on notation gets turned off in a week.

**5.** Opacity counts too.

Comparing only the hex meant a designer changing a scrim from 50% to 25% got a green
"Figma and the code agree." That bug taught me more than the feature did.

**6.** Adoption problem: point any linter at an existing codebase and you get 2,000
errors and a red build on day one. That's how these tools get deleted.

`--baseline` records what's already there. CI only fails on what's new. And it reports
what you *fixed*, because that number going down is the point.

**7.** Runs in your terminal, in CI as a GitHub Action that comments on the PR, and in
your editor as an ESLint plugin.

One implementation of every rule, so the editor and CI can't disagree.

**8.** Free, MIT, no account, no network, no inference.

---

## README opening (the 30 seconds someone actually gives you)

**design-lint** — your design system, enforced.

```bash
npx @click-ship/design-lint
```

Finds hardcoded values that should be tokens. Then finds the thing nothing else looks
for: tokens that have quietly drifted apart between Figma and your code.

- **Zero setup.** Detects your Tailwind config, CSS variables, and token JSON.
- **Figma drift, without the Figma API.** Reads an export committed to your repo.
- **Adoptable on day one.** Baseline what exists, fail only on what's new.
- **Everywhere you work.** CLI, GitHub Action, ESLint plugin.

---

## Where the numbers come from

Measured against `shadcn-ui/ui` at the commit cloned on 2026-08-19, using its own CSS
variable tokens as the design system. Re-measure before reusing these; do not round them
up.

| Claim | Measured |
|---|---|
| Speed on a real app | 3,246 `.tsx` files in **1.3s** |
| Whole monorepo | every `.tsx/.jsx/.ts/.js`, **9.2s**, no crashes |
| Findings in `apps/v4` | 27 errors, 93 warnings |
| Baseline flow | 35 violations recorded, next run exits 0 with 0 new |

The findings were spot-checked and are real: `text-[0.625rem]` and `text-[0.5rem]` are
genuinely off the typography scale that file's own tokens define.

**Do not claim a drift number.** No public repo commits a Figma export, so drift has not
been measured against real third-party data. Demo it on `demo-project` instead, and say
plainly that it is a demo.
