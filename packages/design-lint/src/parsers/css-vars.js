/**
 * CSS Variables Parser
 *
 * Extracts design tokens from CSS custom properties
 */

import { readFileSync, existsSync } from 'fs';
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
function parseContent(content, tokens) {
  // Find all :root or html blocks
  const rootBlocks = content.matchAll(/(?::root|html)\s*{([^}]*)}/g);

  for (const block of rootBlocks) {
    const variables = block[1];

    // Parse --variable: value pairs
    const varRegex = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;

    let match;
    while ((match = varRegex.exec(variables)) !== null) {
      const name = match[1];
      const value = match[2].trim();

      categorizeVariable(name, value, tokens);
    }
  }

  return tokens;
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
  const commonPaths = [
    'src/styles/globals.css',
    'src/app/globals.css',
    'app/globals.css',
    'styles/globals.css',
    'src/index.css',
    'src/styles/variables.css',
    'src/styles/tokens.css',
    'styles/variables.css',
    'css/variables.css'
  ];

  const found = [];

  for (const path of commonPaths) {
    const fullPath = join(rootDir, path);
    if (existsSync(fullPath)) {
      found.push(fullPath);
    }
  }

  return found;
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
