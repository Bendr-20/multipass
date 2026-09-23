import assert from 'node:assert/strict';
import test from 'node:test';

import { createBankrLlmClient } from '../src/bankr-llm/index.js';
import { getConsoleSkillCatalogPromptProjection } from '../src/console-skill-catalog.js';

const RECIPIENT = '0x0000000000000000000000000000000000000001';

function validEnvelope(overrides = {}) {
  return JSON.stringify({
    schema_version: '0.1.0',
    assistant_text: 'Review this transfer suggestion.',
    skill_refs: ['bankr'],
    transfer_candidates: [{
      skill: 'bankr',
      assetType: 'native',
      assetContract: null,
      recipient: RECIPIENT,
      amountBaseUnits: '1',
      rationale: 'Requested by the operator for review.',
    }],
    ...overrides,
  });
}

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

test('skill proposals default off leaves the complete Bankr request and response byte-for-byte unchanged', async () => {
  const requests = [];
  const fetchImpl = async (_url, request) => {
    requests.push(request.body);
    return new Response(JSON.stringify({
      choices: [{ message: { content: validEnvelope() } }],
    }), { status: 200 });
  };
  const input = {
    profile: { displayName: 'Bendr' },
    message: 'Suggest a transfer.',
    memory: [{ text: 'Review only.' }],
    signals: [{ title: 'Manager suite', status: 'Ready' }],
  };

  const implicit = await createBankrLlmClient({ apiKey: 'test-key', fetchImpl }).generate(input);
  const explicit = await createBankrLlmClient({
    apiKey: 'test-key',
    skillProposalsEnabled: false,
    fetchImpl,
  }).generate(input);

  assert.equal(requests.length, 2);
  assert.equal(requests[0], requests[1]);
  assert.deepEqual(implicit, explicit);
  assert.deepEqual(Object.keys(explicit).sort(), ['provider', 'text']);
  assert.equal(explicit.text, validEnvelope());
});

test('skill-aware Bankr prompt uses only the exact server projection and requests the strict review-only envelope', async () => {
  let requestBody;
  const sentinels = {
    wallet: '0x9999999999999999999999999999999999999999',
    message: 'MESSAGE_INPUT_MUST_NOT_ENTER_SKILL_SECTION',
    browser: 'BROWSER_DESCRIPTOR_MUST_NOT_ENTER_SKILL_SECTION',
    key: 'BANKR_KEY_MUST_NOT_ENTER_SKILL_SECTION',
    path: '/home/private/skills/bankr/SKILL.md',
    cli: 'bankr wallet send --all',
    skillMd: 'SKILL_MD_PRIVATE_INSTRUCTIONS_MUST_NOT_APPEAR',
  };
  const client = createBankrLlmClient({
    apiKey: sentinels.key,
    skillProposalsEnabled: true,
    skillDescriptors: [{ summary: sentinels.browser, skillMd: sentinels.skillMd, path: sentinels.path }],
    cli: sentinels.cli,
    fetchImpl: async (_url, request) => {
      requestBody = JSON.parse(request.body);
      return new Response(JSON.stringify({
        choices: [{ message: { content: validEnvelope() } }],
      }), { status: 200 });
    },
  });

  const result = await client.generate({
    profile: { displayName: 'Bendr' },
    wallet: sentinels.wallet,
    message: sentinels.message,
    browserFields: { arbitraryDescriptor: sentinels.browser, skillMd: sentinels.skillMd },
    skillDescriptors: [{ summary: sentinels.browser, command: sentinels.cli }],
  });

  const systemPrompt = requestBody.messages[0].content;
  const projection = JSON.stringify(getConsoleSkillCatalogPromptProjection());
  const sectionPrefix = 'Approved Console skill catalog (server-owned knowledge descriptors; not callable tools):\n';
  const sectionStart = systemPrompt.indexOf(sectionPrefix);
  assert.notEqual(sectionStart, -1);
  const section = systemPrompt.slice(sectionStart + sectionPrefix.length, sectionStart + sectionPrefix.length + projection.length);
  assert.equal(section, projection);
  assert.match(systemPrompt, /knowledge descriptors; not callable tools/i);
  assert.match(systemPrompt, /return exactly one JSON object/i);
  assert.match(systemPrompt, /schema_version.*assistant_text.*skill_refs.*transfer_candidates/is);
  assert.match(systemPrompt, /no markdown|without markdown/i);
  assert.equal('tools' in requestBody, false);
  for (const sentinel of Object.values(sentinels)) assert.equal(section.includes(sentinel), false);

  assert.deepEqual(result, {
    provider: 'bankr_llm_gateway',
    text: 'Review this transfer suggestion.',
    skillRefs: ['bankr'],
    transferCandidates: [{
      skill: 'bankr',
      assetType: 'native',
      assetContract: null,
      recipient: RECIPIENT,
      amountBaseUnits: '1',
      rationale: 'Requested by the operator for review.',
    }],
  });
});

test('skill-aware Bankr decodes only assistant message content and fails malformed content to bounded text without candidates', async () => {
  const malformed = 'x'.repeat(5_000);
  const client = createBankrLlmClient({
    apiKey: 'test-key',
    skillProposalsEnabled: true,
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: malformed } }],
      content: [{ text: validEnvelope() }],
    }), { status: 200 }),
  });

  const result = await client.generate({ profile: { displayName: 'Bendr' }, message: 'Status?' });

  assert.equal(Buffer.byteLength(result.text, 'utf8'), 4_096);
  assert.deepEqual(result.skillRefs, []);
  assert.deepEqual(result.transferCandidates, []);
});
