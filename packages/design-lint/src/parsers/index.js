/**
 * Design Token Parsers
 *
 * Unified interface for parsing design tokens from various sources
 */

import { parseTailwindConfig, findTailwindConfig, toPixels } from './tailwind.js';
import { parseCSSVariables, findCSSFiles, parseCSSFilesInDirectory } from './css-vars.js';
import { parseTokensJSON, findTokensJSON } from './tokens-json.js';
import { parseFigmaTokens, findFigmaTokensFile } from './figma-tokens.js';
import { existsSync } from 'fs';

/**
 * Auto-detect and parse all token sources in a project
 */
export async function parseAllTokens(rootDir, options = {}) {
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
    sources: []
  };

  const parsers = [];

  // Tailwind config
  if (options.tailwind !== false) {
    const tailwindPath = options.tailwindConfig || findTailwindConfig(rootDir);
    if (tailwindPath && existsSync(tailwindPath)) {
      parsers.push({
        name: 'tailwind',
        path: tailwindPath,
        parse: () => parseTailwindConfig(tailwindPath)
      });
    }
  }

  // CSS variables
  if (options.cssVars !== false) {
    const cssFiles = findCSSFiles(rootDir);
    if (cssFiles.length > 0) {
      parsers.push({
        name: 'css-vars',
        path: cssFiles,
        parse: () => parseCSSFilesInDirectory(rootDir)
      });
    }
  }

  // Tokens JSON
  if (options.tokensJson !== false) {
    const tokensPath = options.tokensJson || findTokensJSON(rootDir);
    if (tokensPath && existsSync(tokensPath)) {
      parsers.push({
        name: 'tokens-json',
        path: tokensPath,
        parse: () => parseTokensJSON(tokensPath)
      });
    }
  }

  // Figma tokens
  if (options.figmaTokens !== false) {
    const figmaPath = options.figmaTokens || findFigmaTokensFile(rootDir);
    if (figmaPath && existsSync(figmaPath)) {
      parsers.push({
        name: 'figma',
        path: figmaPath,
        parse: () => parseFigmaTokens(figmaPath)
      });
    }
  }

  // Run all parsers and merge results
  for (const parser of parsers) {
    try {
      const result = parser.parse();
      mergeTokens(tokens, result);
      tokens.sources.push({
        type: parser.name,
        path: parser.path
      });
    } catch (error) {
      console.warn(`Warning: Failed to parse ${parser.name}: ${error.message}`);
    }
  }

  return tokens;
}

/**
 * Merge tokens from source into target
 */
function mergeTokens(target, source) {
  // Colors
  if (source.colors) {
    Object.assign(target.colors, source.colors);
  }

  // Spacing
  if (source.spacing) {
    Object.assign(target.spacing, source.spacing);
  }

  // Typography
  if (source.typography) {
    if (source.typography.fontFamily) {
      Object.assign(target.typography.fontFamily, source.typography.fontFamily);
    }
    if (source.typography.fontSize) {
      Object.assign(target.typography.fontSize, source.typography.fontSize);
    }
    if (source.typography.fontWeight) {
      Object.assign(target.typography.fontWeight, source.typography.fontWeight);
    }
    if (source.typography.lineHeight) {
      Object.assign(target.typography.lineHeight, source.typography.lineHeight);
    }
  }

  // Border radius
  if (source.borderRadius) {
    Object.assign(target.borderRadius, source.borderRadius);
  }

  // Shadows
  if (source.shadows) {
    Object.assign(target.shadows, source.shadows);
  }
}

/**
 * Create spacing scale from tokens for validation
 */
export function createSpacingScale(tokens) {
  const scale = new Set();

  for (const value of Object.values(tokens.spacing)) {
    const px = toPixels(value);
    if (px !== null) {
      scale.add(px);
    }
  }

  return Array.from(scale).sort((a, b) => a - b);
}

/**
 * Normalize color to hex for comparison
 */
export function normalizeColor(color) {
  if (typeof color !== 'string') return null;

  // Already hex
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color.toLowerCase();
  }

  // 3-digit hex
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [, r, g, b] = color.match(/^#(.)(.)(.)$/i);
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  // RGB/RGBA
  const rgbMatch = color.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  return null;
}

/**
 * Find closest token match for a value
 */
export function findClosestToken(value, tokenMap, category) {
  if (category === 'colors') {
    return findClosestColor(value, tokenMap);
  }

  if (category === 'spacing' || category === 'borderRadius') {
    return findClosestNumeric(value, tokenMap);
  }

  // Exact match for other categories
  for (const [name, tokenValue] of Object.entries(tokenMap)) {
    if (tokenValue === value) {
      return { name, value: tokenValue, exact: true };
    }
  }

  return null;
}

/**
 * Find closest color token
 */
function findClosestColor(color, colorTokens) {
  const normalized = normalizeColor(color);
  if (!normalized) return null;

  let closest = null;
  let minDistance = Infinity;

  for (const [name, tokenColor] of Object.entries(colorTokens)) {
    const tokenNormalized = normalizeColor(tokenColor);
    if (!tokenNormalized) continue;

    // Exact match
    if (normalized === tokenNormalized) {
      return { name, value: tokenColor, exact: true, distance: 0 };
    }

    // Calculate color distance
    const distance = colorDistance(normalized, tokenNormalized);
    if (distance < minDistance) {
      minDistance = distance;
      closest = { name, value: tokenColor, exact: false, distance };
    }
  }

  // Only return if reasonably close
  if (closest && closest.distance < 50) {
    return closest;
  }

  return null;
}

/**
 * Calculate Euclidean distance between two hex colors
 */
function colorDistance(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);

  if (!rgb1 || !rgb2) return Infinity;

  return Math.sqrt(
    Math.pow(rgb1.r - rgb2.r, 2) +
    Math.pow(rgb1.g - rgb2.g, 2) +
    Math.pow(rgb1.b - rgb2.b, 2)
  );
}

/**
 * Convert hex to RGB
 */
function hexToRgb(hex) {
  const match = hex.match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return null;

  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16)
  };
}

/**
 * Find closest numeric token (for spacing, radius)
 */
function findClosestNumeric(value, tokenMap) {
  const numValue = toPixels(value);
  if (numValue === null) return null;

  let closest = null;
  let minDiff = Infinity;

  for (const [name, tokenValue] of Object.entries(tokenMap)) {
    const tokenNum = toPixels(tokenValue);
    if (tokenNum === null) continue;

    // Exact match
    if (numValue === tokenNum) {
      return { name, value: tokenValue, exact: true, diff: 0 };
    }

    const diff = Math.abs(numValue - tokenNum);
    if (diff < minDiff) {
      minDiff = diff;
      closest = { name, value: tokenValue, exact: false, diff };
    }
  }

  // Only return if very close (within 2px)
  if (closest && closest.diff <= 2) {
    return closest;
  }

  return null;
}

export {
  parseTailwindConfig,
  findTailwindConfig,
  parseCSSVariables,
  findCSSFiles,
  parseTokensJSON,
  findTokensJSON,
  parseFigmaTokens,
  findFigmaTokensFile,
  toPixels
};

export default {
  parseAllTokens,
  createSpacingScale,
  normalizeColor,
  findClosestToken,
  parseTailwindConfig,
  parseCSSVariables,
  parseTokensJSON,
  parseFigmaTokens
};
