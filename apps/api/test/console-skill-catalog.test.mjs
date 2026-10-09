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
  summary: 'Public market and verified-owner onchain reads are independently gated. The pinned official Bankr marketplace catalog adds 151 native and third-party skills as searchable review-only knowledge.',
  capabilities: [
    'public_market_reads',
    'owner_account_reads',
    'marketplace_skill_discovery',
    'transfer_proposals',
    'other_wallet_action_proposals',
  ],
  enabledCapabilities: [],
  execution: 'human_review',
  credentialAccess: false,
  constraints: [
    'Public market reads require the independent market gate and server-only read key.',
    'Owner reads require the independent account gate and a server-verified ERC-6551 public address.',
    'Orders, automation, deployment, fee, leverage, and other unscoped account status are never read directly.',
    'No Bankr wallet or credential reaches the model or browser.',
    'No write, wallet action, order, signature, submission, mutation, or raw transaction is executed.',
    'Write requests produce concise unsigned review proposals only.',
    'All 151 pinned marketplace skills are searchable; installs, payments, credentials, and side effects remain review-only.',
  ],
};

const HELIXA_DESCRIPTOR = {
  id: 'helixa',
  name: 'Helixa',
  summary: 'Public Helixa AgentDNA identity and Cred profile reader.',
  capabilities: ['agent_profile_read'],
  enabledCapabilities: [],
  execution: 'human_review',
  credentialAccess: false,
  constraints: [
    'Reads only fixed public Helixa agent profile fields.',
    'Profile results are display-only and grant no wallet authority.',
  ],
};

const CODEX_DESCRIPTOR = {
  id: 'codex',
  name: 'Looper Codex',
  summary: 'Deterministic evidence-backed reads from the reviewed Looper Codex artifact.',
  capabilities: ['verified_looper_codex_reads'],
  enabledCapabilities: [],
  execution: 'human_review',
  credentialAccess: false,
  constraints: [
    'Reads only the hash-pinned server-owned Looper Codex artifact.',
    'No credentials, writes, wallet authority, installation, or executable proposals.',
    'Unrecognized or ambiguous language never executes a Codex operation.',
  ],
};

const CRED_STAKING_DESCRIPTOR = {
  id: 'cred-pantheon-staking',
  name: 'CRED Pantheon Staking',
  summary: 'Explains and guides owner-reviewed CRED staking for activated Looper accounts through the guarded Multipass Console flow.',
  capabilities: ['cred_staking_guidance', 'owner_reviewed_stake_flow'],
  enabledCapabilities: [],
  execution: 'human_review',
  credentialAccess: false,
  constraints: [
    'Base 8453 only; CRED 0xAB3f23c2ABcB4E12Cc8B593C218A7ba64Ed17Ba3; vault 0xBf52Aaf8b6C82FaD0220B5378022eA4fC0a98fDb.',
    'Approval and stake are separate exact transactions confirmed by the owner.',
    'The owner Base Account signs and pays gas; CRED moves from the selected Looper account.',
    'Never transfer CRED directly to Pantheon or approve an unlimited amount.',
    'The Looper may explain and guide the Console flow; it never signs, submits, claims, exits, or stakes autonomously.',
    'Disclose the six-month lock, monthly reward timing, 5% claim fee, and normal 10% early-exit cost.',
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

test('returns exact frozen Bankr, Helixa, Codex, and CRED staking descriptors with a canonical catalog version', () => {
  const catalog = getConsoleSkillCatalog();

  assert.deepEqual(Object.keys(catalog).sort(), ['skills', 'version']);
  assert.equal(catalog.skills.length, 4);
  for (const descriptor of catalog.skills) {
    assert.deepEqual(Object.keys(descriptor).sort(), EXPECTED_DESCRIPTOR_KEYS);
  }
  assert.deepEqual(catalog.skills, [BANKR_DESCRIPTOR, HELIXA_DESCRIPTOR, CODEX_DESCRIPTOR, CRED_STAKING_DESCRIPTOR]);
  assert.deepEqual(catalog.skills[0].enabledCapabilities, []);
  assert.deepEqual(catalog.skills[1].enabledCapabilities, []);
  assert.deepEqual(catalog.skills[2].enabledCapabilities, []);
  assert.deepEqual(catalog.skills[3].enabledCapabilities, []);
  assert.ok(catalog.skills.every((skill) => skill.credentialAccess === false));
  assert.ok(catalog.skills.every((skill) => skill.execution === 'human_review'));
  assert.match(catalog.version, /^sha256:[a-f0-9]{64}$/);
  assert.equal(catalog.version, expectedVersion([BANKR_DESCRIPTOR, HELIXA_DESCRIPTOR, CODEX_DESCRIPTOR, CRED_STAKING_DESCRIPTOR]));
  assertRecursivelyFrozen(catalog);
  assertPlainJson(catalog);
});

test('projects market, verified-owner account, proposal, and Helixa capabilities independently', () => {
  const bankrEnabled = (options) => getConsoleSkillCatalog(options).skills[0].enabledCapabilities;
  assert.deepEqual(bankrEnabled({ marketReadEnabled: true }), ['read_public_market']);
  assert.deepEqual(bankrEnabled({ accountReadEnabled: true }), ['read_owner_account']);
  assert.deepEqual(bankrEnabled({ proposalEnabled: true }), ['discover_marketplace_skills', 'propose_transfer', 'propose_other_wallet_actions']);
  assert.deepEqual(bankrEnabled({
    marketReadEnabled: true,
    accountReadEnabled: true,
    proposalEnabled: true,
  }), [
    'read_public_market',
    'read_owner_account',
    'discover_marketplace_skills',
    'propose_transfer',
    'propose_other_wallet_actions',
  ]);
  assert.deepEqual(
    getConsoleSkillCatalog({ helixaReadEnabled: true }).skills[1].enabledCapabilities,
    ['agent_profile_read'],
  );
  assert.deepEqual(
    getConsoleSkillCatalog({ proposalEnabled: true }).skills[3].enabledCapabilities,
    ['explain_cred_staking', 'guide_owner_reviewed_stake'],
  );
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
test('Codex catalog capability is enabled iff runtime status is available', () => {
  const unavailable = getConsoleSkillCatalog({ codexReadEnabled: false });
  const available = getConsoleSkillCatalog({ codexReadEnabled: true });
  const codexUnavailable = unavailable.skills.find(({ id }) => id === 'codex');
  const codexAvailable = available.skills.find(({ id }) => id === 'codex');
  assert.deepEqual(codexUnavailable.enabledCapabilities, []);
  assert.deepEqual(codexAvailable.enabledCapabilities, ['read_verified_looper_codex']);
  assert.deepEqual(codexAvailable.capabilities, ['verified_looper_codex_reads']);
  assert.equal(codexAvailable.credentialAccess, false);
  assert.equal(codexAvailable.execution, 'human_review');
});
