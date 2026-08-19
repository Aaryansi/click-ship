/**
 * Where a violation points.
 *
 * Anchoring on the object property puts the report on `color:` rather than on the value
 * that is actually wrong. In a terminal that is a cosmetic inch; in an editor it is the
 * underline sitting on the wrong word, which is most of what running as an eslint plugin
 * is for. The className paths already do this by hand off the string literal.
 */
export function valueLoc(node) {
  const { line, column } = node.loc.start;
  // the opening quote is not part of the value
  const skipQuote = node.type === 'StringLiteral' ? 1 : 0;
  return { start: { line, column: column + skipQuote } };
}
