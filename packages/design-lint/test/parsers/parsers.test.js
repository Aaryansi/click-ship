import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseTailwindConfig, findTailwindConfig, toPixels } from '../../src/parsers/tailwind.js';
import { parseCSSVariables } from '../../src/parsers/css-vars.js';
import { parseTokensJSON } from '../../src/parsers/tokens-json.js';
import { parseFigmaTokens, findFigmaTokensFile } from '../../src/parsers/figma-tokens.js';
import { parseAllTokens, normalizeColor, createSpacingScale } from '../../src/parsers/index.js';

// takes the test context so cleanup runs on the failure path too. without it the first
// failing assertion throws past the rmSync and leaves a dl-parse-* tree behind, which is
// exactly when tests are being re-run in a loop
function scratch(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'dl-parse-'));
  for (const [name, contents] of Object.entries(files)) {
    const full = join(dir, name);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, contents);
  }
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const TAILWIND_CONFIG = `module.exports = {
  theme: {
    extend: {
      colors: {
        brand: '#6366f1'
      },
      spacing: {
        tight: '3px'
      }
    }
  }
};`;

test('tailwind: config is discovered on disk', (t) => {
  const dir = scratch(t, { 'tailwind.config.js': TAILWIND_CONFIG });

  assert.equal(findTailwindConfig(dir), join(dir, 'tailwind.config.js'));
});

test('tailwind: falls back to the built-in palette so rules always have something', (t) => {
  const dir = scratch(t, { 'tailwind.config.js': TAILWIND_CONFIG });

  const tokens = parseTailwindConfig(join(dir, 'tailwind.config.js'));
  // color-tokens bails out entirely on an empty palette, so this fallback is what
  // keeps the rule running at all today
  assert.ok(Object.keys(tokens.colors).length > 0);
  assert.equal(tokens.colors['blue-500'], '#3b82f6', 'stock tailwind blue');
});

test('tailwind: reads custom colours and spacing from the config', (t) => {
  const dir = scratch(t, { 'tailwind.config.js': TAILWIND_CONFIG });

  const tokens = parseTailwindConfig(join(dir, 'tailwind.config.js'));
  assert.equal(tokens.colors.brand, '#6366f1');
  assert.equal(tokens.spacing.tight, '3px');
});

test('tailwind: custom tokens sit alongside the stock palette', (t) => {
  const dir = scratch(t, { 'tailwind.config.js': TAILWIND_CONFIG });

  const tokens = parseTailwindConfig(join(dir, 'tailwind.config.js'));
  assert.equal(tokens.colors.brand, '#6366f1', 'the project value');
  assert.equal(tokens.colors['blue-500'], '#3b82f6', 'and the stock one it did not override');
});

test('tailwind: flattens nested shades the way class names read', (t) => {
  const dir = scratch(t, {
    'tailwind.config.js': `module.exports = {
  theme: { extend: { colors: { brand: { 500: '#6366f1', DEFAULT: '#4f46e5' } } } }
};`
  });

  const tokens = parseTailwindConfig(join(dir, 'tailwind.config.js'));
  assert.equal(tokens.colors['brand-500'], '#6366f1');
  assert.equal(tokens.colors.brand, '#4f46e5', 'DEFAULT collapses onto the parent name');
});

test('tailwind: theme.extend layers over the base theme rather than replacing it', (t) => {
  const dir = scratch(t, {
    'tailwind.config.js': `module.exports = {
  theme: {
    colors: { base: '#000001' },
    extend: { colors: { extended: '#000002' } }
  }
};`
  });

  const tokens = parseTailwindConfig(join(dir, 'tailwind.config.js'));
  assert.equal(tokens.colors.base, '#000001');
  assert.equal(tokens.colors.extended, '#000002');
});

