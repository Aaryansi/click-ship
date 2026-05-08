/**
 * Figma Tokens Parser
 *
 * Parses exports from Figma Tokens plugin
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Parse Figma tokens export file
 */
export function parseFigmaTokens(filePath) {
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
    source: filePath
  };

  if (!existsSync(filePath)) {
    return tokens;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    return parseFigmaFormat(data, tokens);
  } catch (error) {
    console.warn(`Warning: Could not parse ${filePath}: ${error.message}`);
    return tokens;
  }
}

function parseFigmaFormat(data, tokens) {
  const sets = data.$themes ? Object.keys(data).filter(k => k !== '$themes' && k !== '$metadata') : [null];

  for (const setName of sets) {
    const tokenSet = setName ? data[setName] : data;
    parseTokenSet(tokenSet, tokens, '');
  }

  return tokens;
}

function parseTokenSet(set, tokens, prefix) {
  if (!set || typeof set !== 'object') return;

  for (const [key, value] of Object.entries(set)) {
    if (key.startsWith('$')) continue;

    const path = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object') {
      if ('value' in value) {
        categorizeToken(path, value, tokens);
      } else {
        parseTokenSet(value, tokens, path);
      }
    }
  }
}

function categorizeToken(name, token, tokens) {
  const value = token.value;
  const type = token.type || inferType(name, value);

  switch (type) {
    case 'color':
      tokens.colors[name] = value;
      break;
    case 'spacing':
    case 'dimension':
    case 'sizing':
      tokens.spacing[name] = value;
      break;
    case 'fontFamilies':
    case 'fontFamily':
      tokens.typography.fontFamily[name] = value;
      break;
    case 'fontSizes':
    case 'fontSize':
      tokens.typography.fontSize[name] = value;
      break;
    case 'fontWeights':
    case 'fontWeight':
      tokens.typography.fontWeight[name] = value;
      break;
    case 'lineHeights':
    case 'lineHeight':
      tokens.typography.lineHeight[name] = value;
      break;
    case 'borderRadius':
      tokens.borderRadius[name] = value;
      break;
    case 'boxShadow':
      tokens.shadows[name] = formatShadow(value);
      break;
  }
}

function inferType(name, value) {
  const lowerName = name.toLowerCase();

  if (lowerName.includes('color') || lowerName.includes('fill')) return 'color';
  if (lowerName.includes('spacing') || lowerName.includes('space')) return 'spacing';
  if (lowerName.includes('font-family')) return 'fontFamily';
  if (lowerName.includes('font-size')) return 'fontSize';
  if (lowerName.includes('radius')) return 'borderRadius';
  if (lowerName.includes('shadow')) return 'boxShadow';

  if (typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value)) return 'color';

  return null;
}

function formatShadow(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(formatSingleShadow).join(', ');
  return formatSingleShadow(value);
}

function formatSingleShadow(shadow) {
  if (typeof shadow === 'string') return shadow;
  const { x = 0, y = 0, blur = 0, spread = 0, color = '#000000' } = shadow;
  return `${x}px ${y}px ${blur}px ${spread}px ${color}`;
}

export function findFigmaTokensFile(rootDir) {
  const possiblePaths = [
    'figma-tokens.json',
    'tokens/figma.json',
    '.figma/tokens.json'
  ];

  for (const path of possiblePaths) {
    const fullPath = join(rootDir, path);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

export default {
  parseFigmaTokens,
  findFigmaTokensFile
};
