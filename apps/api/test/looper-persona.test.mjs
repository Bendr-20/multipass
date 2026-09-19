import assert from 'node:assert/strict';
import test from 'node:test';

import { createLooperPersonaLoader, normalizeLooperPersona } from '../src/looper-persona.js';

const METADATA = {
  name: 'Looper #614',
  description: 'A Looper agent seed.',
  attributes: [
    { trait_type: 'Agent Class', value: 'Trader / Broker' },
    { trait_type: 'Secondary Class', value: 'Signal Analyst' },
    { trait_type: 'Specialization', value: 'market making' },
    { trait_type: 'Risk', value: 'Disciplined' },
    { trait_type: 'Autonomy', value: 'Extreme' },
    { trait_type: 'Codex Version', value: 'looper-trait-personality-matrix-v02' },
  ],
  voice: 'conspiracy energy converted into due diligence',
  first_mission: 'price an opportunity',
};

test('normalizes trusted Looper metadata into a bounded runtime persona', () => {
  assert.deepEqual(normalizeLooperPersona(METADATA, '614'), {
    tokenId: '614',
    canonicalName: 'Looper #614',
    description: 'A Looper agent seed.',
    agentClass: 'Trader / Broker',
    secondaryClass: 'Signal Analyst',
    specialization: 'market making',
    riskProfile: 'Disciplined',
    autonomy: 'Extreme',
    voice: 'conspiracy energy converted into due diligence',
    firstMission: 'price an opportunity',
    codexVersion: 'looper-trait-personality-matrix-v02',
  });
});

test('persona normalization bounds text and rejects missing metadata', () => {
  assert.equal(normalizeLooperPersona(null, '614'), null);
  assert.equal(normalizeLooperPersona([], '614'), null);
  assert.equal(normalizeLooperPersona({}, 'not-a-token'), null);
  assert.equal(normalizeLooperPersona({ name: `Looper ${'x'.repeat(500)}` }, '614').canonicalName.length, 120);
});

test('persona loader reads the trusted metadata base and degrades to null', async () => {
  const requested = [];
  const loader = createLooperPersonaLoader({
    metadataBaseUrl: 'https://metadata.example/loopers/',
    fetchImpl: async (url) => {
      requested.push(String(url));
      return new Response(JSON.stringify(METADATA), { status: 200 });
    },
  });

  assert.equal((await loader({ tokenId: '614' })).voice, METADATA.voice);
  assert.deepEqual(requested, ['https://metadata.example/loopers/614.json']);

  const unavailable = createLooperPersonaLoader({
    metadataBaseUrl: 'https://metadata.example/loopers/',
    fetchImpl: async () => new Response('unavailable', { status: 503 }),
  });
  assert.equal(await unavailable({ tokenId: '614' }), null);
});
