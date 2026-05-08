/**
 * Tokens JSON Parser - Style Dictionary format
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function parseTokensJSON(filePath) {
  const tokens = {
    colors: {},
    spacing: {},
    typography: { fontFamily: {}, fontSize: {}, fontWeight: {}, lineHeight: {} },
    borderRadius: {},
    shadows: {},
    source: filePath
  };

  if (!existsSync(filePath)) return tokens;

  try {
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    return flattenTokens(data, tokens);
  } catch (error) {
    console.warn(`Warning: Could not parse ${filePath}: ${error.message}`);
    return tokens;
  }
}

function flattenTokens(data, tokens, prefix = '') {
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('$')) continue;
    const path = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object') {
      if ('value' in value || '$value' in value) {
        const tokenValue = value.value || value.$value;
        const tokenType = value.type || value.$type || inferTokenType(path, tokenValue);
        categorizeToken(path, tokenValue, tokenType, tokens);
      } else {
        flattenTokens(value, tokens, path);
      }
    }
  }
  return tokens;
}

function categorizeToken(name, value, type, tokens) {
  switch (type) {
    case 'color': tokens.colors[name] = value; break;
    case 'dimension': case 'spacing': case 'size': tokens.spacing[name] = value; break;
    case 'fontFamily': case 'fontFamilies': tokens.typography.fontFamily[name] = value; break;
    case 'fontSize': case 'fontSizes': tokens.typography.fontSize[name] = value; break;
    case 'fontWeight': case 'fontWeights': tokens.typography.fontWeight[name] = value; break;
    case 'lineHeight': case 'lineHeights': tokens.typography.lineHeight[name] = value; break;
    case 'borderRadius': tokens.borderRadius[name] = value; break;
    case 'shadow': case 'boxShadow': tokens.shadows[name] = formatShadow(value); break;
    default: inferAndCategorize(name, value, tokens);
  }
}

function inferTokenType(name, value) {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('color') || lowerName.includes('background')) return 'color';
  if (lowerName.includes('spacing') || lowerName.includes('space')) return 'spacing';
  if (lowerName.includes('font-size')) return 'fontSize';
  if (lowerName.includes('radius')) return 'borderRadius';
  if (typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value)) return 'color';
  return null;
}

function inferAndCategorize(name, value, tokens) {
  const type = inferTokenType(name, value);
  if (type) categorizeToken(name, value, type, tokens);
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

export function findTokensJSON(rootDir) {
  const paths = ['tokens.json', 'design-tokens.json', 'src/tokens.json', 'styles/tokens.json'];
  for (const path of paths) {
    const fullPath = join(rootDir, path);
    if (existsSync(fullPath)) return fullPath;
  }
  return null;
}

export default { parseTokensJSON, findTokensJSON };
