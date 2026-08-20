/**
 * CSS Variables Parser
 *
 * Extracts design tokens from CSS custom properties
 */

import { readFileSync, existsSync } from 'fs';
import fg from 'fast-glob';
import { resolveValue } from './css-value.js';
import { join } from 'path';

/**
 * Parse CSS file and extract custom properties
 */
export function parseCSSVariables(cssPath) {
  const tokens = {
    colors: {},
    spacing: {},
    typography: {
      fontFamily: {},
      fontSize: {},
      fontWeight: {},
      lineHeight: {}
    },
    borderRadius: {},
    shadows: {},
    source: cssPath
  };

  if (!existsSync(cssPath)) {
    return tokens;
  }

  try {
    const content = readFileSync(cssPath, 'utf-8');
    return parseContent(content, tokens);
  } catch (error) {
    console.warn(`Warning: Could not parse ${cssPath}: ${error.message}`);
    return tokens;
  }
}

/**
 * Parse CSS content for custom properties
 */
const DECLARATION = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;

function declarationsIn(block) {
  const found = [];
  DECLARATION.lastIndex = 0;

  let match;
  while ((match = DECLARATION.exec(block)) !== null) {
    found.push({ name: match[1], value: match[2].trim() });
  }

  return found;
}

function parseContent(content, tokens) {
  // every declaration in the file, whatever block it sits in, so that a theme token
  // defined as `var(--brand)` can find the `--brand` that a :root or a media query holds
  const variables = new Map();
  for (const { name, value } of declarationsIn(content)) {
    if (!variables.has(`--${name}`)) variables.set(`--${name}`, value);
  }

  // tailwind v4 declares the design system in @theme rather than in :root, and its names
  // are namespaced (`--color-primary`, `--radius-md`) in a way that maps onto utility
  // classes. reading only :root missed six of shadcn's seven radius tokens.
  for (const block of content.matchAll(/@theme[^{]*{([^}]*)}/g)) {
    for (const { name, value } of declarationsIn(block[1])) {
      categorizeThemeVariable(name, resolveValue(value, variables), tokens);
    }
  }

  for (const block of content.matchAll(/(?::root|html)\s*{([^}]*)}/g)) {
    for (const { name, value } of declarationsIn(block[1])) {
      categorizeVariable(name, resolveValue(value, variables), tokens);
    }
  }

  return tokens;
}

// what each tailwind v4 namespace controls. the prefix is stripped, because the rest is
// what appears in the class: `--radius-md` is `rounded-md`, `--text-sm` is `text-sm`.
const THEME_NAMESPACES = [
  ['color-', (tokens, name, value) => { tokens.colors[name] = value; }],
  ['text-', (tokens, name, value) => { tokens.typography.fontSize[name] = value; }],
  ['font-weight-', (tokens, name, value) => { tokens.typography.fontWeight[name] = value; }],
  ['font-', (tokens, name, value) => { tokens.typography.fontFamily[name] = value; }],
  ['leading-', (tokens, name, value) => { tokens.typography.lineHeight[name] = value; }],
  ['radius-', (tokens, name, value) => { tokens.borderRadius[name] = value; }],
  ['shadow-', (tokens, name, value) => { tokens.shadows[name] = value; }],
  ['inset-shadow-', (tokens, name, value) => { tokens.shadows[name] = value; }],
  ['drop-shadow-', (tokens, name, value) => { tokens.shadows[name] = value; }],
  ['spacing-', (tokens, name, value) => { tokens.spacing[name] = value; }]
];

// v4's default spacing steps. `--spacing` is a single base unit and every `p-4` is
// `calc(var(--spacing) * 4)`, so the scale has to be generated or the rule has nothing to
// check an arbitrary value against.
const SPACING_STEPS = [
  0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96
];

function categorizeThemeVariable(name, value, tokens) {
  if (name === 'spacing') {
    const base = parseFloat(value);
    const unit = String(value).replace(/^[\d.]+/, '').trim() || 'rem';
    if (!Number.isFinite(base)) return;

    for (const step of SPACING_STEPS) {
      const size = Math.round(base * step * 1e6) / 1e6;
      tokens.spacing[String(step)] = `${size}${unit}`;
    }
    return;
  }

  // longest prefix first, so `--font-weight-bold` is a weight and not a family
  const sorted = [...THEME_NAMESPACES].sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, assign] of sorted) {
    if (name.startsWith(prefix)) {
      const stripped = name.slice(prefix.length);
      if (stripped) assign(tokens, stripped, value);
      return;
    }
  }

  // --breakpoint-*, --container-*, --ease-* and friends are real theme values that no rule
  // here checks, so they are deliberately not stored
}

/**
 * Categorize a CSS variable by its name and value
 */
