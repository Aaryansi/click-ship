/**
 * Tailwind CSS Config Parser
 *
 * Extracts design tokens from tailwind.config.js files
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse.default || _traverse;

/**
 * Default Tailwind spacing scale (4px base)
 */
const DEFAULT_SPACING_SCALE = {
  '0': '0px',
  'px': '1px',
  '0.5': '0.125rem', // 2px
  '1': '0.25rem',    // 4px
  '1.5': '0.375rem', // 6px
  '2': '0.5rem',     // 8px
  '2.5': '0.625rem', // 10px
  '3': '0.75rem',    // 12px
  '3.5': '0.875rem', // 14px
  '4': '1rem',       // 16px
  '5': '1.25rem',    // 20px
  '6': '1.5rem',     // 24px
  '7': '1.75rem',    // 28px
  '8': '2rem',       // 32px
  '9': '2.25rem',    // 36px
  '10': '2.5rem',    // 40px
  '11': '2.75rem',   // 44px
  '12': '3rem',      // 48px
  '14': '3.5rem',    // 56px
  '16': '4rem',      // 64px
  '20': '5rem',      // 80px
  '24': '6rem',      // 96px
  '28': '7rem',      // 112px
  '32': '8rem',      // 128px
  '36': '9rem',      // 144px
  '40': '10rem',     // 160px
  '44': '11rem',     // 176px
  '48': '12rem',     // 192px
  '52': '13rem',     // 208px
  '56': '14rem',     // 224px
  '60': '15rem',     // 240px
  '64': '16rem',     // 256px
  '72': '18rem',     // 288px
  '80': '20rem',     // 320px
  '96': '24rem',     // 384px
};

/**
 * Default Tailwind colors (subset for detection)
 */
const DEFAULT_COLORS = {
  'inherit': 'inherit',
  'current': 'currentColor',
  'transparent': 'transparent',
  'black': '#000000',
  'white': '#ffffff',
  // Slate
  'slate-50': '#f8fafc',
  'slate-100': '#f1f5f9',
  'slate-200': '#e2e8f0',
  'slate-300': '#cbd5e1',
  'slate-400': '#94a3b8',
  'slate-500': '#64748b',
  'slate-600': '#475569',
  'slate-700': '#334155',
  'slate-800': '#1e293b',
  'slate-900': '#0f172a',
  'slate-950': '#020617',
  // Gray
  'gray-50': '#f9fafb',
  'gray-100': '#f3f4f6',
  'gray-200': '#e5e7eb',
  'gray-300': '#d1d5db',
  'gray-400': '#9ca3af',
  'gray-500': '#6b7280',
  'gray-600': '#4b5563',
  'gray-700': '#374151',
  'gray-800': '#1f2937',
  'gray-900': '#111827',
  'gray-950': '#030712',
  // Red
  'red-50': '#fef2f2',
  'red-100': '#fee2e2',
  'red-200': '#fecaca',
  'red-300': '#fca5a5',
  'red-400': '#f87171',
  'red-500': '#ef4444',
  'red-600': '#dc2626',
  'red-700': '#b91c1c',
  'red-800': '#991b1b',
  'red-900': '#7f1d1d',
  'red-950': '#450a0a',
  // Blue
  'blue-50': '#eff6ff',
  'blue-100': '#dbeafe',
  'blue-200': '#bfdbfe',
  'blue-300': '#93c5fd',
  'blue-400': '#60a5fa',
  'blue-500': '#3b82f6',
  'blue-600': '#2563eb',
  'blue-700': '#1d4ed8',
  'blue-800': '#1e40af',
  'blue-900': '#1e3a8a',
  'blue-950': '#172554',
  // Green
  'green-50': '#f0fdf4',
  'green-100': '#dcfce7',
  'green-200': '#bbf7d0',
  'green-300': '#86efac',
  'green-400': '#4ade80',
  'green-500': '#22c55e',
  'green-600': '#16a34a',
  'green-700': '#15803d',
  'green-800': '#166534',
  'green-900': '#14532d',
  'green-950': '#052e16',
  // Yellow
  'yellow-50': '#fefce8',
  'yellow-100': '#fef9c3',
  'yellow-200': '#fef08a',
  'yellow-300': '#fde047',
  'yellow-400': '#facc15',
  'yellow-500': '#eab308',
  'yellow-600': '#ca8a04',
  'yellow-700': '#a16207',
  'yellow-800': '#854d0e',
  'yellow-900': '#713f12',
  'yellow-950': '#422006',
};

/**
 * Default font sizes
 */
