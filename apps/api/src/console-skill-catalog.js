import { createHash } from 'node:crypto';

const DESCRIPTOR_KEYS = [
  'capabilities',
  'constraints',
  'credentialAccess',
  'enabledCapabilities',
  'execution',
  'id',
  'name',
  'summary',
].sort();

const LIMITS = Object.freeze({
  capabilityBytes: 48,
  capabilityCount: 8,
  constraintBytes: 160,
  constraintCount: 8,
  idBytes: 32,
  nameBytes: 64,
  summaryBytes: 320,
});

const SERVER_SKILL_DESCRIPTORS = [
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
];

for (const descriptor of SERVER_SKILL_DESCRIPTORS) assertDescriptor(descriptor);

const CATALOG_CACHE = new Map();

export function getConsoleSkillCatalog(options = {}) {
  const gates = normalizeCatalogGates(options);
  const cacheKey = JSON.stringify(gates);
  if (CATALOG_CACHE.has(cacheKey)) return CATALOG_CACHE.get(cacheKey);
  const skills = cloneJson(SERVER_SKILL_DESCRIPTORS);
  skills[0].enabledCapabilities = [
    ...(gates.marketReadEnabled ? ['read_public_market'] : []),
    ...(gates.accountReadEnabled ? ['read_owner_account'] : []),
    ...(gates.proposalEnabled ? ['discover_marketplace_skills', 'propose_transfer', 'propose_other_wallet_actions'] : []),
  ];
  skills[1].enabledCapabilities = gates.helixaReadEnabled ? ['agent_profile_read'] : [];
  skills[2].enabledCapabilities = gates.codexReadEnabled ? ['read_verified_looper_codex'] : [];
  skills[3].enabledCapabilities = gates.proposalEnabled
    ? ['explain_cred_staking', 'guide_owner_reviewed_stake']
    : [];
  for (const descriptor of skills) assertDescriptor(descriptor);
  const frozenSkills = deepFreezeJson(skills);
  const catalog = deepFreezeJson({
    version: `sha256:${createHash('sha256')
      .update(canonicalJson({ skills: frozenSkills }), 'utf8')
      .digest('hex')}`,
    skills: frozenSkills,
  });
  CATALOG_CACHE.set(cacheKey, catalog);
  return catalog;
}

export function getConsoleSkillCatalogPromptProjection(options = {}) {
  return deepFreezeJson(cloneJson(getConsoleSkillCatalog(options)));
}

function normalizeCatalogGates(options) {
  return {
    marketReadEnabled: options?.marketReadEnabled === true,
    accountReadEnabled: options?.accountReadEnabled === true,
    proposalEnabled: options?.proposalEnabled === true,
    helixaReadEnabled: options?.helixaReadEnabled === true,
    codexReadEnabled: options?.codexReadEnabled === true,
  };
}

function assertDescriptor(descriptor) {
  assertPlainObject(descriptor, 'skill descriptor');
  const keys = Object.keys(descriptor).sort();
  if (keys.length !== DESCRIPTOR_KEYS.length || keys.some((key, index) => key !== DESCRIPTOR_KEYS[index])) {
    throw new TypeError('skill descriptor must contain only the approved fields.');
  }

  assertBoundedText(descriptor.id, 'skill id', LIMITS.idBytes);
  assertBoundedText(descriptor.name, 'skill name', LIMITS.nameBytes);
  assertBoundedText(descriptor.summary, 'skill summary', LIMITS.summaryBytes);
  assertBoundedTextList(
    descriptor.capabilities,
    'skill capabilities',
    LIMITS.capabilityCount,
    LIMITS.capabilityBytes,
  );
  assertBoundedTextList(
    descriptor.enabledCapabilities,
    'skill enabled capabilities',
    LIMITS.capabilityCount,
    LIMITS.capabilityBytes,
  );
  assertBoundedTextList(
    descriptor.constraints,
    'skill constraints',
    LIMITS.constraintCount,
    LIMITS.constraintBytes,
  );

  if (descriptor.credentialAccess !== false) {
    throw new TypeError('skill credentialAccess must be false.');
  }
  if (descriptor.execution !== 'human_review') {
    throw new TypeError('skill execution must be human_review.');
  }
}

function assertPlainObject(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${field} must be a plain object.`);
  }
}

function assertBoundedText(value, field, maxBytes) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
  if (Buffer.byteLength(value, 'utf8') > maxBytes) {
    throw new TypeError(`${field} must be at most ${maxBytes} UTF-8 bytes.`);
  }
}

function assertBoundedTextList(value, field, maxItems, maxItemBytes) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new TypeError(`${field} must contain at most ${maxItems} items.`);
  }
  const seen = new Set();
  for (const item of value) {
    assertBoundedText(item, `${field} item`, maxItemBytes);
    if (seen.has(item)) throw new TypeError(`${field} must not contain duplicates.`);
    seen.add(item);
  }
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  assertPlainObject(value, 'canonical JSON value');
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreezeJson(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (const child of value) deepFreezeJson(child);
  } else {
    assertPlainObject(value, 'catalog value');
    for (const child of Object.values(value)) deepFreezeJson(child);
  }
  return Object.freeze(value);
}
