/**
 * Token loading for the eslint plugin.
 *
 * An editor keeps eslint alive for hours, so tokens are parsed once rather than on every
 * keystroke. They are also not allowed to go stale: a designer changing a colour in
 * tailwind.config.js and then seeing the old palette enforced until they restart their
 * editor is the kind of thing that makes people distrust the tool and turn it off.
 */

import { statSync } from 'fs';
import { parseAllTokensSync } from '../parsers/index.js';

const cache = new Map();

// stat is cheap and there are only ever a handful of token files, but doing it on every
// rule invocation for every file in a large project still adds up
const RECHECK_INTERVAL_MS = 1000;

function stamp(tokens) {
  // tokens.sources records what was actually read, so this follows the real files rather
  // than guessing at names
  const paths = tokens.sources.flatMap(source =>
    Array.isArray(source.path) ? source.path : [source.path]
  );

  return paths
    .map(path => {
      try {
        return `${path}:${statSync(path).mtimeMs}`;
      } catch {
        // deleted since it was parsed, which is itself a change worth reloading for
        return `${path}:gone`;
      }
    })
    .join('|');
}

export function loadTokens(rootDir) {
  const now = Date.now();
  const hit = cache.get(rootDir);

  if (hit) {
    if (now - hit.checkedAt < RECHECK_INTERVAL_MS) return hit.tokens;

    hit.checkedAt = now;
    if (stamp(hit.tokens) === hit.stamp) return hit.tokens;
  }

  const tokens = parseAllTokensSync(rootDir);
  cache.set(rootDir, { tokens, stamp: stamp(tokens), checkedAt: now });
  return tokens;
}

// exported for the tests: a cache that cannot be cleared makes every test after the first
// one depend on the ones before it
export function clearTokenCache() {
  cache.clear();
}
