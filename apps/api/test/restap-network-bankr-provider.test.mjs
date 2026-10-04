import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRestapNetworkBankrGateway,
  createRestapNetworkProviderBudget,
} from '../src/restap-network/bankr-provider.js';

const SYSTEM = 'Fixed public relay instruction.';
const USER = '{"topic":"general"}';
const CONTRACT = { type: 'text', maxUtf8Bytes: 2000 };

function projection() {
  return { systemInstruction: SYSTEM, userDataJson: USER, responseContract: CONTRACT };
}

function response(body, { ok = true, status = 200, headers = {} } = {}) {
  return { ok, status, headers: { get(name) { return headers[name.toLowerCase()] ?? null; } }, async json() { return structuredClone(body); } };
}

test('uses the ZDR Bankr chat endpoint with an exact no-tools text-only request', async () => {
  const calls = [];
  const gateway = createRestapNetworkBankrGateway({
    apiKey: 'bk_test_secret',
    model: 'claude-haiku-4.5',
    maxTokens: 512,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({
        id: 'chatcmpl-test', model: 'claude-haiku-4.5',
        choices: [{ index: 0, message: { role: 'assistant', content: 'A bounded reply.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 20, completion_tokens: 4, total_tokens: 24 },
      }, { headers: { 'x-privacy-tier': 'zdr' } });
    },
  });
  assert.equal(await gateway.generatePublicReply(projection()), 'A bounded reply.');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://llm.bankr.bot/zdr/v1/chat/completions');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['x-api-key'], 'bk_test_secret');
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body, {
    model: 'claude-haiku-4.5', max_tokens: 512, temperature: 0,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: USER }],
  });
  assert.equal(Object.hasOwn(body, 'tools'), false);
  assert.equal(Object.hasOwn(body, 'tool_choice'), false);
});

test('rejects privacy downgrade, tool calls, malformed usage, non-text output, and upstream errors uniformly', async () => {
  const cases = [
    [response({ choices: [{ message: { content: 'reply' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }, { headers: { 'x-privacy-tier': 'standard' } })],
    [response({ choices: [{ message: { content: 'reply', tool_calls: [{ id: 'x' }] } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }, { headers: { 'x-privacy-tier': 'zdr' } })],
    [response({ choices: [{ message: { content: 'reply' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 3 } }, { headers: { 'x-privacy-tier': 'zdr' } })],
    [response({ choices: [{ message: { content: [{ type: 'text', text: 'reply' }] } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }, { headers: { 'x-privacy-tier': 'zdr' } })],
    [response({ error: { message: 'PRIVATE PROVIDER ERROR' } }, { ok: false, status: 503, headers: { 'x-privacy-tier': 'zdr' } })],
  ];
  for (const [gatewayResponse] of cases) {
    const gateway = createRestapNetworkBankrGateway({ apiKey: 'bk_test_secret', fetchImpl: async () => gatewayResponse });
    await assert.rejects(gateway.generatePublicReply(projection()), (error) => {
      assert.equal(error.message, 'RESTAP network Bankr inference unavailable.');
      assert.doesNotMatch(error.message, /private provider/i);
      return true;
    });
  }
});

test('tracks only RESTAP-dispatched inference requests for exact process accounting', async () => {
  const gateway = createRestapNetworkBankrGateway({
    apiKey: '***',
    fetchImpl: async () => response({ error: { message: 'failed after dispatch' } }, { ok: false, status: 503 }),
  });
  assert.equal(gateway.readDispatchedTotal(), 0);
  await assert.rejects(gateway.generatePublicReply(projection()), /inference unavailable/i);
  assert.equal(gateway.readDispatchedTotal(), 1);
});

test('reads exact 90-day request totals without exposing cost or model breakdowns', async () => {
  const calls = [];
  const gateway = createRestapNetworkBankrGateway({
    apiKey: 'bk_test_secret',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({ object: 'usage_summary', days: 90, totals: { totalRequests: 41, totalInputTokens: 99, totalOutputTokens: 100, totalTokens: 199, totalCost: 0.02 } });
    },
  });
  assert.deepEqual(await gateway.readUsageTotals(), { totalRequests: 41 });
  assert.equal(calls[0].url, 'https://llm.bankr.bot/v1/usage?days=90');
  assert.equal(calls[0].options.method, 'GET');
});

test('provider budget baselines request totals against durable one-unit dispatched operations', async () => {
  let providerTotal = 100;
  let durable = 7;
  const budget = createRestapNetworkProviderBudget({
    readProviderRequestTotal: async () => providerTotal,
    readDurableChargedUnits: () => durable,
  });
  assert.deepEqual(await budget.read(), { providerChargedUnits: 7, durableChargedUnits: 7, unknownChargeUnits: 0 });
  providerTotal += 2;
  durable += 2;
  assert.deepEqual(await budget.read(), { providerChargedUnits: 9, durableChargedUnits: 9, unknownChargeUnits: 0 });
  providerTotal += 1;
  assert.deepEqual(await budget.read(), { providerChargedUnits: 10, durableChargedUnits: 9, unknownChargeUnits: 0 });
});

test('provider budget fails closed on regressed totals and malformed durable accounting', async () => {
  let providerTotal = 10;
  const budget = createRestapNetworkProviderBudget({ readProviderRequestTotal: async () => providerTotal, readDurableChargedUnits: () => 1 });
  await budget.read();
  providerTotal = 9;
  await assert.rejects(budget.read(), /regressed/i);
  assert.throws(() => createRestapNetworkProviderBudget({ readProviderRequestTotal: async () => 1, readDurableChargedUnits: () => -1 }), /durable/i);
});
