import assert from 'node:assert/strict';
import test from 'node:test';

import { getActivationState } from '../src/activation.js';

const baseData = {
  sourceLabel: 'bundled fixture',
  profile: { display_name: 'Bendr 2.0' },
  liveProfilePage: { headerMeta: 'Local demo · 8453:1' },
  resolver: { canonicalId: '8453:1', tokenId: '1' },
};

test('getActivationState renders static data as preview only', () => {
  const state = getActivationState(baseData, { resolverStatus: null });

  assert.equal(state.kind, 'preview');
  assert.equal(state.title, 'Preview Multipass');
  assert.equal(state.originLabel, 'Preview from bundled public data');
  assert.equal(state.showFutureBindNote, true);
});

test('getActivationState renders loaded live data as activated from live record by default', () => {
  const state = getActivationState(
    { ...baseData, sourceLabel: 'live Helixa API', liveProfilePage: { headerMeta: 'Live profile · 8453:81' }, profile: { display_name: 'Quigbot' }, resolver: { canonicalId: '8453:81', tokenId: '81' } },
    { resolverStatus: 'loaded' },
  );

  assert.equal(state.kind, 'activated');
  assert.equal(state.title, 'Activated Multipass');
  assert.equal(state.subject, 'Quigbot');
  assert.equal(state.resolvedId, '8453:81');
  assert.equal(state.originLabel, 'Activated from live agent record');
  assert.equal(state.sourceLabel, 'live Helixa API');
  assert.match(state.summary, /built from a live public agent record/i);
});

test('getActivationState only labels NFT origin with exact trusted metadata', () => {
  const trusted = getActivationState(
    {
      ...baseData,
      sourceLabel: 'live Helixa API',
      activation: { origin: 'nft_adapter_new_erc8004', originSource: 'trusted_resolver_metadata' },
    },
    { resolverStatus: 'loaded' },
  );
  const untrusted = getActivationState(
    {
      ...baseData,
      sourceLabel: 'live Helixa API',
      activation: { origin: 'nft_adapter_new_erc8004', originSource: 'guessed_from_token_id' },
    },
    { resolverStatus: 'loaded' },
  );

  assert.equal(trusted.originLabel, 'Activated from NFT');
  assert.equal(untrusted.originLabel, 'Activated from live agent record');
});

test('getActivationState never infers NFT origin from token or AgentDNA presence alone', () => {
  const state = getActivationState(
    {
      ...baseData,
      sourceLabel: 'live Helixa API',
      profile: { display_name: 'NFT-ish Agent' },
      resolver: { canonicalId: '8453:999', tokenId: '999' },
      agentCards: [{ name: 'AgentDNA-only signal', helixaId: '8453:999' }],
      visualIdentity: {
        provenanceDrawer: {
          facts: [
            { label: 'AgentDNA token ID', value: '999' },
            { label: 'Helixa ID', value: '8453:999' },
          ],
        },
      },
    },
    { resolverStatus: 'loaded' },
  );

  assert.equal(state.originLabel, 'Activated from live agent record');
});
