/**
 * AST-Based File Localization for Click-Ship
 *
 * Uses Babel to parse JSX/TSX files and locate elements by CSS selector.
 */

import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';

// Handle both ESM and CJS module formats
const traverse = _traverse.default || _traverse;
const generate = _generate.default || _generate;

// ============================================
// Selector Parsing
// ============================================

/**
 * Parse CSS selector into components
 */
export function parseSelector(selector) {
  const result = {
    tag: null,
    classes: [],
    id: null,
    attributes: [],
    pseudos: []
  };

  // Extract ID
  const idMatch = selector.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    result.id = idMatch[1];
  }

  // Extract classes
  const classMatches = selector.matchAll(/\.([a-zA-Z0-9_-]+)/g);
  for (const match of classMatches) {
    result.classes.push(match[1]);
  }

  // Extract tag name (at the start, before any class/id)
  const tagMatch = selector.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
  if (tagMatch && !['div', 'span', 'p', 'a', 'button', 'input'].includes(tagMatch[1].toLowerCase())) {
    // Likely a component name
    result.tag = tagMatch[1];
  }

  // Extract data attributes
  const attrMatches = selector.matchAll(/\[([^\]=]+)(?:=["']?([^"'\]]+)["']?)?\]/g);
  for (const match of attrMatches) {
    result.attributes.push({
      name: match[1],
      value: match[2] || null
    });
  }

  return result;
}

// ============================================
// AST Element Finding
// ============================================

/**
 * Find JSX element by CSS selector in source code
 */
export function findElementBySelector(code, selector, options = {}) {
  const { classes, id, attributes, tag } = parseSelector(selector);
  const results = [];

  let ast;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript',
        'decorators-legacy',
        'classProperties',
        'optionalChaining',
        'nullishCoalescingOperator'
      ],
      errorRecovery: true
    });
  } catch (error) {
    console.error('AST parse error:', error.message);
    return results;
  }

  traverse(ast, {
    JSXOpeningElement(path) {
      const node = path.node;
      const elementClasses = extractClassNames(node);
      const elementId = extractId(node);
      const elementTag = getElementTagName(node);
      const elementAttrs = extractAttributes(node);

      // Check if element matches selector
      if (matchesSelector(elementClasses, elementId, elementAttrs, elementTag, classes, id, attributes, tag)) {
        const parentComponent = findParentComponent(path);
        const location = node.loc;

        results.push({
          line: location.start.line,
          column: location.start.column,
          endLine: location.end.line,
          endColumn: location.end.column,
          code: getNodeSourceCode(code, node),
          fullElement: getFullElementCode(code, path),
          component: parentComponent,
          tag: elementTag,
          classes: elementClasses,
          id: elementId
        });
      }
    }
  });

  return results;
}

/**
 * Find all JSX elements with className attributes
 */
export function findAllClassedElements(code) {
  const elements = [];

  let ast;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
      errorRecovery: true
    });
  } catch (error) {
    return elements;
  }

  traverse(ast, {
    JSXOpeningElement(path) {
      const classes = extractClassNames(path.node);
      const id = extractId(path.node);

      if (classes.length > 0 || id) {
        elements.push({
          line: path.node.loc.start.line,
          tag: getElementTagName(path.node),
          classes,
          id,
          component: findParentComponent(path)
        });
      }
    }
  });

  return elements;
}

// ============================================
// Element Matching
// ============================================

/**
 * Check if element matches the parsed selector
 */
