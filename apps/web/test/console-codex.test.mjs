import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import { normalizeConsoleCodexState, renderConsoleCodexWorkspace } from '../src/console-codex.js';
import { canonicalCodexReadyState, codexEnvelope } from './console-codex-fixture.mjs';

function renderState(state) {
  const html = renderConsoleCodexWorkspace(state);
  const document = new JSDOM('<!doctype html><body>' + html + '</body>').window.document;
  return { html, root: document.querySelector('.console-codex-workspace') };
}

function expectRejected(state) {
  const normalized = normalizeConsoleCodexState(state);
  assert.equal(normalized.status, 'error');
  assert.match(renderState(normalized).root?.textContent ?? '', /could not be loaded/i);
}

test('ready Codex renders the complete locked identity, recommendation, evidence, lore, and similarity UI', () => {
  const state = canonicalCodexReadyState();
  state.profile.result.identity.description = 'A Looper agent seed generated from the approved HashLips layer-composite pipeline.';
  const normalized = normalizeConsoleCodexState(state);
  assert.equal(normalized.status, 'ready');
  const { root } = renderState(normalized);
  assert.ok(root);
  assert.match(root.querySelector('.console-codex-header')?.textContent ?? '', /Verified identity derived from this Looper's published traits./i);
  assert.doesNotMatch(root.querySelector('.console-codex-header')?.textContent ?? '', /HashLips|layer-composite|pipeline/i);
  assert.match(root.querySelector('.console-codex-proof')?.textContent ?? '', /Token #617.*Verified artifact aaaaaaaaaaaa.*Codex traits-v1/s);
  assert.match(root.querySelector('.console-codex-facts')?.textContent ?? '', /Risk.*Balanced \(4\).*Autonomy.*Guided \(6\)/s);
  assert.equal(root.querySelector('#console-codex-recommendations-title')?.textContent, 'Recommended skill families');
  assert.match(root.querySelector('[data-codex-section="recommendations"]')?.textContent ?? '', /research.*Collects evidence\..*Researcher \/ Archivist.*looper-skill-map-v01.*Recommended/s);
  assert.deepEqual([...root.querySelectorAll('details.console-codex-drawer > summary strong')].map((node) => node.textContent), ['Visual traits', 'Personality', 'Lore', 'Rarity', 'Similar Loopers']);
  assert.equal(root.querySelectorAll('details.console-codex-drawer[open]').length, 0);
  assert.match(root.querySelector('[data-codex-section="lore"]')?.textContent ?? '', /Activation seed.*674e832692e7a526177d9cdd7bf67eb6.*First missions.*Map the signal.*Index the archive/s);
  assert.match(root.querySelector('[data-codex-section="rarity"]')?.textContent ?? '', /Background.*Nebula.*Collection evidence.*4 \/ 7,777.*514 ppm/s);
  assert.doesNotMatch(root.querySelector('[data-codex-section="rarity"]')?.textContent ?? '', /rank/i);
  assert.equal(root.querySelectorAll('[data-codex-similar-token]').length, 10);
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
  const emptyState = canonicalCodexReadyState({ similarity: codexEnvelope('findSimilar', { tokenId: 617, items: [] }) });
  const empty = renderState(normalizeConsoleCodexState(emptyState)).root;
  assert.match(empty?.querySelector('[data-codex-section="similar"]')?.textContent ?? '', /No similar Loopers found/i);
});

test('Codex escapes hostile values and rejects mixed release envelopes', () => {
  const hostile = canonicalCodexReadyState();
  hostile.profile.result.identity.description = '<img src=x onerror=alert(1)>';
  hostile.profile.result.interpretation.shortLore = '<script>alert(1)</script>';
  const { html, root } = renderState(normalizeConsoleCodexState(hostile));
  assert.equal(root?.querySelector('script,img'), null);
  assert.doesNotMatch(html, /onerror=/i);
  assert.doesNotMatch(root?.textContent ?? '', /<img src=x onerror=alert\(1\)>/);
  for (const invalid of [
    canonicalCodexReadyState({ artifactHash: 'b'.repeat(64) }),
    canonicalCodexReadyState({ explanation: codexEnvelope('getTokenProfile', {}) }),
    canonicalCodexReadyState({ similarity: codexEnvelope('findSimilar', { tokenId: 999, items: [] }) }),
  ]) expectRejected(invalid);
});

test('Codex accepts only exact closed envelope and nested result schemas', () => {
  const missingEnvelopeKey = canonicalCodexReadyState(); delete missingEnvelopeKey.profile.evidence;
  const extraEnvelopeKey = canonicalCodexReadyState(); extraEnvelopeKey.profile.debug = true;
  const extraIdentityKey = canonicalCodexReadyState(); extraIdentityKey.profile.result.identity.privatePath = '/srv/codex.json';
  const missingRecommendationKey = canonicalCodexReadyState(); delete missingRecommendationKey.profile.result.interpretation.recommendedSkills[0].reason;
  const legacyRecommendation = canonicalCodexReadyState(); legacyRecommendation.profile.result.interpretation.recommendedSkills[0] = { family: 'research', skill: 'x-research', status: 'recommended' };
  for (const invalid of [missingEnvelopeKey, extraEnvelopeKey, extraIdentityKey, missingRecommendationKey, legacyRecommendation]) expectRejected(invalid);
});

test('Codex rejects impossible collection frequencies and incomplete similarity records', () => {
  const tooMany = canonicalCodexReadyState(); tooMany.explanation.result.traits[0].frequency.numerator = 7778;
  const wrongDenominator = canonicalCodexReadyState(); wrongDenominator.explanation.result.traits[0].frequency.denominator = 7776;
  const forgedPpm = canonicalCodexReadyState(); forgedPpm.explanation.result.traits[0].frequency.ppm = 515;
  const incompleteSimilar = canonicalCodexReadyState(); delete incompleteSimilar.similarity.result.items[0].unionWeight;
  const impossibleScore = canonicalCodexReadyState(); impossibleScore.similarity.result.items[0].scorePpm = 1_000_001;
  for (const invalid of [tooMany, wrongDenominator, forgedPpm, incompleteSimilar, impossibleScore]) expectRejected(invalid);
});

test('Codex rejects forged prototypes and token IDs outside canonical 1..7777', () => {
  const nullPrototype = canonicalCodexReadyState();
  nullPrototype.profile.result.identity = Object.assign(Object.create(null), nullPrototype.profile.result.identity);
  const customPrototype = canonicalCodexReadyState();
  customPrototype.explanation.result.traits[0].frequency = Object.assign(Object.create({ forged: true }), customPrototype.explanation.result.traits[0].frequency);
  const zeroSubject = canonicalCodexReadyState({ selectedTokenId: '0' });
  zeroSubject.profile.result.identity.tokenId = 0; zeroSubject.profile.subjectIds = [0];
  zeroSubject.explanation.result.tokenId = 0; zeroSubject.explanation.subjectIds = [0];
  zeroSubject.similarity.result.tokenId = 0; zeroSubject.similarity.subjectIds = [0];
  const highSimilar = canonicalCodexReadyState(); highSimilar.similarity.result.items[0].tokenId = 7778;
  const leadingZeroSelection = canonicalCodexReadyState({ selectedTokenId: '0617' });
  const forgedProfileName = canonicalCodexReadyState(); forgedProfileName.profile.result.identity.canonicalName = 'Not Looper #617';
  const forgedSimilarName = canonicalCodexReadyState(); forgedSimilarName.similarity.result.items[0].canonicalName = 'Looper #999';
  for (const invalid of [nullPrototype, customPrototype, zeroSubject, highSimilar, leadingZeroSelection, forgedProfileName, forgedSimilarName]) expectRejected(invalid);
});

test('Codex loading and ready surfaces share the locked workspace height without a 420px override', async () => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.console-codex-workspace,\s*\.console-activation-gate\s*\{[^}]*min-height:\s*620px;/s);
  assert.doesNotMatch(css, /\.console-codex-state,\s*\.console-activation-gate\s*\{[^}]*min-height:/s);
});
