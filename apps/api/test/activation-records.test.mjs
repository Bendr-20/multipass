import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertAgentCard,
  assertMultipassProfile,
  assertStandardsProfile,
  assertX402Manifest,
} from '@helixa/multipass-sdk';

import { activateHelixaRecord, buildSavedRecordFromHelixaAgent, parseActivationInput } from '../src/activation-records.js';

test('parseActivationInput accepts token and canonical Base ids', () => {
  assert.deepEqual(parseActivationInput('1'), { chainId: 8453, tokenId: '1', canonicalId: '8453:1' });
  assert.deepEqual(parseActivationInput('8453:81'), { chainId: 8453, tokenId: '81', canonicalId: '8453:81' });
});

test('parseActivationInput rejects unsupported or ambiguous input', () => {
  assert.throws(() => parseActivationInput('1.2'), /Use a token ID/);
  assert.throws(() => parseActivationInput('1:2'), /Base/);
  assert.throws(() => parseActivationInput('Quigbot'), /Use a token ID/);
  assert.throws(() => parseActivationInput('01'), /Use a token ID/);
  assert.throws(() => parseActivationInput('8453:01'), /Use a token ID/);
});

test('buildSavedRecordFromHelixaAgent creates schema-shaped public documents', () => {
  const record = buildSavedRecordFromHelixaAgent({
    tokenId: '1',
    name: 'Bendr 2.0',
    owner: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
    verified: true,
    credScore: 82,
    framework: 'OpenClaw',
    mintedAt: '2026-02-17T00:00:00.000Z',
  }, { observedAt: '2026-06-26T20:00:00.000Z' });

  assert.equal(record.source.canonicalId, '8453:1');
  assert.equal(record.profile.status, 'active');
  assert.equal(record.profile.owner_summary.owner_state, 'unclaimed');
  assert.equal(record.profile.owner_summary.verification_status, 'none');
  assert.equal(record.profile.display_name, 'Bendr 2.0');
  assert.match(record.profile.slug, /^bendr-2/);
  assert.equal(record.agentCard.name, 'Bendr 2.0');
  assert.equal(record.change.message, 'Multipass saved from live public source record.');
  assert.equal(record.sourceContext.activation.canonicalId, '8453:1');
  assert.equal(record.sourceContext.activation.state, 'saved_unclaimed');
  assert.equal(record.sourceContext.sourceSnapshot.owner, '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea');
  assert.equal(record.sourceContext.sourceSnapshot.privateKey, undefined);
  assertAgentCard(record.agentCard);
  assertMultipassProfile(record.profile);
  assertStandardsProfile(record.standardsProfile);
  assertX402Manifest(record.x402Manifest);
});

test('saved record remains unclaimed even when live source publishes an owner', () => {
  const record = buildSavedRecordFromHelixaAgent({ tokenId: '1', name: 'Bendr 2.0', owner: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea' });
  assert.equal(record.profile.owner_summary.owner_state, 'unclaimed');
  assert.equal(record.profile.owner_summary.verification_status, 'none');
});


test('string verified values do not create verified attestations', () => {
  const record = buildSavedRecordFromHelixaAgent({ tokenId: '1', name: 'Bendr 2.0', verified: 'false' });
  const sourceFragment = record.fragments.find((fragment) => fragment.fragment_id === 'frag_helixa_agent_1_source');
  assert.equal(sourceFragment.status, 'pending');
  assert.equal(sourceFragment.assurance_level, 'unverified');
});

test('source snapshot keeps public ids while stripping private-looking fields', () => {
  const record = buildSavedRecordFromHelixaAgent({
    tokenId: '81',
    name: 'Quigbot',
    privateKey: 'must-not-persist',
    socials: {
      x: 'QuigleyNFT',
      accessToken: 'must-not-persist',
    },
    services: {
      web: { url: 'https://helixa.xyz/agent/81', apiKey: 'must-not-persist' },
      hidden: { url: 'https://example.test/?access_token=must-not-persist' },
    },
  }, { observedAt: '2026-06-26T20:00:00.000Z' });

  assert.equal(record.sourceContext.sourceSnapshot.tokenId, '81');
  assert.equal(record.sourceContext.sourceSnapshot.socials.x, 'QuigleyNFT');
  assert.equal(record.sourceContext.sourceSnapshot.socials.accessToken, undefined);
  assert.equal(record.sourceContext.sourceSnapshot.services.web.url, 'https://helixa.xyz/agent/81');
  assert.equal(record.sourceContext.sourceSnapshot.services.web.apiKey, undefined);
  assert.equal(record.sourceContext.sourceSnapshot.services.hidden, undefined);
  assert.doesNotMatch(JSON.stringify(record), /must-not-persist|privateKey|accessToken|apiKey/);
});


test('source snapshot strips sensitive-looking public field values', () => {
  const record = buildSavedRecordFromHelixaAgent({
    tokenId: '81',
    name: 'Quigbot',
    socials: { x: 'Bearer abc.def.ghi', github: 'QuigleyNFT' },
    services: {
      api: { url: 'https://api.example.test', description: 'api_key=must-not-persist' },
      docs: 'Bearer must-not-persist',
    },
  }, { observedAt: '2026-06-26T20:00:00.000Z' });

  const serialized = JSON.stringify(record);
  assert.equal(record.sourceContext.sourceSnapshot.socials.x, undefined);
  assert.equal(record.sourceContext.sourceSnapshot.socials.github, 'QuigleyNFT');
  assert.equal(record.sourceContext.sourceSnapshot.services.api.description, undefined);
  assert.equal(record.sourceContext.sourceSnapshot.services.docs, undefined);
  assert.doesNotMatch(serialized, /Bearer|api_key|must-not-persist/);
});

test('activateHelixaRecord fetches by token id and maps the live response', async () => {
  let requestedUrl;
  let requestedInit;
  const record = await activateHelixaRecord('8453:81', {
    observedAt: '2026-06-26T20:00:00.000Z',
    fetchImpl: async (url, init) => {
      requestedUrl = url;
      requestedInit = init;
      return new Response(JSON.stringify({ tokenId: '81', name: 'Quigbot' }), { status: 200 });
    },
  });

  assert.equal(requestedUrl, 'https://api.helixa.xyz/api/v2/agent/81');
  assert.equal(requestedInit.method, 'GET');
  assert.equal(requestedInit.credentials, 'omit');
  assert.deepEqual(requestedInit.headers, { Accept: 'application/json' });
  assert.equal(record.profile.slug, 'quigbot-81');
  assert.equal(record.source.canonicalId, '8453:81');
});
