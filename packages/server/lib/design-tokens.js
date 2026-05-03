/**
 * Design Token Extraction for Click-Ship
 *
 * Parses Tailwind config and CSS variables to extract design tokens.
 */

import { getFileContent } from './github.js';

// ============================================
// Token Extraction
// ============================================

/**
 * Extract all design tokens from a repository
 */
export async function extractDesignTokens(octokit, owner, repo, branch = 'main') {
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
    breakpoints: {},
    source: []
  };

  // Try different token sources
  await Promise.all([
    extractFromTailwindConfig(octokit, owner, repo, branch, tokens),
    extractFromCSSVariables(octokit, owner, repo, branch, tokens),
    extractFromTokensJSON(octokit, owner, repo, branch, tokens)
  ]);

  return tokens;
}

// ============================================
// Tailwind Config Parsing
// ============================================

/**
 * Extract tokens from tailwind.config.js
 */
async function extractFromTailwindConfig(octokit, owner, repo, branch, tokens) {
  const configPaths = [
    'tailwind.config.js',
    'tailwind.config.ts',
    'tailwind.config.mjs',
    'tailwind.config.cjs'
  ];

  for (const path of configPaths) {
    const file = await getFileContent(octokit, owner, repo, path, branch);
    if (!file) continue;

    try {
      const parsed = parseTailwindConfig(file.content);
      mergeTokens(tokens, parsed);
      tokens.source.push(path);
      return;
    } catch (error) {
      console.warn(`Failed to parse ${path}:`, error.message);
    }
  }
}

/**
 * Parse Tailwind config file content
 */
function parseTailwindConfig(content) {
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

  // Extract theme.extend.colors
  const colorsMatch = content.match(/colors\s*:\s*({[\s\S]*?})\s*[,}]/);
  if (colorsMatch) {
    tokens.colors = parseObjectLiteral(colorsMatch[1]);
  }

  // Extract theme.extend.spacing
  const spacingMatch = content.match(/spacing\s*:\s*({[\s\S]*?})\s*[,}]/);
  if (spacingMatch) {
    tokens.spacing = parseObjectLiteral(spacingMatch[1]);
  }

  // Extract theme.extend.fontFamily
  const fontFamilyMatch = content.match(/fontFamily\s*:\s*({[\s\S]*?})\s*[,}]/);
  if (fontFamilyMatch) {
    tokens.typography.fontFamily = parseObjectLiteral(fontFamilyMatch[1]);
  }

  // Extract theme.extend.fontSize
  const fontSizeMatch = content.match(/fontSize\s*:\s*({[\s\S]*?})\s*[,}]/);
  if (fontSizeMatch) {
    tokens.typography.fontSize = parseObjectLiteral(fontSizeMatch[1]);
  }

  // Extract theme.extend.borderRadius
  const radiusMatch = content.match(/borderRadius\s*:\s*({[\s\S]*?})\s*[,}]/);
  if (radiusMatch) {
    tokens.borderRadius = parseObjectLiteral(radiusMatch[1]);
  }

  // Extract theme.extend.boxShadow
  const shadowMatch = content.match(/boxShadow\s*:\s*({[\s\S]*?})\s*[,}]/);
  if (shadowMatch) {
    tokens.shadows = parseObjectLiteral(shadowMatch[1]);
  }

  return tokens;
}

/**
 * Parse JavaScript object literal string
 */
