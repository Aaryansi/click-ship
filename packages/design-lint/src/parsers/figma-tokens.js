/**
 * Figma token exports.
 *
 * Three formats reach this file, and a project only ever has one of them, so the shape
 * is detected rather than configured. Asking someone to declare which exporter they
 * used is a setup step that earns nothing.
 *
 *   Tokens Studio     { global: { "color-primary": { value, type } } }
 *   W3C DTCG          { color: { primary: { $value, $type } } }
 *   Figma variables   { variables: [ { name, resolvedType, valuesByMode } ] }
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function emptyTokens(source) {
  return {
    colors: {},
    spacing: {},
    typography: { fontFamily: {}, fontSize: {}, fontWeight: {}, lineHeight: {} },
    borderRadius: {},
    shadows: {},
    source
  };
}

export function parseFigmaTokens(filePath) {
  const tokens = emptyTokens(filePath);
  if (!existsSync(filePath)) return tokens;

  let data;
  try {
    data = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (error) {
    // loud, because a silently ignored export looks exactly like "no drift"
    console.warn(`Warning: could not parse ${filePath}: ${error.message}`);
    return tokens;
  }

  switch (detectFormat(data)) {
    case 'figma-variables': return parseFigmaVariables(data, tokens);
    case 'dtcg': return parseDTCG(data, tokens);
    default: return parseTokensStudio(data, tokens);
  }
}

/**
 * Figma's own export is unmistakable: variables carry a `resolvedType`. DTCG is
 * identified by `$value` appearing anywhere, which is the one thing the spec
 * guarantees and Tokens Studio never emits.
 */
export function detectFormat(data) {
  if (!data || typeof data !== 'object') return 'tokens-studio';

  const variables = data.variables ?? data.meta?.variables;
  if (variables && typeof variables === 'object') {
    const first = Array.isArray(variables) ? variables[0] : Object.values(variables)[0];
    if (first && typeof first === 'object' && 'resolvedType' in first) return 'figma-variables';
  }

  return hasDollarValue(data) ? 'dtcg' : 'tokens-studio';
}

function hasDollarValue(node, depth = 0) {
  // real token files nest a few levels; walking forever on a huge export is wasted work
  if (depth > 6 || !node || typeof node !== 'object') return false;
  if ('$value' in node) return true;

  return Object.values(node).some(child => hasDollarValue(child, depth + 1));
}

// ============================================
// Figma variables
// ============================================

function parseFigmaVariables(data, tokens) {
  const variables = data.variables ?? data.meta?.variables ?? {};
  const list = Array.isArray(variables) ? variables : Object.values(variables);
  const collections = data.variableCollections ?? data.meta?.variableCollections ?? {};

  for (const variable of list) {
    if (!variable?.name || !variable.valuesByMode) continue;

    const value = pickModeValue(variable, collections);
    if (value === undefined) continue;

    // an alias points at another variable and cannot be resolved to a value here
    if (value && typeof value === 'object' && value.type === 'VARIABLE_ALIAS') continue;

    const resolved = resolveVariableValue(value, variable.resolvedType);
    if (resolved === null) continue;

    categorize(variable.name, resolved, typeFromResolved(variable.resolvedType, variable.name), tokens);
  }

  return tokens;
}

/**
 * A variable holds one value per mode: light, dark, brand-a, and so on. The collection's
 * declared default is the honest choice; falling back to the first key would silently
 * compare the code against whichever mode happened to serialize first.
 */
function pickModeValue(variable, collections) {
  const modes = variable.valuesByMode ?? {};
  const collection = collections[variable.variableCollectionId];
  const defaultMode = collection?.defaultModeId;

  if (defaultMode && defaultMode in modes) return modes[defaultMode];
  return Object.values(modes)[0];
}

function resolveVariableValue(value, resolvedType) {
  if (resolvedType === 'COLOR') {
    return value && typeof value === 'object' ? rgbaToHex(value) : null;
  }
  if (resolvedType === 'FLOAT') {
    return typeof value === 'number' ? `${value}px` : null;
  }
  if (resolvedType === 'STRING') {
    return typeof value === 'string' ? value : null;
  }
  // BOOLEAN carries nothing a design token comparison can use
  return null;
}