const DEFAULT_FONT_SIZES = {
  'xs': ['0.75rem', { lineHeight: '1rem' }],        // 12px
  'sm': ['0.875rem', { lineHeight: '1.25rem' }],    // 14px
  'base': ['1rem', { lineHeight: '1.5rem' }],       // 16px
  'lg': ['1.125rem', { lineHeight: '1.75rem' }],    // 18px
  'xl': ['1.25rem', { lineHeight: '1.75rem' }],     // 20px
  '2xl': ['1.5rem', { lineHeight: '2rem' }],        // 24px
  '3xl': ['1.875rem', { lineHeight: '2.25rem' }],   // 30px
  '4xl': ['2.25rem', { lineHeight: '2.5rem' }],     // 36px
  '5xl': ['3rem', { lineHeight: '1' }],             // 48px
  '6xl': ['3.75rem', { lineHeight: '1' }],          // 60px
  '7xl': ['4.5rem', { lineHeight: '1' }],           // 72px
  '8xl': ['6rem', { lineHeight: '1' }],             // 96px
  '9xl': ['8rem', { lineHeight: '1' }],             // 128px
};

/**
 * Default border radius
 */
const DEFAULT_BORDER_RADIUS = {
  'none': '0px',
  'sm': '0.125rem',   // 2px
  'DEFAULT': '0.25rem', // 4px
  'md': '0.375rem',   // 6px
  'lg': '0.5rem',     // 8px
  'xl': '0.75rem',    // 12px
  '2xl': '1rem',      // 16px
  '3xl': '1.5rem',    // 24px
  'full': '9999px',
};

/**
 * Parse Tailwind config file and extract tokens
 */
export function parseTailwindConfig(configPath) {
  const tokens = {
    colors: { ...DEFAULT_COLORS },
    spacing: { ...DEFAULT_SPACING_SCALE },
    typography: {
      fontFamily: {},
      fontSize: { ...DEFAULT_FONT_SIZES },
      fontWeight: {}
    },
    borderRadius: { ...DEFAULT_BORDER_RADIUS },
    shadows: {},
    source: configPath
  };

  if (!existsSync(configPath)) {
    return tokens;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const customTokens = parseConfigContent(content);
    return mergeTokens(tokens, customTokens);
  } catch (error) {
    console.warn(`Warning: Could not parse ${configPath}: ${error.message}`);
    return tokens;
  }
}

/**
 * Read the config's exported object without executing it.
 *
 * The previous implementation matched the theme block with
 * /theme\s*:\s*{([\s\S]*?)}\s*(?:,|\})/, which is non-greedy and therefore stops at the
 * first nested closing brace. Every real config nests, so the captured string was
 * truncated and nothing downstream ever matched. It silently fell back to the stock
 * palette, which looked like it had worked.
 *
 * Parsing is static on purpose. A tailwind config may require() plugins or call
 * functions, and reading colour values is not a good reason to execute a project's code.
 * Anything not statically knowable is skipped rather than guessed at.
 */
function parseConfigContent(content) {
  const tokens = {
    colors: {},
    spacing: {},
    typography: {
      fontFamily: {},
      fontSize: {},
      fontWeight: {}
    },
    borderRadius: {},
    shadows: {}
  };

  let ast;
  try {
    ast = parse(content, {
      sourceType: 'unambiguous',
      plugins: ['typescript'],
      errorRecovery: true
    });
  } catch {
    return tokens;
  }

  const configNode = findConfigObject(ast);
  if (!configNode) return tokens;

  const config = evaluateNode(configNode);
  if (!config || typeof config !== 'object') return tokens;

  const theme = config.theme && typeof config.theme === 'object' ? config.theme : {};
  const extend = theme.extend && typeof theme.extend === 'object' ? theme.extend : {};

  // tailwind layers `extend` on top of the base theme rather than replacing it
  const section = (name) => ({ ...(theme[name] || {}), ...(extend[name] || {}) });

  tokens.colors = flattenScale(section('colors'));
  tokens.spacing = flattenScale(section('spacing'));
  tokens.borderRadius = flattenScale(section('borderRadius'));
  tokens.shadows = flattenScale(section('boxShadow'));
  tokens.typography.fontSize = flattenScale(section('fontSize'));
  tokens.typography.fontWeight = flattenScale(section('fontWeight'));
  tokens.typography.fontFamily = flattenFontFamily(section('fontFamily'));

  return tokens;
}

/**
 * Locate the object the config exports, covering the shapes real configs use:
 * `module.exports = {}`, `export default {}`, either one via a named variable, a
 * `defineConfig({})` wrapper, and TypeScript's `satisfies Config` / `as Config`.
 */
function findConfigObject(ast) {
  let found = null;

  const unwrap = (node, scope) => {
    if (!node) return null;
    if (node.type === 'ObjectExpression') return node;
    // `{...} satisfies Config` and `{...} as Config`
    if (node.type === 'TSSatisfiesExpression' || node.type === 'TSAsExpression') {
      return unwrap(node.expression, scope);
    }
    // `defineConfig({...})`
    if (node.type === 'CallExpression' && node.arguments.length > 0) {
      return unwrap(node.arguments[0], scope);
    }
    // `const config = {...}; export default config;`
    if (node.type === 'Identifier' && scope) {
      const binding = scope.getBinding(node.name);
      const init = binding?.path?.node?.init;
      return init ? unwrap(init, scope) : null;
    }
    return null;
  };

  traverse(ast, {
    ExportDefaultDeclaration(path) {
      found = found || unwrap(path.node.declaration, path.scope);
    },
    AssignmentExpression(path) {
      const { left, right } = path.node;
      const isModuleExports =
        left.type === 'MemberExpression' &&
        !left.computed &&
        left.object.type === 'Identifier' && left.object.name === 'module' &&
        left.property.type === 'Identifier' && left.property.name === 'exports';

      if (isModuleExports) found = found || unwrap(right, path.scope);
    }
  });

  return found;
}

