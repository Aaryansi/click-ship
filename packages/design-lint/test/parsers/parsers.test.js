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

// ---- regressions from the parser review ----

test('tailwind: an unresolvable size in a fontSize tuple is not mistaken for the value', (t) => {
  const dir = scratch(t, {
    'tailwind.config.js': `const SM = '0.875rem';
module.exports = { theme: { extend: { fontSize: { sm: [SM, '1.25rem'] } } } };`
  });

  const tokens = parseTailwindConfig(join(dir, 'tailwind.config.js'));

  // compacting the array would shift the line-height into index 0 and record 20px as
  // `sm`, so the typography rule would then flag the correct 14px as a violation
  assert.notEqual(tokens.typography.fontSize.sm, '1.25rem');
});

test('tailwind: extend deep-merges nested shades instead of replacing them', (t) => {
  const dir = scratch(t, {
    'tailwind.config.js': `module.exports = {
  theme: {
    colors: { brand: { 100: '#aaaaaa', 500: '#bbbbbb' } },
    extend: { colors: { brand: { 900: '#cccccc' } } }
  }
};`
  });

  const tokens = parseTailwindConfig(join(dir, 'tailwind.config.js'));

  assert.equal(tokens.colors['brand-100'], '#aaaaaa', 'base shades survive the extend');
  assert.equal(tokens.colors['brand-500'], '#bbbbbb');
  assert.equal(tokens.colors['brand-900'], '#cccccc');
});

test('tailwind: a non-object theme section does not spread into junk tokens', (t) => {
  const dir = scratch(t, { 'tailwind.config.js': `module.exports = { theme: { colors: 'abcdef' } };` });

  const tokens = parseTailwindConfig(join(dir, 'tailwind.config.js'));

  assert.equal(tokens.colors['0'], undefined, "'abcdef' must not become {0:'a',1:'b',...}");
  assert.equal(tokens.colors['1'], undefined);
});

test('tailwind: a reference cycle is refused rather than blowing the stack', (t) => {
  const dir = scratch(t, { 'tailwind.config.js': `const a = b; const b = a; module.exports = a;` });

  // valid syntax, so the parser reaches identifier resolution and used to recurse forever
  const tokens = parseTailwindConfig(join(dir, 'tailwind.config.js'));
  assert.ok(Object.keys(tokens.colors).length > 0, 'falls back rather than throwing');
});

test('tailwind: reads a typescript `export =` config', (t) => {
  const dir = scratch(t, {
    'tailwind.config.js': `const config = { theme: { extend: { colors: { ts: '#123456' } } } };
export = config;`
  });

  const tokens = parseTailwindConfig(join(dir, 'tailwind.config.js'));
  assert.equal(tokens.colors.ts, '#123456');
});

test('tailwind: a font stack that evaluates to nothing is skipped, not exported empty', (t) => {
  const dir = scratch(t, {
    'tailwind.config.js': `import defaultTheme from 'tailwindcss/defaultTheme';
module.exports = { theme: { extend: { fontFamily: { sans: [...defaultTheme.fontFamily.sans] } } } };`
  });

  const tokens = parseTailwindConfig(join(dir, 'tailwind.config.js'));
  assert.equal(tokens.typography.fontFamily.sans, undefined,
    'a token must not claim a value it does not have');
});

// ---- token export formats ----

test('figma: detects which exporter produced the file', async () => {
  const { detectFormat } = await import('../../src/parsers/figma-tokens.js');

  assert.equal(detectFormat({ global: { a: { value: '#fff', type: 'color' } } }), 'tokens-studio');
  assert.equal(detectFormat({ color: { a: { $value: '#fff' } } }), 'dtcg');
  assert.equal(detectFormat({ variables: [{ name: 'a', resolvedType: 'COLOR', valuesByMode: {} }] }), 'figma-variables');
  // asking someone to declare their exporter is a setup step that earns nothing
  assert.equal(detectFormat(null), 'tokens-studio');
});

test('figma: reads a W3C design tokens export', (t) => {
  const dir = scratch(t, {
    'figma-tokens.json': JSON.stringify({
      color: { primary: { $value: '#2563eb', $type: 'color' } },
      space: { md: { $value: '16px', $type: 'dimension' } }
    })
  });

  const tokens = parseFigmaTokens(join(dir, 'figma-tokens.json'));
  assert.equal(tokens.colors['color.primary'], '#2563eb');
  assert.equal(tokens.spacing['space.md'], '16px');
});

