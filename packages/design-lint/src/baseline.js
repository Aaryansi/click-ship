/**
 * Baseline ratcheting.
 *
 * Point a design system checker at an existing codebase and it reports thousands of
 * violations. CI goes red, nobody can tell which of them their change caused, and the
 * tool gets deleted that afternoon. A baseline records what is already there so a run
 * can fail on *new* violations only, while still reporting the ones that got fixed so
 * the number visibly comes down.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const BASELINE_FILE = '.design-lint-baseline.json';

// bumped when the fingerprint recipe changes, since old entries would no longer match
const FORMAT_VERSION = 1;

/**
 * Stable identity for a violation.
 *
 * Line numbers are deliberately excluded. A baseline keyed on them is invalid the
 * moment anyone adds an import above, which makes every entry look new and the whole
 * feature useless within a day. Hashing the trimmed source line instead means a
 * violation survives being moved or re-indented, while a genuinely new one still
 * registers because its surrounding text differs.
 */
// a real NUL, written as an escape rather than embedded literally: an invisible
// control character in source survives no editor, formatter or copy-paste reliably,
// and if it were silently dropped every fingerprint would change at once. it has to be
// something that cannot occur inside a path, rule name or class, or two different
// violations could join to the same string.
const FIELD_SEPARATOR = '\u0000';

export function fingerprint(violation, sourceLine = '') {
  const parts = [
    violation.file ?? '',
    violation.rule ?? '',
    violation.value ?? '',
    sourceLine.trim()
  ];

  return createHash('sha256').update(parts.join(FIELD_SEPARATOR)).digest('hex').slice(0, 16);
}

/**
 * Counts rather than a set: the same violation can legitimately appear twice in one
 * file, and fixing one of the two should register as progress rather than as nothing.
 */
export function toCounts(violations) {
  const counts = new Map();
  for (const violation of violations) {
    const key = violation.fingerprint;
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function writeBaseline(path, violations) {
  const counts = {};
  for (const [key, count] of toCounts(violations)) counts[key] = count;

  const payload = {
    version: FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    total: violations.length,
    counts
  };

  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  return payload;
}

export function readBaseline(path) {
  if (!existsSync(path)) return null;

  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));

    if (data?.version !== FORMAT_VERSION) {
      console.warn(
        `Warning: ignoring ${path}, it was written in format v${data?.version} and this is v${FORMAT_VERSION}. Re-run with --baseline to regenerate it.`
      );
      return null;
    }

    return { ...data, counts: data.counts ?? {} };
  } catch (error) {
    console.warn(`Warning: ignoring ${path}, it could not be read (${error.message}).`);
    return null;
  }
}

/**
 * Split the current violations against what the baseline recorded.
 *
 * `fixed` is the count the baseline still expected but the run did not produce. It is
 * the number that makes a team feel the debt shrinking, so it is worth reporting even
 * though nothing gates on it.
 */
export function classify(violations, baseline) {
  if (!baseline) {
    return { known: [], added: [...violations], fixed: 0 };
  }

  const remaining = new Map(Object.entries(baseline.counts ?? {}));
  const known = [];
  const added = [];

  for (const violation of violations) {
    const left = remaining.get(violation.fingerprint) ?? 0;
    if (left > 0) {
      remaining.set(violation.fingerprint, left - 1);
      known.push(violation);
    } else {
      added.push(violation);
    }
  }

  let fixed = 0;
  for (const left of remaining.values()) fixed += left;

  return { known, added, fixed };
}

export default { BASELINE_FILE, fingerprint, toCounts, writeBaseline, readBaseline, classify };
