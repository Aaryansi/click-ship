/**
 * Resolving what a custom property is actually worth.
 *
 * Tailwind v4 themes are written in terms of each other, so a parser that stores the
 * literal text ends up with a scale it cannot compare against anything. Six of shadcn's
 * seven radius tokens are `calc(var(--radius) * n)` and every one of them was being
 * dropped.
 */

// how many hops to follow before assuming the stylesheet refers to itself
const MAX_DEPTH = 10;

/**
 * Replace `var(--x)` with what `--x` holds, honouring the fallback in `var(--x, 8px)`.
 */
export function resolveVars(value, variables, depth = 0) {
  if (typeof value !== 'string' || depth > MAX_DEPTH || !value.includes('var(')) return value;

  const pattern = /var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,([^()]*(?:\([^()]*\)[^()]*)*))?\)/g;

  const resolved = value.replace(pattern, (whole, name, fallback) => {
    const referenced = variables.get(name);
    if (referenced !== undefined) return referenced;
    // the fallback is what a browser would use, so it is what we should compare against
    return fallback !== undefined ? fallback.trim() : whole;
  });

  // unchanged means whatever var() is left cannot be resolved, and looping would only spin
  if (resolved === value) return value;
  return resolveVars(resolved, variables, depth + 1);
}

/**
 * Evaluate `calc()` far enough to get a number back.
 *
 * Deliberately narrow: anything it does not fully understand comes back untouched rather
 * than guessed at. A wrong number here becomes a wrong spacing scale, which is worse than
 * an absent one.
 */
export function evaluateCalc(value) {
  if (typeof value !== 'string' || !/calc\(/i.test(value)) return value;

  let current = value;

  // innermost calc() first, so nested expressions collapse from the inside out
  for (let i = 0; i < MAX_DEPTH; i++) {
    const found = findInnermostCalc(current);
    if (!found) break;

    const computed = computeExpression(found.body);
    if (computed === null) return value;

    current = current.slice(0, found.start) + computed + current.slice(found.end);
  }

  // a calc() we could not reduce means the original text is the honest answer
  return /calc\(/i.test(current) ? value : current;
}

/**
 * Locate the innermost `calc(...)` by counting brackets rather than matching them.
 *
 * A regex cannot: `calc((16px + 4px) / 2)` is ordinary css, and any pattern that stops at
 * the first `)` cuts the expression in half.
 */
function findInnermostCalc(value) {
  const opener = /calc\(/gi;
  let match;
  let innermost = null;

  while ((match = opener.exec(value)) !== null) {
    let depth = 1;
    let index = match.index + match[0].length;

    while (index < value.length && depth > 0) {
      if (value[index] === '(') depth++;
      else if (value[index] === ')') depth--;
      index++;
    }

    // unbalanced, so there is nothing here to reduce
    if (depth !== 0) return null;

    const body = value.slice(match.index + match[0].length, index - 1);
    // the innermost one is the one with no calc( left inside it
    if (!/calc\(/i.test(body)) {
      innermost = { start: match.index, end: index, body };
      break;
    }
  }

  return innermost;
}

const TOKEN = /\s*(?:(\d*\.?\d+)([a-z%]*)|([-+*/()]))/iy;

/**
 * A small recursive descent evaluator over `+ - * / ( )`.
 *
 * Units are carried rather than parsed away: `1rem * 0.8` is `0.8rem`, and `1rem + 4px`
 * is refused, because reconciling those needs a root font size we do not know.
 */
function computeExpression(expression) {
  const tokens = [];
  TOKEN.lastIndex = 0;

  // tracked by hand: a sticky regex resets lastIndex to 0 the moment it fails to match,
  // so reading it after the loop says nothing about how far we actually got
  let consumed = 0;
  let match;
  while ((match = TOKEN.exec(expression)) !== null) {
    if (match[3]) tokens.push({ operator: match[3] });
    else tokens.push({ number: parseFloat(match[1]), unit: match[2] || '' });
    consumed = TOKEN.lastIndex;
  }

  // anything left unconsumed is syntax this evaluator does not cover
  if (tokens.length === 0 || consumed < expression.trimEnd().length) return null;

  let position = 0;
  const peek = () => tokens[position];

  function parseSum() {
    let left = parseProduct();
    if (left === null) return null;

    while (peek()?.operator === '+' || peek()?.operator === '-') {
      const operator = tokens[position++].operator;
      const right = parseProduct();
      if (right === null) return null;

      // adding a length to a length needs them to be the same length
      if (left.unit && right.unit && left.unit !== right.unit) return null;

      left = {
        value: operator === '+' ? left.value + right.value : left.value - right.value,
        unit: left.unit || right.unit
      };
    }

    return left;
  }

  function parseProduct() {
    let left = parseAtom();
    if (left === null) return null;

    while (peek()?.operator === '*' || peek()?.operator === '/') {
      const operator = tokens[position++].operator;
      const right = parseAtom();
      if (right === null) return null;

      // css only allows multiplying or dividing by a plain number
      if (left.unit && right.unit) return null;
      if (operator === '/' && right.value === 0) return null;

      left = {
        value: operator === '*' ? left.value * right.value : left.value / right.value,
        unit: left.unit || right.unit
      };
    }

    return left;
  }

  function parseAtom() {
    const token = peek();
    if (!token) return null;

    if (token.operator === '(') {
      position++;
      const inner = parseSum();
      if (inner === null || peek()?.operator !== ')') return null;
      position++;
      return inner;
    }

    // unary sign, as in calc(-1 * var(--x))
    if (token.operator === '-' || token.operator === '+') {
      position++;
      const operand = parseAtom();
      if (operand === null) return null;
      return { value: token.operator === '-' ? -operand.value : operand.value, unit: operand.unit };
    }

    if (token.number === undefined) return null;
    position++;
    return { value: token.number, unit: token.unit };
  }

  const result = parseSum();
  if (result === null || position !== tokens.length) return null;

  // trim float noise, because 0.30000000000000004rem helps nobody
  const rounded = Math.round(result.value * 1e6) / 1e6;
  return `${rounded}${result.unit}`;
}

/**
 * Everything above, in the order a browser would apply it.
 */
export function resolveValue(value, variables) {
  return evaluateCalc(resolveVars(value, variables));
}
