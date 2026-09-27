import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  getConsoleSkillCatalog,
  getConsoleSkillCatalogPromptProjection,
} from '../src/console-skill-catalog.js';

const EXPECTED_DESCRIPTOR_KEYS = [
  'capabilities',
  'constraints',
  'credentialAccess',
  'enabledCapabilities',
  'execution',
  'id',
  'name',
  'summary',
].sort();

const BANKR_DESCRIPTOR = {
  id: 'bankr',
  name: 'Bankr',
  summary: 'Native Bankr reads for market, news, sentiment, portfolios, NFTs, Polymarket, positions, token/fee/deployment, and order status. Wallet-changing trading, transfer, bridge, NFT, betting, leverage, deployment, automation, and raw-transaction requests are unsigned review proposals only.',
  capabilities: [
    'market_news_sentiment',
    'portfolio_balances',
    'nfts',
    'polymarket',
    'positions_orders_automation',
    'token_fee_deployment_status',
    'transfer_proposals',
    'other_wallet_action_proposals',
  ],
  enabledCapabilities: [
    'read_market_news_sentiment',
    'read_portfolio_balances',
    'read_nfts',
    'read_polymarket',
    'read_positions_orders_automation',
    'read_token_fee_deployment_status',
    'propose_transfer',
    'propose_other_wallet_actions',
  ],
  execution: 'human_review',
  credentialAccess: false,
  constraints: [
    'Direct execution is limited to reads through the server-only read-only Bankr key.',
    'No Bankr wallet or credential reaches the model or browser.',
    'No write, wallet action, order, signature, submission, mutation, or raw transaction is executed.',
    'Write requests produce concise unsigned review proposals only.',
    'No arbitrary third-party marketplace skill is installed or executed.',
  ],
};

const HELIXA_DESCRIPTOR = {
  id: 'helixa',
  name: 'Helixa',
  summary: 'Public Helixa AgentDNA identity and Cred profile reader.',
  capabilities: ['agent_profile_read'],
  enabledCapabilities: ['agent_profile_read'],
  execution: 'human_review',
  credentialAccess: false,
  constraints: [
    'Reads only fixed public Helixa agent profile fields.',
    'Profile results are display-only and grant no wallet authority.',
  ],
};

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function expectedVersion(skills) {
  return `sha256:${createHash('sha256').update(canonicalize({ skills })).digest('hex')}`;
}

function assertRecursivelyFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertRecursivelyFrozen(child);
}

function assertPlainJson(value) {
  assert.notEqual(typeof value, 'function');
  assert.notEqual(typeof value, 'symbol');
  assert.notEqual(typeof value, 'bigint');
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const child of value) assertPlainJson(child);
    return;
  }
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const child of Object.values(value)) assertPlainJson(child);
}

function visit(value, callback, path = []) {
  callback(value, path);
  if (Array.isArray(value)) {
    value.forEach((child, index) => visit(child, callback, [...path, index]));
  } else if (value !== null && typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => visit(child, callback, [...path, key]));
  }
}

test('returns exact frozen Bankr and Helixa descriptors with a canonical catalog version', () => {
  const catalog = getConsoleSkillCatalog();

  assert.deepEqual(Object.keys(catalog).sort(), ['skills', 'version']);
  assert.equal(catalog.skills.length, 2);
  for (const descriptor of catalog.skills) {
    assert.deepEqual(Object.keys(descriptor).sort(), EXPECTED_DESCRIPTOR_KEYS);
  }
  assert.deepEqual(catalog.skills, [BANKR_DESCRIPTOR, HELIXA_DESCRIPTOR]);
  assert.ok(catalog.skills[0].enabledCapabilities.slice(0, 6).every((entry) => entry.startsWith('read_')));
  assert.ok(catalog.skills[0].enabledCapabilities.slice(6).every((entry) => entry.startsWith('propose_')));
  assert.deepEqual(catalog.skills[1].enabledCapabilities, ['agent_profile_read']);
  assert.ok(catalog.skills.every((skill) => skill.credentialAccess === false));
  assert.ok(catalog.skills.every((skill) => skill.execution === 'human_review'));
  assert.match(catalog.version, /^sha256:[a-f0-9]{64}$/);
  assert.equal(catalog.version, expectedVersion([BANKR_DESCRIPTOR, HELIXA_DESCRIPTOR]));
  assertRecursivelyFrozen(catalog);
  assertPlainJson(catalog);
});

