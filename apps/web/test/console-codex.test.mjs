import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import { normalizeConsoleCodexState, renderConsoleCodexWorkspace } from '../src/console-codex.js';

const HASH = 'a'.repeat(64);

function envelope(operation, result, overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    artifactHash: HASH,
    codexVersion: 'traits-v1',
    operation,
    subjectIds: [617],
    evidence: [{ id: 'token:617', kind: 'token', label: 'collection_fact' }],
    result,
    ...overrides,
  };
}

function readyState(overrides = {}) {
  const traits = [
    { type: 'Background', value: 'Nebula', frequency: { numerator: 4, denominator: 7777, ppm: 514 }, evidenceId: 'trait:background', interpretation: { archetype: 'signal watcher' } },
    { type: 'Artifact', value: 'Nyan Cat', frequency: { numerator: 21, denominator: 7777, ppm: 2700 }, evidenceId: 'trait:artifact', interpretation: { archetype: 'internet fossil' } },
  ];
  const similar = Array.from({ length: 12 }, (_, index) => ({
    tokenId: index + 700,
    canonicalName: `Looper #${index + 700}`,
    intersectionWeight: '12',
    unionWeight: '20',
    scorePpm: 600000 - index,
    sharedTraits: [{ type: 'Background', value: 'Nebula' }],
  }));
  return {
    status: 'ready',
    selectedTokenId: '617',
    artifactHash: HASH,
    codexVersion: 'traits-v1',
    profile: envelope('getTokenProfile', {
      identity: { tokenId: 617, canonicalName: 'Looper #617', description: 'Verified Looper.', image: { url: 'https://artifact.invalid/private.png', id: 'image-secret' }, externalUrl: 'https://artifact.invalid/token' },
      visualTraits: traits.map(({ type, value }) => ({ type, value })),
      interpretation: {
        primaryClass: 'Researcher', secondaryClass: 'Builder', specialization: 'signal cartographer',
        risk: { value: 4, label: 'Balanced' }, autonomy: { value: 6, label: 'Guided' },
        voice: 'Precise', quirks: ['Maps every signal'], communicationStyle: ['Short and clear'],
        values: ['Evidence'], humor: ['Dry'], origin: 'Forged in the archive', missionBias: 'Trace signal',
        shortLore: 'Keeps the receipts.', longLore: 'A longer verified story.', activationSeed: 'secret-seed',
        firstMission: 'Map the signal', firstMissions: ['Map the signal'],
        recommendedSkills: [
          { family: 'research', skill: 'x-research', status: 'recommended', enabled: true },
          { family: 'analysis', skill: 'helixa', status: 'recommended' },
        ],
      },
      versions: { traitCodexVersion: 'traits-v1', classModelVersion: 'classes-v1' },
      artifactPath: '/home/private/codex.json', artifactUrl: 'https://artifact.invalid/codex.json', artifactBytes: 60203971,
    }),
    explanation: envelope('explainTraits', { tokenId: 617, traits }),
    similarity: envelope('findSimilar', { tokenId: 617, items: similar }),
    ...overrides,
  };
}

function renderState(state) {
  const html = renderConsoleCodexWorkspace(state);
  const document = new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
  return { html, root: document.querySelector('.console-codex-workspace') };
}

test('ready Codex renders exact proof, recommendation, frequency, and five collapsed drawers', () => {
  const normalized = normalizeConsoleCodexState(readyState());
  assert.equal(normalized.status, 'ready');
  const { html, root } = renderState(normalized);
  assert.ok(root);
  assert.match(root.querySelector('.console-codex-proof')?.textContent ?? '', /Token #617.*Verified artifact aaaaaaaaaaaa.*Codex traits-v1/s);
  assert.deepEqual([...root.querySelectorAll('details.console-codex-drawer > summary strong')].map((node) => node.textContent), [
    'Visual traits', 'Personality', 'Lore', 'Rarity', 'Similar Loopers',
  ]);
  assert.equal(root.querySelectorAll('details.console-codex-drawer[open]').length, 0);
  assert.match(root.querySelector('[data-codex-section="recommendations"]')?.textContent ?? '', /research.*x-research.*Recommended/s);
  assert.match(root.querySelector('[data-codex-section="rarity"]')?.textContent ?? '', /Background.*Nebula.*4 \/ 7,777.*514 ppm/s);
  assert.doesNotMatch(root.querySelector('[data-codex-section="rarity"]')?.textContent ?? '', /rank/i);
  assert.equal(root.querySelectorAll('[data-codex-similar-token]').length, 10);
  assert.doesNotMatch(html, /enabled|artifactPath|artifactUrl|artifactBytes|60203971|private.png|activationSeed|secret-seed/i);
});

test('Codex renders bounded loading, unavailable, retryable error, and empty-similar states', () => {
  const loading = renderState({ status: 'loading', selectedTokenId: '617' }).root;
  assert.equal(loading?.getAttribute('aria-busy'), 'true');
  assert.match(loading?.textContent ?? '', /Loading verified Codex/i);

  const unavailable = renderState({ status: 'unavailable', selectedTokenId: '617', error: 'raw private loader path' }).root;
  assert.match(unavailable?.textContent ?? '', /Verified Codex is unavailable right now/i);
  assert.doesNotMatch(unavailable?.textContent ?? '', /raw private loader path/i);
  assert.ok(unavailable?.querySelector('[data-action="retry-console-codex"]'));

  const failed = renderState({ status: 'error', selectedTokenId: '617', error: '<script>bad()</script>' }).root;
  assert.match(failed?.textContent ?? '', /could not be loaded/i);
  assert.ok(failed?.querySelector('[data-action="retry-console-codex"]'));
  assert.equal(failed?.querySelector('script'), null);

  const emptyState = readyState({ similarity: envelope('findSimilar', { tokenId: 617, items: [] }) });
  const empty = renderState(normalizeConsoleCodexState(emptyState)).root;
  assert.match(empty?.querySelector('[data-codex-section="similar"]')?.textContent ?? '', /No similar Loopers found/i);
});

test('Codex escapes hostile values and rejects mixed or malformed ready envelopes', () => {
  const hostile = readyState();
  hostile.profile.result.identity.canonicalName = '<img src=x onerror=alert(1)>';
  hostile.profile.result.interpretation.shortLore = '<script>alert(1)</script>';
  const { html, root } = renderState(normalizeConsoleCodexState(hostile));
  assert.equal(root?.querySelector('script,img'), null);
  assert.doesNotMatch(html, /onerror=/i);
  assert.match(root?.textContent ?? '', /<img src=x onerror=alert\(1\)>/);

  for (const invalid of [
    readyState({ artifactHash: 'b'.repeat(64) }),
    readyState({ explanation: envelope('getTokenProfile', {}) }),
    readyState({ similarity: envelope('findSimilar', { tokenId: 999, items: [] }) }),
  ]) {
    const state = normalizeConsoleCodexState(invalid);
    assert.equal(state.status, 'error');
    assert.match(renderState(state).root?.textContent ?? '', /could not be loaded/i);
  }
});