test('figma: honours a DTCG group-level $type', (t) => {
  // the spec lets a group declare $type once instead of repeating it per token
  const dir = scratch(t, {
    'figma-tokens.json': JSON.stringify({
      color: { $type: 'color', primary: { $value: '#2563eb' }, error: { $value: '#dc2626' } }
    })
  });

  const tokens = parseFigmaTokens(join(dir, 'figma-tokens.json'));
  assert.equal(tokens.colors['color.primary'], '#2563eb');
  assert.equal(tokens.colors['color.error'], '#dc2626');
});

test('figma: DTCG metadata keys are not treated as tokens', (t) => {
  const dir = scratch(t, {
    'figma-tokens.json': JSON.stringify({
      $description: 'our palette',
      color: { $description: 'brand', primary: { $value: '#2563eb', $type: 'color' } }
    })
  });

  const tokens = parseFigmaTokens(join(dir, 'figma-tokens.json'));
  assert.deepEqual(Object.keys(tokens.colors), ['color.primary']);
});

test('figma: converts variable colours from 0-1 floats', (t) => {
  const dir = scratch(t, {
    'figma-variables.json': JSON.stringify({
      variableCollections: { 'C:1': { defaultModeId: 'm1' } },
      variables: [{
        name: 'color/primary', resolvedType: 'COLOR', variableCollectionId: 'C:1',
        valuesByMode: { m1: { r: 0.145098, g: 0.3882353, b: 0.9215686, a: 1 } }
      }]
    })
  });

  const tokens = parseFigmaTokens(join(dir, 'figma-variables.json'));
  assert.equal(tokens.colors['color/primary'], '#2563eb');
});

test('figma: keeps variable alpha, because opacity is part of the token', (t) => {
  const dir = scratch(t, {
    'figma-variables.json': JSON.stringify({
      variables: [{
        name: 'color/scrim', resolvedType: 'COLOR',
        valuesByMode: { m1: { r: 0, g: 0, b: 0, a: 0.25 } }
      }]
    })
  });

  const tokens = parseFigmaTokens(join(dir, 'figma-variables.json'));
  assert.equal(tokens.colors['color/scrim'], '#00000040', 'a scrim silently going opaque is the bug this prevents');
});

test('figma: takes the collection default mode, not whichever serialized first', (t) => {
  const dir = scratch(t, {
    'figma-variables.json': JSON.stringify({
      variableCollections: { 'C:1': { defaultModeId: 'light' } },
      variables: [{
        name: 'color/bg', resolvedType: 'COLOR', variableCollectionId: 'C:1',
        // dark is first in the object; light is the declared default
        valuesByMode: { dark: { r: 0, g: 0, b: 0, a: 1 }, light: { r: 1, g: 1, b: 1, a: 1 } }
      }]
    })
  });

  const tokens = parseFigmaTokens(join(dir, 'figma-variables.json'));
  assert.equal(tokens.colors['color/bg'], '#ffffff', 'comparing against the wrong mode is worse than not comparing');
});

test('figma: a variable alias is skipped rather than compared', (t) => {
  const dir = scratch(t, {
    'figma-variables.json': JSON.stringify({
      variables: [{
        name: 'color/brand', resolvedType: 'COLOR',
        valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'VariableID:9:9' } }
      }]
    })
  });

  const tokens = parseFigmaTokens(join(dir, 'figma-variables.json'));
  assert.deepEqual(tokens.colors, {}, 'an alias is a pointer, not a value');
});

test('figma: FLOAT variables become pixel dimensions', (t) => {
  const dir = scratch(t, {
    'figma-variables.json': JSON.stringify({
      variables: [
        { name: 'space/md', resolvedType: 'FLOAT', valuesByMode: { m1: 16 } },
        { name: 'is/enabled', resolvedType: 'BOOLEAN', valuesByMode: { m1: true } }
      ]
    })
  });

  const tokens = parseFigmaTokens(join(dir, 'figma-variables.json'));
  assert.equal(tokens.spacing['space/md'], '16px');
  assert.equal(Object.keys(tokens.spacing).length, 1, 'a boolean is not a design token');
});

test('figma: discovery never picks up the code side by mistake', async (t) => {
  const { findFigmaTokensFile } = await import('../../src/parsers/figma-tokens.js');
  // tokens.json belongs to the code side; reading it as the figma side would compare a
  // source against itself and always agree
  const dir = scratch(t, { 'tokens.json': '{}', 'design-tokens.json': '{}' });

  assert.equal(findFigmaTokensFile(dir), null);
});

test('figma: finds a variables export under any of its usual names', (t) => {
  const dir = scratch(t, { 'tokens/figma-variables.json': '{}' });

  assert.equal(findFigmaTokensFile(dir), join(dir, 'tokens/figma-variables.json'));
});
