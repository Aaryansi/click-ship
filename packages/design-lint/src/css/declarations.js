/**
 * Finding the declarations in a stylesheet.
 *
 * A design system lives in CSS more than it lives in JSX, and until now a stylesheet full
 * of hardcoded values reported clean. This is a scanner rather than a parser: it needs
 * property, value and an exact offset, and nothing else, so pulling in a CSS AST would be
 * a dependency and a compatibility surface bought for nothing.
 *
 * What it has to survive is the awkward parts of real stylesheets — semicolons inside
 * strings, `//` inside a url, scss nesting, at-rule preludes that look like declarations.
 */

const isSpace = (char) => char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f';

/**
 * Every `property: value` pair inside a block, with the offsets of the value.
 *
 * Custom properties are deliberately excluded: `--brand: #ff0000` *defines* a token, and
 * reporting it would mean flagging the design system for existing.
 */
export function scanDeclarations(code) {
  if (typeof code !== 'string') return [];

  const declarations = [];
  const length = code.length;

  let index = 0;
  let depth = 0;

  // where the current property name started, or -1 when we are not in one
  let propertyStart = -1;
  let colonAt = -1;

  const finish = (end) => {
    if (propertyStart !== -1 && colonAt !== -1 && depth > 0) {
      const property = code.slice(propertyStart, colonAt).trim();
      const rawValue = code.slice(colonAt + 1, end);

      // a token definition, not a use of one
      if (property && !property.startsWith('--') && !property.startsWith('$') && !property.startsWith('@')) {
        const leading = rawValue.length - rawValue.trimStart().length;
        const valueStart = colonAt + 1 + leading;
        const value = rawValue.trim();

        if (value) {
          declarations.push({
            property: property.toLowerCase(),
            value,
            start: valueStart,
            end: valueStart + value.length
          });
        }
      }
    }

    propertyStart = -1;
    colonAt = -1;
  };

  while (index < length) {
    const char = code[index];
    const next = code[index + 1];

    // comments, in both css and scss spellings
    if (char === '/' && next === '*') {
      const close = code.indexOf('*/', index + 2);
      index = close === -1 ? length : close + 2;
      continue;
    }

    if (char === '/' && next === '/') {
      // only a comment out here; inside url() or a string it is part of the value, and
      // those cases are consumed below before we ever reach this branch
      const newline = code.indexOf('\n', index);
      index = newline === -1 ? length : newline;
      continue;
    }

    if (char === '"' || char === "'") {
      index = skipString(code, index);
      continue;
    }

    // url(...) and every other function: parens protect whatever is inside them, which is
    // how `background: url(http://x)` survives the `//` rule above
    if (char === '(') {
      index = skipParens(code, index);
      continue;
    }

    if (char === '@') {
      // an at-rule prelude is not a declaration, and `@media (min-width: 768px)` looks
      // exactly like one
      index = skipAtRulePrelude(code, index);
      continue;
    }

    if (char === '{') {
      // a selector was being mistaken for a property up to here
      propertyStart = -1;
      colonAt = -1;
      depth++;
      index++;
      continue;
    }

    if (char === '}') {
      finish(index);
      depth = Math.max(0, depth - 1);
      index++;
      continue;
    }

    if (char === ';') {
      finish(index);
      index++;
      continue;
    }

    if (char === ':' && colonAt === -1 && propertyStart !== -1) {
      // `a:hover` is a selector, not a declaration. a real declaration's colon is followed
      // by a value and the property before it contains no selector punctuation.
      colonAt = index;
      index++;
      continue;
    }

    if (!isSpace(char) && propertyStart === -1) {
      propertyStart = index;
    }

    index++;
  }

  return declarations;
}

function skipString(code, index) {
  const quote = code[index];
  let position = index + 1;

  while (position < code.length) {
    if (code[position] === '\\') {
      position += 2;
      continue;
    }
    if (code[position] === quote) return position + 1;
    position++;
  }

  return code.length;
}

function skipParens(code, index) {
  let depth = 0;
  let position = index;

  while (position < code.length) {
    const char = code[position];

    if (char === '"' || char === "'") {
      position = skipString(code, position);
      continue;
    }
    if (char === '(') depth++;
    else if (char === ')') {
      depth--;
      if (depth === 0) return position + 1;
    }

    position++;
  }

  return code.length;
}

function skipAtRulePrelude(code, index) {
  let position = index;

  while (position < code.length) {
    const char = code[position];

    if (char === '"' || char === "'") {
      position = skipString(code, position);
      continue;
    }
    if (char === '(') {
      position = skipParens(code, position);
      continue;
    }
    // the prelude ends at the block it introduces, or at its own semicolon for @import
    if (char === '{' || char === ';') return position;

    position++;
  }

  return code.length;
}

/**
 * Turn an offset into the line and column a reporter needs.
 *
 * Columns come back 0-based, matching what babel hands the JSX rules, so everything
 * downstream can keep treating them the same way.
 */
export function positionOf(code, offset) {
  let line = 1;
  let lineStart = 0;

  for (let index = 0; index < offset && index < code.length; index++) {
    if (code[index] === '\n') {
      line++;
      lineStart = index + 1;
    }
  }

  return { line, column: offset - lineStart };
}