test('pins descriptor collection and UTF-8 byte limits', () => {
  const { skills } = getConsoleSkillCatalog();

  for (const skill of skills) {
    assert.ok(Buffer.byteLength(skill.id, 'utf8') <= 32);
    assert.ok(Buffer.byteLength(skill.name, 'utf8') <= 64);
    assert.ok(Buffer.byteLength(skill.summary, 'utf8') <= 320);
    assert.ok(skill.capabilities.length <= 8);
    assert.ok(skill.capabilities.every((capability) => Buffer.byteLength(capability, 'utf8') <= 48));
    assert.ok(skill.constraints.length <= 8);
    assert.ok(skill.constraints.every((constraint) => Buffer.byteLength(constraint, 'utf8') <= 160));
  }
});

test('builds a recursively frozen prompt projection only from the closed server catalog', () => {
  const requestSentinel = 'REQUEST_INPUT_MUST_NOT_APPEAR';
  const apiKeySentinel = 'sk-request-api-key-must-not-appear';
  const skillFileSentinel = 'SKILL_MD_PRIVATE_INSTRUCTIONS_MUST_NOT_APPEAR';
  const previousEnvironmentValue = process.env.CONSOLE_SKILL_CATALOG_INJECTION;
  process.env.CONSOLE_SKILL_CATALOG_INJECTION = 'ENVIRONMENT_MUST_NOT_APPEAR';

  try {
    const projection = getConsoleSkillCatalogPromptProjection({
      requestBody: requestSentinel,
      apiKey: apiKeySentinel,
      arbitraryDescriptor: {
        id: 'attacker-skill',
        hiddenField: 'ARBITRARY_DESCRIPTOR_MUST_NOT_APPEAR',
        command: 'curl https://user:password@example.test',
        skillPath: '/home/ubuntu/.openclaw/workspace/skills/bankr/SKILL.md',
        skillMd: skillFileSentinel,
        execute() {},
      },
    });
    const serialized = JSON.stringify(projection);

    assert.deepEqual(projection, getConsoleSkillCatalog());
    assert.notStrictEqual(projection, getConsoleSkillCatalog());
    assert.notStrictEqual(projection.skills, getConsoleSkillCatalog().skills);
    assertRecursivelyFrozen(projection);
    assertPlainJson(projection);
    assert.doesNotMatch(serialized, new RegExp(requestSentinel));
    assert.doesNotMatch(serialized, new RegExp(apiKeySentinel));
    assert.doesNotMatch(serialized, /ENVIRONMENT_MUST_NOT_APPEAR/);
    assert.doesNotMatch(serialized, /ARBITRARY_DESCRIPTOR_MUST_NOT_APPEAR/);
    assert.doesNotMatch(serialized, new RegExp(skillFileSentinel));
    assert.doesNotMatch(serialized, /SKILL\.md/i);
    assert.doesNotMatch(serialized, /(?:^|[\\/])(?:home|Users|workspace|skills)(?:[\\/]|$)/i);
    assert.doesNotMatch(serialized, /\b(?:curl|wget|node|npm|pnpm|yarn|bash|sh)\b/i);
  } finally {
    if (previousEnvironmentValue === undefined) delete process.env.CONSOLE_SKILL_CATALOG_INJECTION;
    else process.env.CONSOLE_SKILL_CATALOG_INJECTION = previousEnvironmentValue;
  }
});

test('prompt projection contains no commands, secret-like fields, credentialed URLs, or executable values', () => {
  const projection = getConsoleSkillCatalogPromptProjection();
  const forbiddenKeys = /^(?:api[-_]?key|authorization|bearer|command|commands|execute|handler|password|private[-_]?key|procedure|secret|skill[-_]?md|token|tool|tools|url)$/i;

  visit(projection, (value, path) => {
    const key = path.at(-1);
    if (typeof key === 'string') assert.doesNotMatch(key, forbiddenKeys);
    assert.notEqual(typeof value, 'function');
    assert.notEqual(typeof value, 'symbol');
    assert.notEqual(typeof value, 'bigint');

    if (typeof value !== 'string') return;
    assert.doesNotMatch(value, /SKILL\.md/i);
    assert.doesNotMatch(value, /(?:^|\s)(?:curl|wget|node|npm|pnpm|yarn|bash|sh)(?:\s|$)/i);
    assert.doesNotMatch(value, /(?:^|[\\/])(?:home|Users|workspace|skills)(?:[\\/]|$)/i);
    assert.doesNotMatch(value, /^(?:javascript|data|file):/i);

    if (/^https?:\/\//i.test(value)) {
      const parsed = new URL(value);
      assert.equal(parsed.username, '');
      assert.equal(parsed.password, '');
    }
  });
});