function matchesSelector(elementClasses, elementId, elementAttrs, elementTag, selectorClasses, selectorId, selectorAttrs, selectorTag) {
  // Check ID match
  if (selectorId && elementId !== selectorId) {
    return false;
  }

  // Check class matches (all selector classes must be present)
  for (const cls of selectorClasses) {
    // Handle Tailwind/CSS module class name variations
    const hasClass = elementClasses.some(ec => {
      // Exact match
      if (ec === cls) return true;
      // Partial match for generated classes (e.g., 'button_abc123' matches 'button')
      if (ec.startsWith(cls + '_') || ec.startsWith(cls + '-')) return true;
      // Tailwind arbitrary value match
      if (ec.includes(cls)) return true;
      return false;
    });

    if (!hasClass) return false;
  }

  // Check tag/component match
  if (selectorTag && elementTag.toLowerCase() !== selectorTag.toLowerCase()) {
    return false;
  }

  // Check attribute matches
  for (const attr of selectorAttrs) {
    const elemAttr = elementAttrs.find(a => a.name === attr.name);
    if (!elemAttr) return false;
    if (attr.value && elemAttr.value !== attr.value) return false;
  }

  // Must match at least something
  return selectorClasses.length > 0 || selectorId || selectorTag || selectorAttrs.length > 0;
}

// ============================================
// Attribute Extraction
// ============================================

/**
 * Extract class names from JSX element
 */
function extractClassNames(node) {
  const classes = [];

  for (const attr of node.attributes) {
    if (attr.type !== 'JSXAttribute') continue;

    const attrName = attr.name?.name;
    if (attrName !== 'className' && attrName !== 'class') continue;

    // String literal className
    if (attr.value?.type === 'StringLiteral') {
      classes.push(...attr.value.value.split(/\s+/).filter(Boolean));
    }

    // Expression className (template literal, clsx, etc.)
    if (attr.value?.type === 'JSXExpressionContainer') {
      const expr = attr.value.expression;

      // Template literal
      if (expr.type === 'TemplateLiteral') {
        for (const quasi of expr.quasis) {
          classes.push(...quasi.value.raw.split(/\s+/).filter(Boolean));
        }
      }

      // String literal in expression
      if (expr.type === 'StringLiteral') {
        classes.push(...expr.value.split(/\s+/).filter(Boolean));
      }

      // Array of classes (clsx, classnames)
      if (expr.type === 'ArrayExpression') {
        for (const element of expr.elements) {
          if (element?.type === 'StringLiteral') {
            classes.push(...element.value.split(/\s+/).filter(Boolean));
          }
        }
      }

      // Object (conditional classes)
      if (expr.type === 'ObjectExpression') {
        for (const prop of expr.properties) {
          if (prop.key?.type === 'Identifier') {
            classes.push(prop.key.name);
          } else if (prop.key?.type === 'StringLiteral') {
            classes.push(...prop.key.value.split(/\s+/).filter(Boolean));
          }
        }
      }

      // clsx/cn call
      if (expr.type === 'CallExpression') {
        for (const arg of expr.arguments) {
          if (arg.type === 'StringLiteral') {
            classes.push(...arg.value.split(/\s+/).filter(Boolean));
          }
        }
      }
    }
  }

  return classes;
}

/**
 * Extract ID from JSX element
 */
function extractId(node) {
  for (const attr of node.attributes) {
    if (attr.type !== 'JSXAttribute') continue;
    if (attr.name?.name !== 'id') continue;

    if (attr.value?.type === 'StringLiteral') {
      return attr.value.value;
    }
  }
  return null;
}

/**
 * Extract all attributes from JSX element
 */
function extractAttributes(node) {
  const attrs = [];

  for (const attr of node.attributes) {
    if (attr.type !== 'JSXAttribute') continue;

    const name = attr.name?.name;
    if (!name) continue;

    let value = null;
    if (attr.value?.type === 'StringLiteral') {
      value = attr.value.value;
    }

    attrs.push({ name, value });
  }

  return attrs;
}

/**
 * Get element tag name
 */
function getElementTagName(node) {
  if (node.name.type === 'JSXIdentifier') {
    return node.name.name;
  }
  if (node.name.type === 'JSXMemberExpression') {
    // Handle Component.SubComponent
    return `${node.name.object.name}.${node.name.property.name}`;
  }
  return 'unknown';
}

// ============================================
// Context Extraction
// ============================================

/**
 * Find parent component/function name
 */