// the shapes real configs are written in. the old regex handled none of them.
for (const [label, source, expected] of [
  ['esm export default', `export default { theme: { extend: { colors: { c: '#111111' } } } };`, '#111111'],
  ['a named variable', `const config = { theme: { extend: { colors: { c: '#222222' } } } };\nmodule.exports = config;`, '#222222'],
  ['a defineConfig wrapper', `import { defineConfig } from 'tailwindcss';\nexport default defineConfig({ theme: { extend: { colors: { c: '#333333' } } } });`, '#333333'],
  ['typescript satisfies', `export default { theme: { extend: { colors: { c: '#444444' } } } } satisfies Config;`, '#444444']
]) {
  test(`tailwind: reads a config written with ${label}`, (t) => {
    const dir = scratch(t, { 'tailwind.config.js': source });

    const tokens = parseTailwindConfig(join(dir, 'tailwind.config.js'));
    assert.equal(tokens.colors.c, expected);
  });
}

test('tailwind: takes the size out of a fontSize tuple', (t) => {
  const dir = scratch(t, {
    'tailwind.config.js': `module.exports = {
  theme: { extend: { fontSize: { tiny: ['0.8125rem', { lineHeight: '1rem' }] } } }
};`
  });

  const tokens = parseTailwindConfig(join(dir, 'tailwind.config.js'));
  assert.equal(tokens.typography.fontSize.tiny, '0.8125rem');
});

test('tailwind: joins a fontFamily stack into one value', (t) => {
  const dir = scratch(t, {
    'tailwind.config.js': `module.exports = {
  theme: { extend: { fontFamily: { sans: ['Inter', 'system-ui'] } } }
};`
  });

  const tokens = parseTailwindConfig(join(dir, 'tailwind.config.js'));
  assert.equal(tokens.typography.fontFamily.sans, 'Inter, system-ui');
});

test('tailwind: a config it cannot evaluate degrades instead of throwing', (t) => {
  const dir = scratch(t, {
    // requires, spreads and function calls cannot be resolved without running the file
    'tailwind.config.js': `const colors = require('tailwindcss/colors');
module.exports = {
  theme: { extend: { colors: { ...colors, known: '#555555' } } }
};`
  });

  const tokens = parseTailwindConfig(join(dir, 'tailwind.config.js'));
  assert.equal(tokens.colors.known, '#555555', 'the statically knowable entry is still read');
  assert.ok(Object.keys(tokens.colors).length > 1, 'and the stock palette remains as a floor');
});

test('tailwind: a syntactically broken config yields defaults, not a crash', (t) => {
  const dir = scratch(t, { 'tailwind.config.js': 'module.exports = { theme: { colors: {' });

  const tokens = parseTailwindConfig(join(dir, 'tailwind.config.js'));
  assert.ok(Object.keys(tokens.colors).length > 0);
});

test('tailwind: toPixels converts rem and passes px through', () => {
  assert.equal(toPixels('16px'), 16);
  assert.equal(toPixels('1rem'), 16);
  assert.equal(toPixels('not a size'), null);
});

test('tailwind: toPixels accepts a bare number', () => {
  // configs may write `spacing: { 1: 4 }`, and the AST parser hands those through as
  // real numbers. tailwind reads a unitless value as pixels.
  assert.equal(toPixels(24), 24);
  assert.equal(toPixels(0), 0);
  assert.equal(toPixels(NaN), null);
  assert.equal(toPixels(Infinity), null);
});

test('tailwind: numeric config values survive into the spacing scale', (t) => {
  const dir = scratch(t, {
    'tailwind.config.js': `module.exports = { theme: { extend: { spacing: { 1: 4, 2: 8 } } } };`
  });

  const tokens = parseTailwindConfig(join(dir, 'tailwind.config.js'));
  assert.equal(tokens.spacing['1'], 4);
  assert.equal(toPixels(tokens.spacing['1']), 4, 'and converts rather than being dropped');
});

test('css vars: sorts custom properties into the right buckets', (t) => {
  const dir = scratch(t, {
    'theme.css': `:root {
  --color-primary: #6366f1;
  --space-4: 16px;
  --radius-md: 6px;
}`
  });

  const tokens = parseCSSVariables(join(dir, 'theme.css'));

  // asserting the bucket, not just that the hex appears somewhere in the blob. a
  // colour filed under spacing would satisfy a substring match and break every rule
  assert.equal(tokens.colors['color-primary'], '#6366f1');
  assert.equal(tokens.spacing['space-4'], '16px');
  assert.equal(tokens.borderRadius['radius-md'], '6px');
});