function categorizeVariable(name, value, tokens) {
  const lowerName = name.toLowerCase();

  // Color detection
  if (isColorVariable(lowerName, value)) {
    tokens.colors[name] = value;
    return;
  }

  // Spacing detection
  if (isSpacingVariable(lowerName)) {
    tokens.spacing[name] = value;
    return;
  }

  // Font family
  if (lowerName.includes('font-family') || lowerName.includes('font') && value.includes(',')) {
    tokens.typography.fontFamily[name] = value;
    return;
  }

  // Font size
  if (lowerName.includes('font-size') || lowerName.includes('text-size')) {
    tokens.typography.fontSize[name] = value;
    return;
  }

  // Font weight
  if (lowerName.includes('font-weight') || lowerName.includes('weight')) {
    tokens.typography.fontWeight[name] = value;
    return;
  }

  // Line height
  if (lowerName.includes('line-height') || lowerName.includes('leading')) {
    tokens.typography.lineHeight[name] = value;
    return;
  }

  // Border radius
  if (lowerName.includes('radius') || lowerName.includes('rounded')) {
    tokens.borderRadius[name] = value;
    return;
  }

  // Shadows
  if (lowerName.includes('shadow')) {
    tokens.shadows[name] = value;
    return;
  }
}

/**
 * Check if variable name/value indicates a color
 */
function isColorVariable(name, value) {
  // Name-based detection
  const colorKeywords = [
    'color', 'bg', 'background', 'border-color', 'text-color',
    'primary', 'secondary', 'accent', 'success', 'warning', 'error', 'danger',
    'info', 'muted', 'foreground', 'surface', 'overlay'
  ];

  if (colorKeywords.some(kw => name.includes(kw))) {
    return true;
  }

  // Value-based detection
  if (isColorValue(value)) {
    return true;
  }

  return false;
}

/**
 * Check if variable name indicates spacing
 */
function isSpacingVariable(name) {
  const spacingKeywords = [
    'spacing', 'space', 'gap', 'margin', 'padding', 'inset',
    'offset', 'gutter', 'indent'
  ];

  return spacingKeywords.some(kw => name.includes(kw));
}

/**
 * Check if value looks like a color
 */
function isColorValue(value) {
  if (typeof value !== 'string') return false;

  // Hex colors
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return true;

  // RGB/RGBA
  if (/^rgba?\s*\(/i.test(value)) return true;

  // HSL/HSLA
  if (/^hsla?\s*\(/i.test(value)) return true;

  // oklch is how tailwind v4 and every recent design system writes colour
  if (/^(?:oklch|oklab|lch|lab|color)\s*\(/i.test(value)) return true;

  // CSS color keywords (common ones)
  const colorKeywords = [
    'transparent', 'currentcolor', 'inherit',
    'black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple'
  ];

  if (colorKeywords.includes(value.toLowerCase())) return true;

  return false;
}

/**
 * Find CSS files with variables in project
 */
export function findCSSFiles(rootDir) {
  // the usual suspects first, because hitting one of these avoids walking the tree at all
  const commonPaths = [
    'src/styles/globals.css',
    'src/app/globals.css',
    'app/globals.css',
    'styles/globals.css',
    'src/index.css',
    'src/app.css',
    'src/styles/variables.css',
    'src/styles/tokens.css',
    'styles/variables.css',
    'css/variables.css'
  ];

  const found = [];

  for (const path of commonPaths) {
    const fullPath = join(rootDir, path);
    if (existsSync(fullPath)) found.push(fullPath);
  }

  if (found.length > 0) return found;

  // nothing at a conventional path does not mean a project has no tokens. a fixed list
  // silently found nothing on a tailwind v4 app whose stylesheet was called src/app.css,
  // and reporting "no design system" is worse than looking for it.
  return searchForThemeFiles(rootDir);
}

// enough to cover a normal project layout without walking a monorepo's every package
const SEARCH_LIMIT = 200;

function searchForThemeFiles(rootDir) {
  let candidates;
  try {
    candidates = fg.sync(['**/*.css'], {
      cwd: rootDir,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**', '**/coverage/**', '**/vendor/**'],
      suppressErrors: true
    });
  } catch {
    return [];
  }

  const withTokens = [];

  for (const file of candidates.slice(0, SEARCH_LIMIT)) {
    try {
      const content = readFileSync(file, 'utf-8');
      // a stylesheet earns its place by declaring custom properties, not by its name
      if (/@theme[^{]*{/.test(content) || /(?::root|html)\s*{[^}]*--/.test(content)) {
        withTokens.push(file);
      }
    } catch {
      // unreadable is the same as absent here
    }
  }

  return withTokens;
}


/**
 * Parse multiple CSS files and merge tokens
 */
export function parseCSSFilesInDirectory(rootDir) {
  const files = findCSSFiles(rootDir);
  const merged = {
    colors: {},
    spacing: {},
    typography: {
      fontFamily: {},
      fontSize: {},
      fontWeight: {},
      lineHeight: {}
    },
    borderRadius: {},
    shadows: {},
    source: []
  };

  for (const file of files) {
    const tokens = parseCSSVariables(file);
    Object.assign(merged.colors, tokens.colors);
    Object.assign(merged.spacing, tokens.spacing);
    Object.assign(merged.typography.fontFamily, tokens.typography.fontFamily);
    Object.assign(merged.typography.fontSize, tokens.typography.fontSize);
    Object.assign(merged.typography.fontWeight, tokens.typography.fontWeight);
    Object.assign(merged.typography.lineHeight, tokens.typography.lineHeight);
    Object.assign(merged.borderRadius, tokens.borderRadius);
    Object.assign(merged.shadows, tokens.shadows);
    merged.source.push(file);
  }

  return merged;
}

export default {
  parseCSSVariables,
  findCSSFiles,
  parseCSSFilesInDirectory
};
