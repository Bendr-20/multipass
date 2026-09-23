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
    summary: 'Crypto market, wallet, trading, and token-operation specialist.',
    capabilities: ['market_research', 'portfolio_read', 'transfer', 'swap', 'token_launch'],
    enabledCapabilities: ['explain', 'propose_transfer'],
    execution: 'human_review',
    credentialAccess: false,
    constraints: [
      'No Bankr wallet is used for Looper funds.',
      'No Bankr API credential is exposed to the model or browser.',
      'Only exact ETH/ERC-20 transfer intents are executable in this release.',
    ],
  },
];

for (const descriptor of SERVER_SKILL_DESCRIPTORS) assertDescriptor(descriptor);

const CATALOG_SKILLS = deepFreezeJson(SERVER_SKILL_DESCRIPTORS);
const CATALOG_VERSION = `sha256:${createHash('sha256')
  .update(canonicalJson({ skills: CATALOG_SKILLS }), 'utf8')
  .digest('hex')}`;
const CONSOLE_SKILL_CATALOG = deepFreezeJson({
  version: CATALOG_VERSION,
  skills: CATALOG_SKILLS,
});
const CONSOLE_SKILL_CATALOG_PROMPT_PROJECTION = deepFreezeJson(cloneJson(CONSOLE_SKILL_CATALOG));

export function getConsoleSkillCatalog() {
  return CONSOLE_SKILL_CATALOG;
}

export function getConsoleSkillCatalogPromptProjection() {
  return CONSOLE_SKILL_CATALOG_PROMPT_PROJECTION;
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
