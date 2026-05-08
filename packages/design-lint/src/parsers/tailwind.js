/**
 * Tailwind CSS Config Parser
 *
 * Extracts design tokens from tailwind.config.js files
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

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
 * Parse config content using regex (avoids eval)
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

  // Extract theme.extend or theme sections
  const themeMatch = content.match(/theme\s*:\s*{([\s\S]*?)}\s*(?:,|\})/);
  if (!themeMatch) return tokens;

  const themeContent = themeMatch[1];

  // Parse colors
  tokens.colors = extractNestedObject(themeContent, 'colors');

  // Parse spacing
  tokens.spacing = extractNestedObject(themeContent, 'spacing');

  // Parse font family
  tokens.typography.fontFamily = extractNestedObject(themeContent, 'fontFamily');

  // Parse font size
  tokens.typography.fontSize = extractNestedObject(themeContent, 'fontSize');

  // Parse font weight
  tokens.typography.fontWeight = extractNestedObject(themeContent, 'fontWeight');

  // Parse border radius
  tokens.borderRadius = extractNestedObject(themeContent, 'borderRadius');

  // Parse box shadow
  tokens.shadows = extractNestedObject(themeContent, 'boxShadow');

  return tokens;
}

/**
 * Extract nested object from config content
 */
function extractNestedObject(content, key) {
  const result = {};

  // Find the key's object
  const regex = new RegExp(`${key}\\s*:\\s*{([\\s\\S]*?)}(?=\\s*[,}])`, 'g');
  const match = regex.exec(content);

  if (!match) return result;

  const objectContent = match[1];

  // Parse key-value pairs
  const pairRegex = /['"]?([a-zA-Z0-9_-]+)['"]?\s*:\s*(?:['"]([^'"]+)['"]|(\d+(?:\.\d+)?(?:px|rem|em|%)?)|({[^}]*})|(\[[^\]]*\]))/g;

  let pairMatch;
  while ((pairMatch = pairRegex.exec(objectContent)) !== null) {
    const name = pairMatch[1];
    const value = pairMatch[2] || pairMatch[3] || pairMatch[4] || pairMatch[5];

    if (value && !value.startsWith('{')) {
      // Handle array values
      if (value.startsWith('[')) {
        result[name] = parseArrayValue(value);
      } else {
        result[name] = value;
      }
    }
  }

  return result;
}

/**
 * Parse array value string
 */
function parseArrayValue(str) {
  const items = [];
  const itemRegex = /['"]([^'"]+)['"]/g;

  let match;
  while ((match = itemRegex.exec(str)) !== null) {
    items.push(match[1]);
  }

  return items.length === 1 ? items[0] : items;
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