/**
 * Turn an object-literal node into plain data. Returns undefined for anything that
 * cannot be known without running the file.
 */
function evaluateNode(node) {
  if (!node) return undefined;

  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return node.value;

    case 'NullLiteral':
      return null;

    case 'TemplateLiteral':
      // only safe when nothing is interpolated
      return node.expressions.length === 0 ? node.quasis[0].value.cooked : undefined;

    case 'UnaryExpression': {
      if (node.operator !== '-') return undefined;
      const inner = evaluateNode(node.argument);
      return typeof inner === 'number' ? -inner : undefined;
    }

    case 'ArrayExpression': {
      const items = [];
      for (const element of node.elements) {
        const value = evaluateNode(element);
        if (value !== undefined) items.push(value);
      }
      return items;
    }

    case 'ObjectExpression': {
      const result = {};
      for (const property of node.properties) {
        // skips spreads, methods and getters, which we cannot resolve statically
        if (property.type !== 'ObjectProperty' || property.computed) continue;

        const key = propertyName(property.key);
        if (key === null) continue;

        const value = evaluateNode(property.value);
        if (value !== undefined) result[key] = value;
      }
      return result;
    }

    default:
      return undefined;
  }
}

function propertyName(key) {
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'StringLiteral') return key.value;
  if (key.type === 'NumericLiteral') return String(key.value);
  return null;
}

/**
 * Flatten tailwind's nested scales into the `blue-500` names the rules compare against.
 * `DEFAULT` collapses onto its parent, matching how tailwind generates class names.
 */
function flattenScale(scale, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(scale || {})) {
    const name = key === 'DEFAULT'
      ? (prefix || 'DEFAULT')
      : (prefix ? `${prefix}-${key}` : key);

    if (Array.isArray(value)) {
      // fontSize entries look like ['0.875rem', { lineHeight: '1.25rem' }]
      if (typeof value[0] === 'string' || typeof value[0] === 'number') out[name] = value[0];
    } else if (value && typeof value === 'object') {
      flattenScale(value, name, out);
    } else if (typeof value === 'string' || typeof value === 'number') {
      out[name] = value;
    }
  }
  return out;
}

function flattenFontFamily(families) {
  const out = {};
  for (const [name, value] of Object.entries(families || {})) {
    if (Array.isArray(value)) out[name] = value.filter(v => typeof v === 'string').join(', ');
    else if (typeof value === 'string') out[name] = value;
  }
  return out;
}

/**
 * Merge custom tokens with defaults
 */
function mergeTokens(defaults, custom) {
  const result = { ...defaults };

  for (const [key, value] of Object.entries(custom)) {
    if (key === 'typography') {
      result.typography = {
        ...result.typography,
        ...value,
        fontFamily: { ...result.typography.fontFamily, ...value.fontFamily },
        fontSize: { ...result.typography.fontSize, ...value.fontSize },
        fontWeight: { ...result.typography.fontWeight, ...value.fontWeight }
      };
    } else if (typeof value === 'object' && value !== null) {
      result[key] = { ...result[key], ...value };
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Find tailwind config in project
 */
export function findTailwindConfig(rootDir) {
  const configNames = [
    'tailwind.config.js',
    'tailwind.config.ts',
    'tailwind.config.mjs',
    'tailwind.config.cjs'
  ];

  for (const name of configNames) {
    const configPath = join(rootDir, name);
    if (existsSync(configPath)) {
      return configPath;
    }
  }

  return null;
}

/**
 * Convert rem/px to pixels for comparison
 */
export function toPixels(value) {
  // a bare number is legal in a config (`spacing: { 1: 4 }`) and the AST parser now
  // hands those through as real numbers, where the old regex could only ever produce
  // strings. tailwind treats a unitless value as pixels.
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const numMatch = value.match(/^(\d+(?:\.\d+)?)(px|rem|em)?$/);
  if (!numMatch) return null;

  const num = parseFloat(numMatch[1]);
  const unit = numMatch[2] || 'px';

  switch (unit) {
    case 'px':
      return num;
    case 'rem':
    case 'em':
      return num * 16; // Assumes 16px base
    default:
      return num;
  }
}

export default {
  parseTailwindConfig,
  findTailwindConfig,
  toPixels,
  DEFAULT_SPACING_SCALE,
  DEFAULT_COLORS,
  DEFAULT_FONT_SIZES,
  DEFAULT_BORDER_RADIUS
};