function findParentComponent(path) {
  let current = path.parentPath;

  while (current) {
    // Function declaration
    if (current.node.type === 'FunctionDeclaration' && current.node.id) {
      return current.node.id.name;
    }

    // Variable declaration with arrow function
    if (current.node.type === 'VariableDeclarator' && current.node.id) {
      return current.node.id.name;
    }

    // Class component
    if (current.node.type === 'ClassDeclaration' && current.node.id) {
      return current.node.id.name;
    }

    current = current.parentPath;
  }

  return null;
}

/**
 * Get source code for a node
 */
function getNodeSourceCode(fullSource, node) {
  const lines = fullSource.split('\n');
  const startLine = node.loc.start.line - 1;
  const endLine = node.loc.end.line - 1;

  if (startLine === endLine) {
    return lines[startLine].slice(node.loc.start.column, node.loc.end.column);
  }

  const result = [];
  for (let i = startLine; i <= endLine; i++) {
    if (i === startLine) {
      result.push(lines[i].slice(node.loc.start.column));
    } else if (i === endLine) {
      result.push(lines[i].slice(0, node.loc.end.column));
    } else {
      result.push(lines[i]);
    }
  }

  return result.join('\n');
}

/**
 * Get full element code (opening + children + closing)
 */
function getFullElementCode(fullSource, path) {
  // Get parent JSXElement to include closing tag
  let elementPath = path;
  if (path.parent.type === 'JSXElement') {
    elementPath = path.parentPath;
  }

  const node = elementPath.node;
  const lines = fullSource.split('\n');
  const startLine = node.loc.start.line - 1;
  const endLine = node.loc.end.line - 1;

  const result = [];
  for (let i = startLine; i <= endLine; i++) {
    if (i === startLine && i === endLine) {
      result.push(lines[i].slice(node.loc.start.column, node.loc.end.column));
    } else if (i === startLine) {
      result.push(lines[i].slice(node.loc.start.column));
    } else if (i === endLine) {
      result.push(lines[i].slice(0, node.loc.end.column));
    } else {
      result.push(lines[i]);
    }
  }

  return result.join('\n');
}

// ============================================
// Code Extraction with Context
// ============================================

/**
 * Extract code lines with surrounding context
 */
export function extractCodeWithContext(code, lineNumber, contextLines = 5) {
  const lines = code.split('\n');
  const startLine = Math.max(0, lineNumber - contextLines - 1);
  const endLine = Math.min(lines.length - 1, lineNumber + contextLines - 1);

  const context = [];
  for (let i = startLine; i <= endLine; i++) {
    context.push({
      line: i + 1,
      content: lines[i],
      isTarget: i === lineNumber - 1
    });
  }

  return {
    lines: context,
    startLine: startLine + 1,
    endLine: endLine + 1,
    code: lines.slice(startLine, endLine + 1).join('\n')
  };
}

/**
 * Find the best file containing the selector
 */
export async function findFileWithSelector(files, selector, getFileContent) {
  const { classes, id } = parseSelector(selector);
  const searchTerms = [...classes];
  if (id) searchTerms.push(id);

  if (searchTerms.length === 0) {
    return null;
  }

  const candidates = [];

  for (const file of files) {
    const content = await getFileContent(file.path);
    if (!content) continue;

    // Quick string check first
    const hasTerms = searchTerms.some(term => content.includes(term));
    if (!hasTerms) continue;

    // Full AST search
    const matches = findElementBySelector(content, selector);

    if (matches.length > 0) {
      candidates.push({
        file,
        content,
        matches,
        score: matches.length * 10 + (file.path.includes('components/') ? 5 : 0)
      });
    }
  }

  // Sort by score (more matches = better)
  candidates.sort((a, b) => b.score - a.score);

  return candidates[0] || null;
}

export default {
  parseSelector,
  findElementBySelector,
  findAllClassedElements,
  extractCodeWithContext,
  findFileWithSelector
};
