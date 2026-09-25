import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CONSOLE_AGENT_GALLERY_SORTS,
  createConsoleAgentGalleryModel,
} from '../src/console-agent-gallery.js';

const AGENTS = [
  { tokenId: '10', name: 'Zulu' },
  { tokenId: '2', name: 'alpha' },
  { tokenId: '30', name: 'Bravo' },
];

function ids(model) {
  return model.visible.map((agent) => agent.tokenId);
}

test('Looper gallery defaults to numeric token order and supports all explicit sort modes', () => {
  assert.deepEqual(ids(createConsoleAgentGalleryModel({ agents: AGENTS })), ['2', '10', '30']);
  assert.deepEqual(ids(createConsoleAgentGalleryModel({ agents: AGENTS, sort: 'token-desc' })), ['30', '10', '2']);
  assert.deepEqual(ids(createConsoleAgentGalleryModel({ agents: AGENTS, sort: 'name-asc' })), ['2', '30', '10']);
  assert.deepEqual(ids(createConsoleAgentGalleryModel({ agents: AGENTS, sort: 'name-desc' })), ['10', '30', '2']);
  assert.deepEqual(CONSOLE_AGENT_GALLERY_SORTS, ['token-asc', 'token-desc', 'name-asc', 'name-desc']);
});

test('Looper gallery searches names and token IDs without mutating the source roster', () => {
  const source = structuredClone(AGENTS);
  assert.deepEqual(ids(createConsoleAgentGalleryModel({ agents: source, query: 'ALP' })), ['2']);
  assert.deepEqual(ids(createConsoleAgentGalleryModel({ agents: source, query: '30' })), ['30']);
  assert.deepEqual(source, AGENTS);
});

test('Looper gallery distinguishes owned-empty from filtered-empty state', () => {
  assert.equal(createConsoleAgentGalleryModel({ agents: [] }).emptyKind, 'owned');
  const filtered = createConsoleAgentGalleryModel({ agents: AGENTS, query: 'missing' });
  assert.equal(filtered.emptyKind, 'filtered');
  assert.equal(filtered.total, 3);
  assert.deepEqual(filtered.visible, []);
});

test('Looper gallery keeps all 7,777 agents in deterministic document order', () => {
  const agents = Array.from({ length: 7_777 }, (_, index) => ({
    tokenId: String(index + 1),
    name: `Looper ${String(index + 1).padStart(4, '0')}`,
  }));
  const ascending = createConsoleAgentGalleryModel({ agents });
  const descending = createConsoleAgentGalleryModel({ agents, sort: 'token-desc' });
  const tailSearch = createConsoleAgentGalleryModel({ agents, query: '7777' });

  assert.equal(ascending.total, 7_777);
  assert.equal(ascending.visible.length, 7_777);
  assert.equal(ascending.visible[0].tokenId, '1');
  assert.equal(ascending.visible.at(-1).tokenId, '7777');
  assert.equal(descending.visible[0].tokenId, '7777');
  assert.equal(descending.visible.at(-1).tokenId, '1');
  assert.deepEqual(ids(tailSearch), ['7777']);
});

test('Looper gallery reuses the canonical Console token comparator', () => {
  const source = readFileSync(new URL('../src/console-agent-gallery.js', import.meta.url), 'utf8');
  assert.match(source, /import\s+\{\s*compareLooperTokenIds\s*\}\s+from\s+'\.\/console-looper-selection\.js'/);
  assert.doesNotMatch(source, /function\s+(?:compareTokenIds|safeTokenId)\s*\(/);
});

test('Looper gallery stylesheet locks scrolling, touch targets, and approved breakpoints', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.console-agent-gallery-grid\s*\{[\s\S]*max-height:\s*min\(70vh, 720px\);[\s\S]*overflow-y:\s*auto;/);
  assert.match(css, /min-height:\s*44px;/);
  assert.match(css, /@media \(max-width: 1119px\)/);
  assert.match(css, /@media \(max-width: 759px\)/);
  assert.match(css, /@media \(max-width: 479px\)/);
});
