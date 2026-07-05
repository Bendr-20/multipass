import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertAgentCard,
  assertMultipassProfile,
  assertStandardsProfile,
  assertX402Manifest,
} from '@helixa/multipass-sdk';

import { activateHelixaRecord, buildSavedRecordFromHelixaAgent, discoverErc8004Identities, parseActivationInput } from '../src/activation-records.js';

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


test('buildSavedRecordFromHelixaAgent imports agent-owned ERC-8004 identities as verified fragments', () => {
  const record = buildSavedRecordFromHelixaAgent({
    tokenId: '1',
    name: 'Bendr 2.0',
    owner: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
    agentAddress: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
  }, {
    observedAt: '2026-06-29T22:50:00.000Z',
    erc8004Identities: [{
      chainId: 8453,
      registryAddress: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
      tokenId: '18531',
      owner: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
      custody: 'agent_owned',
      name: 'Bendr 2.0',
      match: 'metadata_registration',
      tokenURI: 'data:application/json;base64,eyJuYW1lIjoiQmVuZHIgMi4wIn0=',
    }],
  });

  const identityId = 'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:18531';
  const erc8004Fragment = record.fragments.find((fragment) => fragment.proof_reference === identityId);

  assert.ok(erc8004Fragment, 'expected a public ERC-8004 identity fragment');
  assert.equal(erc8004Fragment.fragment_type, 'standard_ref');
  assert.equal(erc8004Fragment.status, 'verified');
  assert.equal(erc8004Fragment.assurance_level, 'onchain_verified');
  assert.match(erc8004Fragment.public_value, /Agent-owned ERC-8004 identity/);
  assert.equal(record.standardsProfile.primary_refs.erc8004_identity, identityId);
  assert.equal(record.standardsProfile.standard_refs[0].status, 'active');
  assert.equal(record.standardsProfile.standard_refs[0].record_id, identityId);
  assert.equal(record.standardsProfile.compatibility_summary.identity_bound, true);
  assert.equal(record.profile.standards_profile.last_verified_at, '2026-06-29T22:50:00.000Z');
  assert.equal(record.agentCard.trust_summary.identity_status, 'verified');
  assert.equal(record.agentCard.trust_summary.assurance_level, 'onchain_verified');
  assert.deepEqual(record.agentCard.standards_refs, [{
    standard_id: 'ERC-8004',
    support_status: 'active',
    record_id: identityId,
  }]);
  assert.ok(record.profile.public_fragments.some((fragment) => fragment.fragment_id === erc8004Fragment.fragment_id));
  assertMultipassProfile(record.profile);
  assertStandardsProfile(record.standardsProfile);
  assertAgentCard(record.agentCard);
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

test('activateHelixaRecord timeboxes slow ERC-8004 discovery and keeps the public agent record usable', async () => {
  const record = await activateHelixaRecord('1', {
    observedAt: '2026-06-29T22:50:00.000Z',
    discoveryTimeoutMs: 1,
    fetchImpl: async () => new Response(JSON.stringify({
      tokenId: '1',
      name: 'Bendr 2.0',
      owner: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
      agentAddress: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
    }), { status: 200 }),
    erc8004Discovery: async () => new Promise((resolve) => {
      setTimeout(() => resolve([{
        chainId: 8453,
        registryAddress: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
        tokenId: '18531',
        owner: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
        custody: 'agent_owned',
        name: 'Bendr 2.0',
        match: 'metadata_registration',
      }]), 20);
    }),
  });

  assert.equal(record.profile.slug, 'bendr-2-1');
  assert.equal(record.standardsProfile.primary_refs.erc8004_identity, null);
  assert.equal(record.sourceContext.sourceSnapshot.erc8004Identities, undefined);
});

test('activateHelixaRecord imports identities returned by an ERC-8004 discovery service', async () => {
  let discoveryInput;
  const record = await activateHelixaRecord('1', {
    observedAt: '2026-06-29T22:50:00.000Z',
    fetchImpl: async () => new Response(JSON.stringify({
      tokenId: '1',
      name: 'Bendr 2.0',
      owner: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
      agentAddress: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
    }), { status: 200 }),
    erc8004Discovery: async (agent) => {
      discoveryInput = agent;
      return [{
        chainId: 8453,
        registryAddress: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
        tokenId: '18531',
        owner: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
        custody: 'agent_owned',
        name: 'Bendr 2.0',
        match: 'metadata_registration',
      }];
    },
  });

  assert.equal(discoveryInput.tokenId, '1');
  assert.equal(discoveryInput.name, 'Bendr 2.0');
  assert.equal(record.standardsProfile.primary_refs.erc8004_identity, 'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:18531');
  assert.ok(record.fragments.some((fragment) => fragment.public_value?.includes('Agent-owned ERC-8004 identity')));
});

test('buildSavedRecordFromHelixaAgent keeps platform-held ERC-8004 mirrors distinct from agent-owned identities', () => {
  const record = buildSavedRecordFromHelixaAgent({
    tokenId: '81',
    name: 'Quigbot',
    owner: '0x17d7DfA154dc0828AdE4115B9EB8a0A91C0fbDe4',
  }, {
    observedAt: '2026-06-29T22:50:00.000Z',
    erc8004Identities: [{
      chainId: 8453,
      registryAddress: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
      tokenId: '9001',
      owner: '0x339559A2d1CD15059365FC7bD36b3047BbA480E0',
      custody: 'platform_held_mirror',
      name: 'Quigbot',
      match: 'metadata_registration',
    }],
  });

  const mirrorFragment = record.fragments.find((fragment) => fragment.proof_reference?.endsWith(':9001'));
  assert.equal(mirrorFragment.status, 'verified');
  assert.equal(mirrorFragment.assurance_level, 'onchain_verified');
  assert.match(mirrorFragment.public_value, /Platform-held ERC-8004 mirror/);
  assert.equal(record.standardsProfile.compatibility_summary.owner_verified, false);
  assert.equal(record.standardsProfile.primary_refs.erc8004_identity, 'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:9001');
});

test('discoverErc8004Identities finds Bendr-style agent-owned identities from registry transfer logs', async () => {
  const holder = '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';
  const tokenId = '18531';
  const metadata = {
    name: 'Bendr 2.0',
    image: 'https://api.helixa.xyz/api/v2/agent/1/card.png',
    services: [{ name: 'web', endpoint: 'https://helixa.xyz/agent/1' }],
    registrations: [{ agentId: '8453:1' }],
  };
  const tokenURI = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata), 'utf8').toString('base64')}`;

  const identities = await discoverErc8004Identities({
    tokenId: '1',
    name: 'Bendr 2.0',
    owner: holder,
    agentAddress: '0xD31fCdb0432D3C9BF9d98643F69C7edd690E48E8',
    mintOrigin: 'AGENT_SIWA',
  }, {
    fetchImpl: async () => new Response(JSON.stringify({
      message: 'OK',
      result: [{
        topics: [
          '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
          `0x${'0'.repeat(64)}`,
          `0x${holder.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`,
          `0x${BigInt(tokenId).toString(16).padStart(64, '0')}`,
        ],
        transactionHash: '0xabc',
      }],
    }), { status: 200 }),
    readContract: async ({ functionName }) => {
      if (functionName === 'ownerOf') return holder;
      if (functionName === 'tokenURI') return tokenURI;
      throw new Error(`unexpected read ${functionName}`);
    },
  });

  assert.deepEqual(identities, [{
    chainId: 8453,
    registryAddress: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
    tokenId: '18531',
    canonicalId: 'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:18531',
    owner: holder,
    custody: 'agent_owned',
    name: 'Bendr 2.0',
    match: 'metadata_registration',
    tokenURI,
    explorerUrl: 'https://basescan.org/token/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432?a=18531',
  }]);
});
