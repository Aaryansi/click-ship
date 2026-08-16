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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const BASELINE_FILE = '.design-lint-baseline.json';

// bumped when the fingerprint recipe changes, since old entries would no longer match
const FORMAT_VERSION = 2;

// a real NUL, written as an escape rather than embedded literally: an invisible
// control character in source survives no editor, formatter or copy-paste reliably,
// and if it were silently dropped every fingerprint would change at once. it has to be
// something that cannot occur inside a path, rule name or class, or two different
// violations could join to the same string.
const FIELD_SEPARATOR = '\u0000';

/**
 * Stable identity for a violation: which file, which rule, which offending value.
 *
 * Position is deliberately excluded. Keying on a line *number* is invalid the moment
 * anyone adds an import above. Hashing the line's *text* was the first attempt here and
 * is worse in a way that took a review to catch: it makes co-located violations depend
 * on one another, so `--fix` rewriting one class re-identifies every other violation on
 * that line as new. Running the autofixer over baselined debt turned a green build red,
 * which is the exact failure this feature exists to prevent.
 *
 * The cost of dropping position is that two violations of the same rule with the same
 * value in one file become interchangeable. That is acceptable: this is a debt ledger,
 * entries are counted rather than matched one to one, so adding a third still registers.
 */
export function fingerprint(violation) {
  const parts = [
    violation.file ?? '',
    violation.rule ?? '',
    violation.value ?? ''
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
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { count: 1, file: violation.file, rule: violation.rule });
  }
  return counts;
}

export function writeBaseline(path, violations) {
  const entries = {};
  for (const [key, entry] of toCounts(violations)) entries[key] = entry;

  const payload = {
    version: FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    total: violations.length,
    entries
  };

  // --baseline-file may point somewhere that does not exist yet, and a bare ENOENT
  // is not a useful thing to hand someone
  mkdirSync(dirname(path), { recursive: true });
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

    return { ...data, entries: data.entries ?? {} };
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
export function classify(violations, baseline, scannedFiles = null) {
  if (!baseline) {
    return { known: [], added: [...violations], fixed: 0, unscanned: 0 };
  }

  const remaining = new Map(
    Object.entries(baseline.entries ?? {}).map(([key, entry]) => [key, { ...entry }])
  );
  const known = [];
  const added = [];

  for (const violation of violations) {
    const entry = remaining.get(violation.fingerprint);
    if (entry && entry.count > 0) {
      entry.count -= 1;
      known.push(violation);
    } else {
      added.push(violation);
    }
  }

  // an entry only counts as fixed if this run actually looked at its file. a narrowed
  // invocation, a pre-commit hook over staged files say, would otherwise report every
  // untouched file as fixed and invite the user to re-record, which silently drops
  // that debt from the ledger and makes it all reappear as new on the next full run.
  const scanned = scannedFiles ? new Set(scannedFiles) : null;
  let fixed = 0;
  let unscanned = 0;

  for (const entry of remaining.values()) {
    if (entry.count <= 0) continue;
    if (scanned && entry.file && !scanned.has(entry.file)) unscanned += entry.count;
    else fixed += entry.count;
  }

  return { known, added, fixed, unscanned };
}

export default { BASELINE_FILE, fingerprint, toCounts, writeBaseline, readBaseline, classify };
