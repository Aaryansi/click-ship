import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format as formatHtml } from '../../src/reporters/html.js';
import { format } from '../../src/reporters/index.js';

const violation = (over = {}) => ({
  rule: 'color-tokens', severity: 'error',
  message: "Hardcoded color '#ff0000' should use a design token",
  file: 'src/Button.tsx', line: 6, column: 8, value: '#ff0000',
  ...over
});

test('is a complete standalone document', () => {
  const html = formatHtml([violation()], { files: ['src/Button.tsx'] });

  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<\/html>\s*$/);
  assert.match(html, /<title>/);
});

test('pulls in nothing from the network', () => {
  const html = formatHtml([violation()], { files: ['src/Button.tsx'] });

  // a report that only renders with connectivity is useless as an attachment
  assert.doesNotMatch(html, /src="https?:|href="https?:|@import|fetch\(/);
  assert.doesNotMatch(html, /<script/i, 'no script at all, so it stays safe to open');
});

test('counts clean files against everything scanned', () => {
  const html = formatHtml([violation({ file: 'src/A.tsx' })], {
    files: ['src/A.tsx', 'src/B.tsx', 'src/C.tsx', 'src/D.tsx']
  });

  assert.match(html, /75%/, 'three of four files are clean');
});

test('a project with no violations reads as fully clean', () => {
  const html = formatHtml([], { files: ['src/A.tsx', 'src/B.tsx'] });

  assert.match(html, /100%/);
  assert.match(html, /Every scanned file is clean/);
});

test('a run that scanned nothing does not divide by zero', () => {
  const html = formatHtml([], { files: [] });

  assert.match(html, /100%/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test('breaks violations down by rule and by file', () => {
  const html = formatHtml(
    [
      violation({ file: 'src/A.tsx' }),
      violation({ file: 'src/A.tsx' }),
      violation({ rule: 'spacing-scale', severity: 'warn', file: 'src/B.tsx' })
    ],
    { files: ['src/A.tsx', 'src/B.tsx'] }
  );

  assert.match(html, /color-tokens/);
  assert.match(html, /spacing-scale/);
  assert.match(html, /src\/A\.tsx/);
});

test('escapes anything that came out of the source', () => {
  const html = formatHtml(
    [violation({ file: '<img src=x onerror=alert(1)>.tsx', value: '"><script>alert(1)</script>' })],
    { files: ['x.tsx'], projectName: '</title><script>bad()</script>' }
  );

  // file paths, values and the project name all originate outside this module
  assert.doesNotMatch(html, /<script>alert|<script>bad/, 'no injected script');
  assert.doesNotMatch(html, /<img src=x onerror/, 'no injected element');
  assert.match(html, /&lt;script&gt;/, 'the text is still shown, escaped');
});

test('shows baseline movement when there is a baseline', () => {
  const html = formatHtml([violation()], {
    files: ['src/Button.tsx'],
    baseline: { known: [violation(), violation()], added: [violation()], fixed: 4 }
  });

  assert.match(html, /new since baseline/);
  assert.match(html, /fixed since baseline/);
});

test('says so plainly when there is no baseline', () => {
  const html = formatHtml([violation()], { files: ['src/Button.tsx'] });

  assert.match(html, /No baseline recorded/);
  assert.doesNotMatch(html, /new since baseline/);
});

test('reports drift with both values', () => {
  const html = formatHtml([], {
    files: [],
    drift: {
      available: true, compared: 5,
      drifted: [{
        category: 'colors', codeName: 'primary', codeValue: '#3b82f6',
        figmaName: 'global.color-primary', figmaValue: '#2563eb',
        detail: 'ΔE 0.0823, visible', usages: 7
      }]
    }
  });

  assert.match(html, /#3b82f6/);
  assert.match(html, /#2563eb/);
  assert.match(html, /7 usages/);
});

test('only paints a swatch for something that is actually a colour', () => {
  const html = formatHtml([], {
    files: [],
    drift: {
      available: true, compared: 1,
      drifted: [{
        category: 'spacing', codeName: 'md', codeValue: '16px',
        figmaName: 'global.space-md', figmaValue: '20px', detail: '16px vs 20px', usages: 2
      }]
    }
  });

  // a swatch takes its value into a style attribute, so it is gated on hex
  assert.doesNotMatch(html, /swatch" style="background:16px/);
  assert.match(html, /16px/);
});

test('distinguishes agreement from having nothing to compare', () => {
  const nothing = formatHtml([], { files: [], drift: null });
  assert.match(nothing, /No Figma export found/);

  const agreed = formatHtml([], { files: [], drift: { available: true, compared: 9, drifted: [] } });
  assert.match(agreed, /agree on all 9/);
});

test('is reachable through the reporter registry', () => {
  const html = format([violation()], 'html', { files: ['src/Button.tsx'] });

  assert.match(html, /^<!doctype html>/i);
});
