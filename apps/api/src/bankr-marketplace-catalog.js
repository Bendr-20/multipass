import { readFileSync } from 'node:fs';

const SNAPSHOT_URL = new URL('./bankr-marketplace-catalog.json', import.meta.url);
const MAX_QUERY_BYTES = 200;
const MAX_RESULTS = 20;
const EXPECTED_SOURCE = 'https://github.com/BankrBot/skills';
const EXPECTED_REVISION = 'd7b28f4caea71b446655ef991346f4860b95656a';
const SKILL_KEYS = [
  'credentialAccess',
  'description',
  'execution',
  'id',
  'name',
  'provider',
  'providerUrl',
  'sourcePath',
  'sourceRevision',
].sort();

const MARKETPLACE = loadSnapshot();

export function getBankrMarketplaceCatalog() {
  return MARKETPLACE;
}

export function searchBankrMarketplaceSkills(query, { limit = 8 } = {}) {
  const normalizedQuery = truncateUtf8(String(query ?? '').replace(/\s+/gu, ' ').trim(), MAX_QUERY_BYTES);
  const boundedLimit = Math.max(1, Math.min(MAX_RESULTS, Number.isInteger(limit) ? limit : 8));
  const terms = [...new Set(normalizedQuery.toLowerCase().match(/[a-z0-9][a-z0-9._-]{1,39}/gu) ?? [])].slice(0, 24);
  const ranked = terms.length === 0
    ? MARKETPLACE.skills.slice(0, boundedLimit)
    : MARKETPLACE.skills
      .map((skill) => ({ skill, score: scoreSkill(skill, normalizedQuery.toLowerCase(), terms) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.skill.id.localeCompare(right.skill.id))
      .slice(0, boundedLimit)
      .map((entry) => entry.skill);
  return deepFreeze({
    schemaVersion: 1,
    source: MARKETPLACE.source,
    sourceRevision: MARKETPLACE.sourceRevision,
    total: MARKETPLACE.skills.length,
    query: normalizedQuery,
    skills: ranked,
  });
}

function loadSnapshot() {
  const parsed = JSON.parse(readFileSync(SNAPSHOT_URL, 'utf8'));
  if (!isPlainObject(parsed)
    || parsed.schemaVersion !== 1
    || parsed.source !== EXPECTED_SOURCE
    || parsed.sourceRevision !== EXPECTED_REVISION
    || !Array.isArray(parsed.skills)
    || parsed.skills.length !== 151) {
    throw new TypeError('Invalid Bankr marketplace catalog snapshot.');
  }
  const seen = new Set();
  const skills = parsed.skills.map((skill) => validateSkill(skill, seen));
  return deepFreeze({
    schemaVersion: 1,
    source: EXPECTED_SOURCE,
    sourceRevision: EXPECTED_REVISION,
    skills,
  });
}

function validateSkill(skill, seen) {
  if (!isPlainObject(skill) || !sameKeys(skill, SKILL_KEYS)) throw new TypeError('Invalid Bankr marketplace skill descriptor.');
  const id = boundedText(skill.id, 80, 'skill id');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(id) || seen.has(id)) throw new TypeError('Invalid or duplicate Bankr marketplace skill id.');
  seen.add(id);
  const providerUrl = skill.providerUrl === null ? null : boundedText(skill.providerUrl, 300, 'provider URL');
  if (providerUrl !== null && !/^https:\/\/[^\s]+$/u.test(providerUrl)) throw new TypeError('Invalid Bankr marketplace provider URL.');
  if (skill.sourceRevision !== EXPECTED_REVISION || skill.execution !== 'review_only' || skill.credentialAccess !== false) {
    throw new TypeError('Unsafe Bankr marketplace execution descriptor.');
  }
  return {
    id,
    name: boundedText(skill.name, 100, 'skill name'),
    provider: boundedText(skill.provider, 100, 'skill provider'),
    providerUrl,
    description: boundedOptionalText(skill.description, 400),
    sourcePath: boundedText(skill.sourcePath, 160, 'skill source path'),
    sourceRevision: EXPECTED_REVISION,
    execution: 'review_only',
    credentialAccess: false,
  };
}

function scoreSkill(skill, normalizedQuery, terms) {
  const id = skill.id.toLowerCase();
  const name = skill.name.toLowerCase();
  const provider = skill.provider.toLowerCase();
  const description = skill.description.toLowerCase();
  let score = normalizedQuery === id || normalizedQuery === name ? 2_000 : 0;
  for (const term of terms) {
    if (id === term) score += 500;
    else if (id.startsWith(term)) score += 220;
    else if (id.includes(term)) score += 120;
    if (name === term) score += 400;
    else if (name.includes(term)) score += 100;
    if (provider === term) score += 80;
    else if (provider.includes(term)) score += 30;
    if (description.includes(term)) score += 10;
  }
  return score;
}

function boundedText(value, maxBytes, label) {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value, 'utf8') > maxBytes || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`Invalid ${label}.`);
  }
  return value;
}

function boundedOptionalText(value, maxBytes) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > maxBytes || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError('Invalid skill description.');
  }
  return value;
}

function truncateUtf8(value, maxBytes) {
  let output = '';
  let bytes = 0;
  for (const character of value) {
    const next = Buffer.byteLength(character, 'utf8');
    if (bytes + next > maxBytes) break;
    output += character;
    bytes += next;
  }
  return output;
}

function sameKeys(value, expected) {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
