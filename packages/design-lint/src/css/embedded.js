/**
 * CSS written inside JavaScript.
 *
 * styled-components, emotion and friends put real stylesheets in template literals, and
 * they were invisible to both halves of this tool: the JSX rules only look at `className`
 * and `style={{ }}`, and the stylesheet rules only look at files ending in `.css`.
 */

// the tags that mean "the contents of this template are css"
const CSS_TAGS = new Set(['css', 'createGlobalStyle', 'keyframes', 'injectGlobal']);

/**
 * Whether a tagged template's tag marks it as CSS.
 *
 * Covers `styled.button`, `styled(Component)`, and the chained forms
 * `styled.button.attrs({...})` and `styled(X).withConfig({...})`.
 */
function isStyledTag(node) {
  if (!node) return false;

  if (node.type === 'Identifier') return CSS_TAGS.has(node.name);

  // styled.button`` and styled.button.attrs()``
  if (node.type === 'MemberExpression') {
    return isStyledTag(node.object) || node.object?.name === 'styled';
  }

  // styled(Component)`` and styled.button.attrs({...})``
  if (node.type === 'CallExpression') {
    return node.callee?.name === 'styled' || isStyledTag(node.callee);
  }

  return false;
}

/**
 * The CSS inside every styled template, positioned as it sits in the file.
 *
 * Interpolations are blanked to spaces of the same length rather than removed, so every
 * offset still points at the right character of the original file. Newlines are kept, so
 * line numbers survive and a `//` comment cannot swallow past its own line.
 *
 * A declaration whose value is entirely interpolated comes out empty and is skipped, which
 * is the honest answer: nobody knows what `${({ round }) => round ? '7px' : '0'}` is.
 */
export function collectEmbeddedCSS(ast, code) {
  const found = [];
  if (!ast) return found;

  walk(ast, (node) => {
    if (node.type !== 'TaggedTemplateExpression' || !isStyledTag(node.tag)) return;

    const quasi = node.quasi;
    if (typeof quasi?.start !== 'number') return;

    // inside the backticks
    const offset = quasi.start + 1;
    const characters = code.slice(offset, quasi.end - 1).split('');

    for (const expression of quasi.expressions ?? []) {
      // `${` is two characters before the expression, `}` one after it
      const from = expression.start - 2 - offset;
      const to = expression.end + 1 - offset;

      for (let index = Math.max(0, from); index < Math.min(characters.length, to); index++) {
        if (characters[index] !== '\n') characters[index] = ' ';
      }
    }

    found.push({ text: characters.join(''), offset });
  });

  return found;
}

// a plain walk, so this does not need @babel/traverse and the scope analysis that comes
// with it just to find one node type
function walk(node, visit, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return;
  seen.add(node);

  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, seen);
    return;
  }

  if (typeof node.type === 'string') visit(node);

  for (const key of Object.keys(node)) {
    // `loc` and friends are position data, not children, and walking them is wasted work
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments' || key === 'trailingComments') {
      continue;
    }
    walk(node[key], visit, seen);
  }
}
