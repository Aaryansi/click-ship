import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPRComment, formatDriftSection } from '../../src/reporters/github.js';

const drift = (over = {}) => ({
  available: true,
  compared: 5,
  drifted: [{
    category: 'colors', codeName: 'primary', codeValue: '#3b82f6',
    figmaName: 'global.color-primary', figmaValue: '#2563eb',
    detail: 'ΔE 0.0823, visible', visible: true, usages: 7
  }],
  ...over
});

test('renders drifted tokens as a table with both values', () => {
  const md = formatDriftSection(drift());

  assert.match(md, /1 token drifted from Figma/);
  assert.match(md, /`primary`/);
  assert.match(md, /`#3b82f6`/);
  assert.match(md, /`#2563eb`/);
  assert.match(md, /7 usages/);
});

test('says neither side is authoritative', () => {
  // the tool cannot know which one is wrong, and implying otherwise would send people
  // to change the wrong file
  assert.match(formatDriftSection(drift()), /Neither side is authoritative/);
});

test('contributes nothing when there is no drift', () => {
  // an empty section would append a stray divider to every clean PR comment
  assert.equal(formatDriftSection(drift({ drifted: [] })), '');
  assert.equal(formatDriftSection({ available: false, drifted: [] }), '');
  assert.equal(formatDriftSection(null), '');
  assert.equal(formatDriftSection(undefined), '');
});

test('marks a token nothing references', () => {
  const md = formatDriftSection(drift({
    drifted: [{ codeName: 'ghost', codeValue: '#111111', figmaValue: '#222222', detail: null, usages: 0 }]
  }));

  assert.match(md, /unused/);
});

test('appends cleanly to a violation comment', () => {
  const comment = formatPRComment([], { repo: 'a/b', sha: 'abc' }) + formatDriftSection(drift());

  // the two halves answer different questions and must both survive
  assert.match(comment, /No design system violations found/);
  assert.match(comment, /drifted from Figma/);
});
