import assert from 'node:assert/strict';
import test from 'node:test';

import { createBankrLlmClient } from '../src/bankr-llm/index.js';

test('Bankr client falls back to the default model when production config is null', async () => {
  let requestBody = null;
  const client = createBankrLlmClient({
    apiKey: 'test-key',
    model: null,
    fetchImpl: async (_url, request) => {
      requestBody = JSON.parse(request.body);
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Bankr response.' } }],
      }), { status: 200 });
    },
  });

  const result = await client.generate({
    profile: { displayName: 'Bendr' },
    message: 'Report status.',
  });

  assert.equal(requestBody.model, 'claude-haiku-4.5');
  assert.equal(result.provider, 'bankr_llm_gateway');
});

test('Bankr system prompt grounds the model in canonical Looper persona and Sibyl continuity', async () => {
  let requestBody = null;
  const client = createBankrLlmClient({
    apiKey: '***',
    fetchImpl: async (_url, request) => {
      requestBody = JSON.parse(request.body);
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'I am Looper #614.' } }],
      }), { status: 200 });
    },
  });

  await client.generate({
    profile: {
      displayName: 'Looper #614',
      persona: {
        canonicalName: 'Looper #614',
        agentClass: 'Trader / Broker',
        specialization: 'market making',
        riskProfile: 'Disciplined',
        autonomy: 'Extreme',
        voice: 'conspiracy energy converted into due diligence',
        firstMission: 'price an opportunity',
        codexVersion: 'looper-trait-personality-matrix-v02',
      },
      memoryNamespace: 'multipass:8453:loopers:614:87069',
      permissions: { trading: 'review_only', custody: 'disabled', toolAuthority: 'human_review' },
    },
    message: 'Who are you?',
    memory: [{ text: 'The owner prefers concise market briefs.' }],
  });

  const systemPrompt = requestBody.messages[0].content;
  assert.match(systemPrompt, /You are Looper #614/i);
  assert.match(systemPrompt, /Trader \/ Broker/);
  assert.match(systemPrompt, /market making/);
  assert.match(systemPrompt, /Disciplined/);
  assert.match(systemPrompt, /Extreme/);
  assert.match(systemPrompt, /conspiracy energy converted into due diligence/);
  assert.match(systemPrompt, /price an opportunity/);
  assert.match(systemPrompt, /Sibyl/i);
  assert.match(systemPrompt, /do not claim.*no personality/i);
  assert.match(systemPrompt, /do not claim.*starts fresh/i);
  assert.match(systemPrompt, /review-only/i);
});