/**
 * Figma stores colour channels as 0-1 floats. Alpha is kept, because drift comparison
 * treats opacity as part of the token: a scrim quietly going from 50% to 25% is exactly
 * the kind of change this is meant to catch.
 */
function rgbaToHex({ r, g, b, a }) {
  if (typeof r !== 'number' || typeof g !== 'number' || typeof b !== 'number') return null;

  const channel = (value) => Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, '0');

  const base = `#${channel(r)}${channel(g)}${channel(b)}`;
  return a === undefined || a >= 1 ? base : `${base}${channel(a)}`;
}

function typeFromResolved(resolvedType, name) {
  if (resolvedType === 'COLOR') return 'color';
  return inferType(name, null);
}

// ============================================
// W3C design tokens
// ============================================

function parseDTCG(data, tokens, prefix = '', inheritedType = null) {
  for (const [key, node] of Object.entries(data)) {
    // $description, $extensions and friends are metadata, not tokens
    if (key.startsWith('$') || !node || typeof node !== 'object') continue;

    const path = prefix ? `${prefix}.${key}` : key;

    if ('$value' in node) {
      // the spec lets a group declare $type once for everything beneath it
      const type = node.$type ?? inheritedType ?? inferType(path, node.$value);
      categorize(path, node.$value, type, tokens);
    } else {
      parseDTCG(node, tokens, path, node.$type ?? inheritedType);
    }
  }

  return tokens;
}

// ============================================
// Tokens Studio
// ============================================

function parseTokensStudio(data, tokens) {
  const sets = data.$themes
    ? Object.keys(data).filter(key => key !== '$themes' && key !== '$metadata')
    : [null];

  for (const setName of sets) {
    walkTokensStudio(setName ? data[setName] : data, tokens, '');
  }

  return tokens;
}

function walkTokensStudio(set, tokens, prefix) {
  if (!set || typeof set !== 'object') return;

  for (const [key, value] of Object.entries(set)) {
    if (key.startsWith('$')) continue;
    if (!value || typeof value !== 'object') continue;

    const path = prefix ? `${prefix}.${key}` : key;

    if ('value' in value) categorize(path, value.value, value.type ?? inferType(path, value.value), tokens);
    else walkTokensStudio(value, tokens, path);
  }
}

// ============================================
// Shared
// ============================================

function categorize(name, value, type, tokens) {
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
      tokens.typography.fontFamily[name] = Array.isArray(value) ? value.join(', ') : value;
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
    case 'shadow':
      tokens.shadows[name] = formatShadow(value);
      break;
    default:
      break;
  }
}

function inferType(name, value) {
  const lower = String(name).toLowerCase();

  if (lower.includes('color') || lower.includes('colour') || lower.includes('fill')) return 'color';
  if (lower.includes('radius') || lower.includes('rounded')) return 'borderRadius';
  if (lower.includes('font-size') || lower.includes('fontsize')) return 'fontSize';
  if (lower.includes('font-family') || lower.includes('fontfamily')) return 'fontFamily';
  if (lower.includes('shadow') || lower.includes('elevation')) return 'boxShadow';
  if (lower.includes('spacing') || lower.includes('space') || lower.includes('size')) return 'spacing';

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
  if (!shadow || typeof shadow !== 'object') return '';

  const { x = 0, y = 0, blur = 0, spread = 0, color = '#000000' } = shadow;
  return `${x}px ${y}px ${blur}px ${spread}px ${color}`;
}

export function findFigmaTokensFile(rootDir) {
  // deliberately does not include tokens.json or design-tokens.json: those are the
  // code side's files, and comparing a source against itself always agrees
  const candidates = [
    'figma-tokens.json',
    'figma-variables.json',
    'tokens/figma.json',
    'tokens/figma-variables.json',
    '.figma/tokens.json',
    '.figma/variables.json'
  ];

  for (const candidate of candidates) {
    const fullPath = join(rootDir, candidate);
    if (existsSync(fullPath)) return fullPath;
  }

  return null;
}

export default { parseFigmaTokens, findFigmaTokensFile, detectFormat };
