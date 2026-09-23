import { getAddress } from 'viem';

import { parseStrictJsonObject } from './strict-json-envelope.js';

const ENVELOPE_KEYS = ['assistant_text', 'schema_version', 'skill_refs', 'transfer_candidates'];
const CANDIDATE_KEYS = [
  'amountBaseUnits',
  'assetContract',
  'assetType',
  'rationale',
  'recipient',
  'skill',
];
const MAX_ASSISTANT_TEXT_BYTES = 4_096;
const MAX_RATIONALE_BYTES = 512;
const MAX_SKILL_ID_BYTES = 32;
const MAX_SKILL_REFS = 4;
const MAX_UINT256 = (1n << 256n) - 1n;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function decodeConsoleLlmEnvelope(content, { catalog } = {}) {
  const skills = indexFrozenCatalog(catalog);
  if (typeof content !== 'string' || content.trim().length === 0) return emptyResult();

  try {
    const envelope = parseStrictJsonObject(content);
    assertExactKeys(envelope, ENVELOPE_KEYS, 'Console LLM envelope');
    if (envelope.schema_version !== '0.1.0') {
      throw new TypeError('Console LLM envelope schema version is unsupported.');
    }
    assertBoundedString(envelope.assistant_text, 'assistant_text', MAX_ASSISTANT_TEXT_BYTES);

    const skillRefs = normalizeSkillRefs(envelope.skill_refs, skills);
    const transferCandidates = normalizeTransferCandidates(
      envelope.transfer_candidates,
      skillRefs,
      skills,
    );

    return deepFreezeJson({
      text: envelope.assistant_text,
      skillRefs,
      transferCandidates,
    });
  } catch {
    return deepFreezeJson({
      text: truncateUtf8(content.trim(), MAX_ASSISTANT_TEXT_BYTES),
      skillRefs: [],
      transferCandidates: [],
    });
  }
}

function normalizeSkillRefs(value, skills) {
  if (!Array.isArray(value) || value.length > MAX_SKILL_REFS) {
    throw new TypeError(`skill_refs must be an array with at most ${MAX_SKILL_REFS} items.`);
  }

  const seen = new Set();
  return value.map((skillId) => {
    assertBoundedString(skillId, 'skill reference', MAX_SKILL_ID_BYTES, { nonEmpty: true });
    if (seen.has(skillId)) throw new TypeError('skill_refs must not contain duplicates.');
    if (!skills.has(skillId)) throw new TypeError('skill_refs contains an unknown skill.');
    seen.add(skillId);
    return skillId;
  });
}

function normalizeTransferCandidates(value, skillRefs, skills) {
  if (!Array.isArray(value) || value.length > 1) {
    throw new TypeError('transfer_candidates must contain zero or one candidate.');
  }
  if (value.length === 0) return [];
  return [normalizeTransferCandidate(value[0], new Set(skillRefs), skills)];
}

function normalizeTransferCandidate(value, skillRefs, skills) {
  assertExactKeys(value, CANDIDATE_KEYS, 'transfer candidate');
  assertBoundedString(value.skill, 'candidate skill', MAX_SKILL_ID_BYTES, { nonEmpty: true });

  const skill = skills.get(value.skill);
  if (!skill || !skill.enabledCapabilities.includes('propose_transfer')) {
    throw new TypeError('Transfer candidate skill is unsupported.');
  }
  if (!skillRefs.has(value.skill)) {
    throw new TypeError('Transfer candidate skill must appear in skill_refs.');
  }

  const recipient = normalizeNonzeroAddress(value.recipient, 'recipient');
  const amountBaseUnits = normalizeAmount(value.amountBaseUnits);
  assertBoundedString(value.rationale, 'rationale', MAX_RATIONALE_BYTES);

  let assetContract;
  if (value.assetType === 'native') {
    if (value.assetContract !== null) {
      throw new TypeError('Native transfer candidates require a null assetContract.');
    }
    assetContract = null;
  } else if (value.assetType === 'erc20') {
    assetContract = normalizeNonzeroAddress(value.assetContract, 'assetContract');
  } else {
    throw new TypeError('Transfer candidate assetType is unsupported.');
  }

  return {
    skill: value.skill,
    assetType: value.assetType,
    assetContract,
    recipient,
    amountBaseUnits,
    rationale: value.rationale,
  };
}

function normalizeAmount(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new TypeError('amountBaseUnits must be a canonical positive decimal integer.');
  }
  const amount = BigInt(value);
  if (amount > MAX_UINT256) throw new TypeError('amountBaseUnits exceeds uint256.');
  return value;
}

function normalizeNonzeroAddress(value, field) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be an address string.`);
  let address;
  try {
    address = getAddress(value);
  } catch {
    throw new TypeError(`${field} must be a valid EVM address.`);
  }
  if (address.toLowerCase() === ZERO_ADDRESS) throw new TypeError(`${field} must not be the zero address.`);
  return address;
}

function indexFrozenCatalog(catalog) {
  if (!isFrozenObject(catalog) || !Array.isArray(catalog.skills) || !Object.isFrozen(catalog.skills)) {
    throw new TypeError('decodeConsoleLlmEnvelope requires a frozen catalog.');
  }

  const skills = new Map();
  for (const skill of catalog.skills) {
    if (
      !isFrozenObject(skill)
      || !Array.isArray(skill.enabledCapabilities)
      || !Object.isFrozen(skill.enabledCapabilities)
    ) {
      throw new TypeError('decodeConsoleLlmEnvelope requires a recursively frozen catalog.');
    }
    assertBoundedString(skill.id, 'catalog skill id', MAX_SKILL_ID_BYTES, { nonEmpty: true });
    if (skills.has(skill.id)) throw new TypeError('Frozen catalog skill IDs must be unique.');
    skills.set(skill.id, skill);
  }
  return skills;
}

function assertExactKeys(value, expectedKeys, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${field} must be a plain object.`);
  }
  const actualKeys = Object.keys(value).sort();
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new TypeError(`${field} contains unknown or missing fields.`);
  }
}

function assertBoundedString(value, field, maxBytes, { nonEmpty = false } = {}) {
  if (typeof value !== 'string' || (nonEmpty && value.length === 0)) {
    throw new TypeError(`${field} must be ${nonEmpty ? 'a non-empty ' : 'a '}string.`);
  }
  if (Buffer.byteLength(value, 'utf8') > maxBytes) {
    throw new TypeError(`${field} must be at most ${maxBytes} UTF-8 bytes.`);
  }
}

function truncateUtf8(value, maxBytes) {
  const encoded = Buffer.from(value, 'utf8');
  if (encoded.length <= maxBytes) return value;

  const decoder = new TextDecoder('utf-8', { fatal: true });
  let end = maxBytes;
  while (end > 0) {
    try {
      return decoder.decode(encoded.subarray(0, end));
    } catch {
      end -= 1;
    }
  }
  return '';
}

function emptyResult() {
  return deepFreezeJson({ text: '', skillRefs: [], transferCandidates: [] });
}

function isFrozenObject(value) {
  return value !== null && typeof value === 'object' && Object.isFrozen(value);
}

function deepFreezeJson(value) {
  if (value === null || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeJson(child);
  return Object.freeze(value);
}
