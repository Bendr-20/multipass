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