function parseObjectLiteral(str) {
  const result = {};

  // Match key-value pairs
  const pairRegex = /['"]?(\w+)['"]?\s*:\s*(?:['"]([^'"]+)['"]|(\d+(?:\.\d+)?(?:px|rem|em|%)?)|(\[[\s\S]*?\]))/g;

  let match;
  while ((match = pairRegex.exec(str)) !== null) {
    const key = match[1];
    const value = match[2] || match[3] || match[4];

    if (value) {
      // Handle array values (font stacks)
      if (value.startsWith('[')) {
        result[key] = parseArrayLiteral(value);
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * Parse array literal string
 */
function parseArrayLiteral(str) {
  const items = [];
  const itemRegex = /['"]([^'"]+)['"]/g;

  let match;
  while ((match = itemRegex.exec(str)) !== null) {
    items.push(match[1]);
  }

  return items;
}

// ============================================
// CSS Variables Parsing
// ============================================

/**
 * Extract tokens from CSS variables
 */
async function extractFromCSSVariables(octokit, owner, repo, branch, tokens) {
  const cssPaths = [
    'src/styles/globals.css',
    'src/app/globals.css',
    'app/globals.css',
    'styles/globals.css',
    'src/index.css',
    'src/styles/variables.css'
  ];

  for (const path of cssPaths) {
    const file = await getFileContent(octokit, owner, repo, path, branch);
    if (!file) continue;

    try {
      const parsed = parseCSSVariables(file.content);
      mergeTokens(tokens, parsed);
      tokens.source.push(path);
    } catch (error) {
      console.warn(`Failed to parse ${path}:`, error.message);
    }
  }
}

/**
 * Parse CSS custom properties
 */
function parseCSSVariables(content) {
  const tokens = {
    colors: {},
    spacing: {},
    typography: {
      fontFamily: {},
      fontSize: {}
    },
    borderRadius: {}
  };

  // Find :root block
  const rootMatch = content.match(/:root\s*{([\s\S]*?)}/);
  if (!rootMatch) return tokens;

  const rootContent = rootMatch[1];

  // Parse --variable: value pairs
  const varRegex = /--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;

  let match;
  while ((match = varRegex.exec(rootContent)) !== null) {
    const name = match[1];
    const value = match[2].trim();

    // Categorize by naming convention
    if (name.includes('color') || name.includes('bg') || name.match(/^(primary|secondary|accent|success|warning|error|gray|neutral)/)) {
      tokens.colors[name] = value;
    } else if (name.includes('spacing') || name.includes('gap') || name.includes('margin') || name.includes('padding')) {
      tokens.spacing[name] = value;
    } else if (name.includes('font-size') || name.includes('text')) {
      tokens.typography.fontSize[name] = value;
    } else if (name.includes('font-family') || name.includes('font')) {
      tokens.typography.fontFamily[name] = value;
    } else if (name.includes('radius') || name.includes('rounded')) {
      tokens.borderRadius[name] = value;
    }
  }

  return tokens;
}

// ============================================
// Design Tokens JSON
// ============================================

/**
 * Extract from tokens.json (Style Dictionary format)
 */
async function extractFromTokensJSON(octokit, owner, repo, branch, tokens) {
  const tokenPaths = [
    'tokens.json',
    'design-tokens.json',
    'src/tokens.json',
    'styles/tokens.json'
  ];

  for (const path of tokenPaths) {
    const file = await getFileContent(octokit, owner, repo, path, branch);
    if (!file) continue;

    try {
      const parsed = JSON.parse(file.content);
      const flattened = flattenTokensJSON(parsed);
      mergeTokens(tokens, flattened);
      tokens.source.push(path);
      return;
    } catch (error) {
      console.warn(`Failed to parse ${path}:`, error.message);
    }
  }
}

/**
 * Flatten nested tokens JSON to our format
 */
function flattenTokensJSON(obj, prefix = '', result = { colors: {}, spacing: {}, typography: {}, borderRadius: {} }) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}-${key}` : key;

    if (value && typeof value === 'object') {
      if ('value' in value) {
        // Token leaf node
        categorizeToken(path, value.value, result);
      } else {
        // Nested object
        flattenTokensJSON(value, path, result);
      }
    }
  }

  return result;
}

/**
 * Categorize a token by its name
 */
function categorizeToken(name, value, result) {
  const lowerName = name.toLowerCase();

  if (lowerName.includes('color') || isColorValue(value)) {
    result.colors[name] = value;
  } else if (lowerName.includes('spacing') || lowerName.includes('size')) {
    result.spacing[name] = value;
  } else if (lowerName.includes('font')) {
    result.typography[name] = value;
  } else if (lowerName.includes('radius')) {
    result.borderRadius[name] = value;
  }
}

/**
 * Check if value looks like a color
 */
function isColorValue(value) {
  if (typeof value !== 'string') return false;
  return /^#[0-9a-f]{3,8}$/i.test(value) ||
    /^rgb/.test(value) ||
    /^hsl/.test(value);
}

// ============================================
// Token Operations
// ============================================

/**
 * Merge tokens from source into target
 */
function mergeTokens(target, source) {
  for (const [category, values] of Object.entries(source)) {
    if (category === 'source') continue;

    if (typeof values === 'object' && values !== null) {
      if (!target[category]) {
        target[category] = {};
      }

      if (category === 'typography') {
        // Handle nested typography
        for (const [subCategory, subValues] of Object.entries(values)) {
          if (!target.typography[subCategory]) {
            target.typography[subCategory] = {};
          }
          Object.assign(target.typography[subCategory], subValues);
        }
      } else {
        Object.assign(target[category], values);
      }
    }
  }
}

/**
 * Find closest matching color token
 */
export function findClosestColorToken(hexColor, tokens) {
  if (!tokens.colors || Object.keys(tokens.colors).length === 0) {
    return null;
  }

  const targetRGB = hexToRGB(hexColor);
  if (!targetRGB) return null;

  let closestToken = null;
  let closestDistance = Infinity;

  for (const [name, value] of Object.entries(tokens.colors)) {
    if (typeof value !== 'string') continue;

    const tokenRGB = hexToRGB(value);
    if (!tokenRGB) continue;

    const distance = colorDistance(targetRGB, tokenRGB);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestToken = { name, value, distance };
    }
  }

  // Only return if reasonably close (distance < 50)
  if (closestToken && closestToken.distance < 50) {
    return closestToken;
  }

  return null;
}

/**
 * Find closest spacing token
 */
export function findClosestSpacingToken(value, tokens) {
  if (!tokens.spacing || Object.keys(tokens.spacing).length === 0) {
    return null;
  }

  const numValue = parseFloat(value);
  if (isNaN(numValue)) return null;

  let closestToken = null;
  let closestDiff = Infinity;

  for (const [name, tokenValue] of Object.entries(tokens.spacing)) {
    const tokenNum = parseFloat(tokenValue);
    if (isNaN(tokenNum)) continue;

    const diff = Math.abs(numValue - tokenNum);

    if (diff < closestDiff) {
      closestDiff = diff;
      closestToken = { name, value: tokenValue, diff };
    }
  }

  // Only return if very close (diff < 2px)
  if (closestToken && closestToken.diff < 2) {
    return closestToken;
  }

  return null;
}

/**
 * Convert hex color to RGB
 */
function hexToRGB(hex) {
  if (!hex || typeof hex !== 'string') return null;

  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) {
    // Try 3-digit hex
    const shortMatch = hex.match(/^#?([a-f\d])([a-f\d])([a-f\d])$/i);
    if (shortMatch) {
      return {
        r: parseInt(shortMatch[1] + shortMatch[1], 16),
        g: parseInt(shortMatch[2] + shortMatch[2], 16),
        b: parseInt(shortMatch[3] + shortMatch[3], 16)
      };
    }
    return null;
  }

  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16)
  };
}

/**
 * Calculate Euclidean distance between two colors in RGB space
 */
function colorDistance(rgb1, rgb2) {
  return Math.sqrt(
    Math.pow(rgb1.r - rgb2.r, 2) +
    Math.pow(rgb1.g - rgb2.g, 2) +
    Math.pow(rgb1.b - rgb2.b, 2)
  );
}

/**
 * Generate Tailwind class suggestion from token
 */
export function tokenToTailwindClass(tokenName, category) {
  const cleanName = tokenName.replace(/[-_]/g, '-').toLowerCase();

  switch (category) {
    case 'colors':
      return `bg-${cleanName}`;
    case 'spacing':
      return `p-${cleanName}`;
    case 'borderRadius':
      return `rounded-${cleanName}`;
    default:
      return tokenName;
  }
}

export default {
  extractDesignTokens,
  findClosestColorToken,
  findClosestSpacingToken,
  tokenToTailwindClass
};