test('tokens json: reads value-wrapped design tokens', (t) => {
  const dir = scratch(t, {
    'tokens.json': JSON.stringify({
      color: { primary: { value: '#6366f1', type: 'color' } },
      space: { md: { value: '16px', type: 'spacing' } }
    })
  });

  const tokens = parseTokensJSON(join(dir, 'tokens.json'));
  assert.equal(tokens.colors['color.primary'], '#6366f1', 'names are namespaced by their path');
  assert.equal(tokens.spacing['space.md'], '16px');
});

test('tokens json: understands the $value spelling too', (t) => {
  const dir = scratch(t, {
    'tokens.json': JSON.stringify({
      color: { primary: { $value: '#6366f1', $type: 'color' } }
    })
  });

  const tokens = parseTokensJSON(join(dir, 'tokens.json'));
  assert.equal(tokens.colors['color.primary'], '#6366f1');
});

test('figma: reads a tokens studio export and categorises by type', (t) => {
  const dir = scratch(t, {
    'figma-tokens.json': JSON.stringify({
      global: {
        'color-primary': { value: '#6366f1', type: 'color' },
        'space-md': { value: '16px', type: 'spacing' },
        'radius-md': { value: '6px', type: 'borderRadius' }
      }
    })
  });

  assert.equal(findFigmaTokensFile(dir), join(dir, 'figma-tokens.json'));

  const tokens = parseFigmaTokens(join(dir, 'figma-tokens.json'));
  assert.equal(tokens.colors['global.color-primary'], '#6366f1', 'set name prefixes the token');
  assert.equal(tokens.spacing['global.space-md'], '16px');
  assert.equal(tokens.borderRadius['global.radius-md'], '6px');
});

test('figma: infers a type when the export omits one', (t) => {
  const dir = scratch(t, {
    'figma-tokens.json': JSON.stringify({
      'color-accent': { value: '#ff0000' }
    })
  });

  const tokens = parseFigmaTokens(join(dir, 'figma-tokens.json'));
  assert.equal(tokens.colors['color-accent'], '#ff0000');
});

test('figma: a missing file yields empty tokens rather than throwing', () => {
  const tokens = parseFigmaTokens('/nowhere/figma-tokens.json');

  assert.deepEqual(tokens.colors, {});
});

test('autodetect: finds every source present in a project', async (t) => {
  const dir = scratch(t, {
    'tailwind.config.js': TAILWIND_CONFIG,
    'figma-tokens.json': JSON.stringify({
      global: { 'radius-md': { value: '6px', type: 'borderRadius' } }
    })
  });

  const tokens = await parseAllTokens(dir);
  const sources = tokens.sources.map(s => s.type);

  assert.ok(sources.includes('tailwind'), `expected tailwind in ${sources}`);
  assert.ok(sources.includes('figma'), `expected figma in ${sources}`);
  assert.equal(tokens.borderRadius['global.radius-md'], '6px');
});

test('autodetect: a project with no token sources still returns a usable shape', async (t) => {
  const dir = scratch(t, { 'readme.md': 'nothing here' });

  const tokens = await parseAllTokens(dir);

  assert.deepEqual(tokens.sources, []);
  assert.deepEqual(tokens.colors, {});
  assert.ok(tokens.typography, 'typography bucket should still exist');
});

test('normalizeColor folds shorthand hex and rgb to one form', () => {
  assert.equal(normalizeColor('#FFF'), '#ffffff');
  assert.equal(normalizeColor('#6366F1'), '#6366f1');
  assert.equal(normalizeColor('rgb(99, 102, 241)'), '#6366f1');
  assert.equal(normalizeColor('nonsense'), null);
});

test('createSpacingScale turns tokens into a sorted pixel scale', () => {
  const scale = createSpacingScale({ spacing: { a: '8px', b: '1rem', c: '4px' } });

  assert.deepEqual(scale, [4, 8, 16], 'sorted, deduped, converted to px');
});
