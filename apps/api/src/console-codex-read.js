const TOKEN_MIN = 1;
const TOKEN_MAX = 7777;
const TRAIT_TEXT_MAX = 96;
const FILTER_MAX = 12;
const SEARCH_DEFAULT_LIMIT = 25;
const SIMILAR_DEFAULT_LIMIT = 10;
const SIMILAR_MAX_LIMIT = 25;
const FORMAT_MAX_BYTES = 4096;

const OPERATIONS = Object.freeze(new Set([
  'getTokenProfile',
  'explainTraits',
  'compareTokens',
  'findByTraits',
  'findSimilar',
  'getTraitStats',
  'getCollectionSummary',
]));

const WRITE_LIKE = /\b(?:approv(?:e|es|ed|ing)|buy(?:s|ing)?|bought|chang(?:e|es|ed|ing)|creat(?:e|es|ed|ing)|delet(?:e|es|ed|ing)|deploy(?:s|ed|ing)?|edit(?:s|ed|ing)?|execut(?:e|es|ed|ing)|install(?:s|ed|ing)?|list(?:s|ed|ing)?|mint(?:s|ed|ing)?|modif(?:y|ies|ied|ying)|pay(?:s|ing)?|paid|post(?:s|ed|ing)?|renam(?:e|es|ed|ing)|sell(?:s|ing)?|sold|send(?:s|ing)?|sent|set(?:s|ting)?|sign(?:s|ed|ing)?|submit(?:s|ted|ting)?|swap(?:s|ped|ping)?|transfer(?:s|red|ring)?|updat(?:e|es|ed|ing)|writ(?:e|es|ing)|wrote|written)\b/iu;
const PROMPT_INJECTION = /\b(?:act as|developer message|ignore (?:all |any |the )?(?:above|instructions|previous|prior|system)|jailbreak|prompt injection|reveal (?:the )?(?:prompt|system)|system prompt)\b/iu;
const COMPOUND_MARKER = /(?:[;\n\r]|&&|\|\||,\s*(?:and |then )|\b(?:after|also|before|but|then|while)\b|\b(?:along with|as well as|followed by)\b)/iu;

export function resolveConsoleCodexIntent(message, { selectedTokenId } = {}) {
  if (typeof message !== 'string') return null;
  const text = message.trim();
  if (!text || text.length > 2_048 || WRITE_LIKE.test(text) || PROMPT_INJECTION.test(text) || COMPOUND_MARKER.test(text)) {
    return null;
  }
  const selected = parseTokenId(selectedTokenId);
  return text.startsWith('/')
    ? resolveSlashIntent(text, selected)
    : resolveNaturalIntent(text, selected);
}

export function executeConsoleCodexIntent(intent, { runtime } = {}) {
  const normalized = validateIntent(intent);
  if (!runtime || typeof runtime.query !== 'function') {
    throw new TypeError('Codex intent requires an available runtime.');
  }
  return runtime.query(normalized.operation, normalized.input);
}

export function formatConsoleCodexResult(envelope) {
  assertEnvelope(envelope);
  const result = envelope.result;
  let body;
  switch (envelope.operation) {
    case 'getTokenProfile':
      body = formatProfile(result);
      break;
    case 'explainTraits':
      body = formatExplanation(result);
      break;
    case 'compareTokens':
      body = formatComparison(result);
      break;
    case 'findByTraits':
      body = formatTraitSearch(result);
      break;
    case 'findSimilar':
      body = formatSimilarity(result);
      break;
    case 'getTraitStats':
      body = formatTraitStats(result);
      break;
    case 'getCollectionSummary':
      body = formatCollectionSummary(result);
      break;
    default:
      throw new TypeError('Unsupported Codex result operation.');
  }
  const evidence = Array.isArray(envelope.evidence) ? envelope.evidence : [];
  const collectionFacts = evidence.filter((item) => item?.label === 'collection_fact').length;
  const interpretations = evidence.filter((item) => item?.label === 'codex_interpretation').length;
  const footer = `Artifact ${envelope.artifactHash.slice(0, 12)}; evidence ${evidence.length} (${collectionFacts} collection facts, ${interpretations} Codex interpretations).`;
  const boundedBody = capUtf8(body, FORMAT_MAX_BYTES - Buffer.byteLength(footer, 'utf8') - 2);
  return `${boundedBody}\n\n${footer}`;
}

function resolveSlashIntent(text, selectedTokenId) {
  let match = /^\/codex profile (\d+|mine|this Looper)$/iu.exec(text);
  if (match) return tokenIntent('getTokenProfile', match[1], selectedTokenId);
  match = /^\/codex explain (\d+|mine|this Looper)$/iu.exec(text);
  if (match) return tokenIntent('explainTraits', match[1], selectedTokenId);
  match = /^\/codex compare (\d+) (\d+)$/u.exec(text);
  if (match) return compareIntent(match[1], match[2]);
  match = /^\/codex find (.+)$/u.exec(text);
  if (match) return findIntent(match[1]);
  match = /^\/codex similar (\d+|mine|this Looper)(?: limit (\d+))?$/iu.exec(text);
  if (match) return similarIntent(match[1], match[2], selectedTokenId);
  match = /^\/codex stats (.+)$/u.exec(text);
  if (match) return statsIntent(match[1]);
  if (/^\/codex summary$/u.test(text)) return makeIntent('getCollectionSummary', {});
  return null;
}

function resolveNaturalIntent(text, selectedTokenId) {
  let match = /^(?:show (?:me )?the )?profile (?:for |of )?(#\d+|mine|this Looper)$/iu.exec(text);
  if (match) return tokenIntent('getTokenProfile', match[1], selectedTokenId);
  match = /^explain (?:the )?(?:profile (?:for |of )?)?(#\d+|mine|this Looper)$/iu.exec(text);
  if (match) return tokenIntent('explainTraits', match[1], selectedTokenId);
  match = /^compare (#\d+) (?:and|to|with) (#\d+)$/iu.exec(text);
  if (match) return compareIntent(match[1], match[2]);
  match = /^find Loopers with (.+)$/iu.exec(text);
  if (match) return findIntent(match[1]);
  match = /^(?:find Loopers similar to|find similar Loopers to) (#\d+|mine|this Looper)(?: limit (\d+))?$/iu.exec(text);
  if (match) return similarIntent(match[1], match[2], selectedTokenId);
  match = /^(?:trait )?stats for (.+)$/iu.exec(text);
  if (match) return statsIntent(match[1]);
  if (/^collection summary$/iu.test(text)) return makeIntent('getCollectionSummary', {});
  return null;
}

function tokenIntent(operation, reference, selectedTokenId) {
  const tokenId = resolveTokenReference(reference, selectedTokenId);
  return tokenId === null ? null : makeIntent(operation, { tokenId });
}

function compareIntent(left, right) {
  const leftTokenId = parseExplicitTokenId(left);
  const rightTokenId = parseExplicitTokenId(right);
  if (leftTokenId === null || rightTokenId === null || leftTokenId === rightTokenId) return null;
  return makeIntent('compareTokens', { leftTokenId, rightTokenId });
}

function findIntent(source) {
  const filters = parseTraits(source);
  return filters ? makeIntent('findByTraits', { filters, limit: SEARCH_DEFAULT_LIMIT }) : null;
}

function similarIntent(reference, limitSource, selectedTokenId) {
  const tokenId = resolveTokenReference(reference, selectedTokenId);
  const limit = limitSource === undefined ? SIMILAR_DEFAULT_LIMIT : parseBoundedInteger(limitSource, 1, SIMILAR_MAX_LIMIT);
  return tokenId === null || limit === null ? null : makeIntent('findSimilar', { tokenId, limit });
}

function statsIntent(source) {
  const filters = parseTraits(source);
  if (!filters || filters.length !== 1) return null;
  return makeIntent('getTraitStats', { traitType: filters[0].type, value: filters[0].value });
}

function parseTraits(source) {
  if (typeof source !== 'string' || source.length > FILTER_MAX * (TRAIT_TEXT_MAX * 2 + 8)) return null;
  const parts = source.split(/\s+and\s+/iu);
  if (parts.length < 1 || parts.length > FILTER_MAX) return null;
  const seen = new Set();
  const filters = [];
  for (const part of parts) {
    if ((part.match(/=/gu) ?? []).length !== 1) return null;
    const separator = part.indexOf('=');
    const type = part.slice(0, separator);
    const value = part.slice(separator + 1);
    if (!validTraitText(type) || !validTraitText(value)) return null;
    const key = `${type}\u0000${value}`;
    if (seen.has(key)) return null;
    seen.add(key);
    filters.push({ type, value });
  }
  return filters;
}

function validTraitText(value) {
  return value === value.trim()
    && value.length >= 1
    && value.length <= TRAIT_TEXT_MAX
    && !/[=;\n\r\u0000-\u001f\u007f]/u.test(value);
}

function resolveTokenReference(reference, selectedTokenId) {
  if (/^(?:mine|this Looper)$/iu.test(reference)) return selectedTokenId;
  return parseExplicitTokenId(reference);
}

function parseExplicitTokenId(value) {
  return parseTokenId(String(value).replace(/^#/u, ''));
}

function parseTokenId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const source = String(value);
  if (!/^\d+$/u.test(source)) return null;
  return parseBoundedInteger(source, TOKEN_MIN, TOKEN_MAX);
}

function parseBoundedInteger(value, minimum, maximum) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : null;
}

function makeIntent(operation, input) {
  return deepFreeze({ operation, input });
}

function validateIntent(intent) {
  if (!plainObject(intent) || !exactKeys(intent, ['operation', 'input']) || !OPERATIONS.has(intent.operation) || !plainObject(intent.input)) {
    throw new TypeError('Invalid Codex intent.');
  }
  switch (intent.operation) {
    case 'getTokenProfile':
    case 'explainTraits':
      requireExactInput(intent.input, ['tokenId']);
      requireToken(intent.input.tokenId);
      break;
    case 'compareTokens':
      requireExactInput(intent.input, ['leftTokenId', 'rightTokenId']);
      requireToken(intent.input.leftTokenId);
      requireToken(intent.input.rightTokenId);
      if (intent.input.leftTokenId === intent.input.rightTokenId) throw new TypeError('Invalid Codex intent.');
      break;
    case 'findByTraits':
      requireExactInput(intent.input, ['filters', 'limit']);
      if (!Array.isArray(intent.input.filters) || intent.input.filters.length < 1 || intent.input.filters.length > FILTER_MAX || intent.input.limit !== SEARCH_DEFAULT_LIMIT) {
        throw new TypeError('Invalid Codex intent.');
      }
      {
        const seen = new Set();
        for (const filter of intent.input.filters) {
          requireTrait(filter);
          const key = `${filter.type}\u0000${filter.value}`;
          if (seen.has(key)) throw new TypeError('Invalid Codex intent.');
          seen.add(key);
        }
      }
      break;
    case 'findSimilar':
      requireExactInput(intent.input, ['tokenId', 'limit']);
      requireToken(intent.input.tokenId);
      if (parseBoundedInteger(intent.input.limit, 1, SIMILAR_MAX_LIMIT) === null) throw new TypeError('Invalid Codex intent.');
      break;
    case 'getTraitStats':
      requireExactInput(intent.input, ['traitType', 'value']);
      requireTrait({ type: intent.input.traitType, value: intent.input.value });
      break;
    case 'getCollectionSummary':
      requireExactInput(intent.input, []);
      break;
    default:
      throw new TypeError('Invalid Codex intent.');
  }
  return intent;
}

function requireExactInput(input, keys) {
  if (!exactKeys(input, keys)) throw new TypeError('Invalid Codex intent input.');
}

function requireToken(tokenId) {
  if (parseTokenId(tokenId) !== tokenId) throw new TypeError('Invalid Codex intent token.');
}

function requireTrait(trait) {
  if (!plainObject(trait) || !exactKeys(trait, ['type', 'value']) || !validTraitText(trait.type) || !validTraitText(trait.value)) {
    throw new TypeError('Invalid Codex intent trait.');
  }
}

function assertEnvelope(envelope) {
  if (!plainObject(envelope)
    || !OPERATIONS.has(envelope.operation)
    || !/^[a-f0-9]{64}$/u.test(envelope.artifactHash)
    || !Array.isArray(envelope.evidence)
    || !plainObject(envelope.result)) {
    throw new TypeError('Invalid Codex result envelope.');
  }
}

function formatProfile(result) {
  const identity = plainObject(result.identity) ? result.identity : {};
  const interpretation = plainObject(result.interpretation) ? result.interpretation : {};
  const traits = formatTraitList(result.visualTraits, 12);
  const classLine = [interpretation.primaryClass, interpretation.secondaryClass, interpretation.specialization]
    .map((value) => safeText(value)).filter(Boolean).join(' · ');
  return [
    `${safeText(identity.canonicalName) || `Looper #${safeInteger(identity.tokenId) ?? '?'}`} verified profile.`,
    classLine ? `Class: ${classLine}.` : '',
    traits ? `Traits: ${traits}.` : 'Traits: none recorded.',
  ].filter(Boolean).join('\n');
}

function formatExplanation(result) {
  const traits = Array.isArray(result.traits) ? result.traits.slice(0, 12) : [];
  const lines = traits.map((trait) => {
    const label = formatTrait(trait);
    return label ? `- ${label}: ${formatFrequency(trait?.frequency)}` : null;
  }).filter(Boolean);
  return `Verified trait explanation for Looper #${safeInteger(result.tokenId) ?? '?'}: ${traits.length} trait${traits.length === 1 ? '' : 's'}.${lines.length ? `\n${lines.join('\n')}` : ''}`;
}

function formatComparison(result) {
  const left = safeInteger(result.left?.tokenId) ?? '?';
  const right = safeInteger(result.right?.tokenId) ?? '?';
  const shared = formatTraitList(result.sharedTraits, 8) || 'none';
  const onlyLeft = formatTraitList(result.onlyLeft, 8) || 'none';
  const onlyRight = formatTraitList(result.onlyRight, 8) || 'none';
  return `Looper #${left} vs Looper #${right}: ${safeInteger(result.sharedTraitCount) ?? 0} shared of ${safeInteger(result.unionTraitCount) ?? 0} union traits.\nShared: ${shared}.\nOnly #${left}: ${onlyLeft}.\nOnly #${right}: ${onlyRight}.`;
}

function formatTraitSearch(result) {
  const items = Array.isArray(result.items) ? result.items : [];
  const displayed = items.slice(0, 12).map((item) => `#${safeInteger(item?.tokenId) ?? '?'} ${safeText(item?.canonicalName)}`.trim());
  const continuation = result.nextCursor ? ' More verified matches are available.' : '';
  return `Verified trait search for ${formatTraitList(result.filters, FILTER_MAX) || 'the requested traits'} returned ${items.length} item${items.length === 1 ? '' : 's'} on this page.${displayed.length ? `\n${displayed.join(' · ')}` : ''}${continuation}`;
}

function formatSimilarity(result) {
  const items = Array.isArray(result.items) ? result.items : [];
  const lines = items.slice(0, 10).map((item) => {
    const tokenId = safeInteger(item?.tokenId) ?? '?';
    const score = safeInteger(item?.scorePpm);
    return `- #${tokenId} ${safeText(item?.canonicalName)} — ${score === null ? '?' : score} ppm; shared: ${formatTraitList(item?.sharedTraits, 6) || 'none'}`;
  });
  return `Verified similar Loopers for #${safeInteger(result.tokenId) ?? '?'}: ${items.length}.${lines.length ? `\n${lines.join('\n')}` : ' No matching Loopers.'}`;
}

function formatTraitStats(result) {
  const tokenIds = Array.isArray(result.tokenIds) ? result.tokenIds : [];
  const ids = tokenIds.slice(0, 20).map((value) => `#${safeInteger(value) ?? '?'}`).join(', ');
  return `Verified stats for ${formatTrait(result.trait) || 'the requested trait'}: ${formatFrequency(result.frequency)}. Matching token IDs: ${ids || 'none'}${tokenIds.length > 20 ? ` (+${tokenIds.length - 20} more)` : ''}.`;
}

function formatCollectionSummary(result) {
  const collection = plainObject(result.collection) ? result.collection : {};
  const traitTypes = Array.isArray(result.traitTypes) ? result.traitTypes : [];
  const types = traitTypes.slice(0, 16).map((entry) => `${safeText(entry?.type)} (${safeInteger(entry?.distinctValueCount) ?? 0} values)`).filter((entry) => !entry.startsWith(' ('));
  return `${safeText(collection.name) || 'Loopers'} verified collection summary: ${safeInteger(collection.count) ?? 0} tokens on chain ${safeInteger(collection.chainId) ?? '?'}. Trait types: ${types.join(', ') || 'none'}.`;
}

function formatFrequency(frequency) {
  const numerator = safeInteger(frequency?.numerator);
  const denominator = safeInteger(frequency?.denominator);
  const ppm = safeInteger(frequency?.ppm);
  if (numerator === null || denominator === null || ppm === null) return 'frequency unavailable';
  return `${numerator}/${denominator} (${ppm} ppm, ${(ppm / 10_000).toFixed(4)}%)`;
}

function formatTraitList(value, maximum) {
  if (!Array.isArray(value)) return '';
  return value.slice(0, maximum).map(formatTrait).filter(Boolean).join('; ');
}

function formatTrait(value) {
  if (!plainObject(value)) return '';
  const type = safeText(value.type);
  const traitValue = safeText(value.value);
  return type && traitValue ? `${type}=${traitValue}` : '';
}

function safeText(value) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]+/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 160)
    : '';
}

function safeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function capUtf8(value, maximum) {
  let output = String(value);
  while (Buffer.byteLength(output, 'utf8') > maximum) output = output.slice(0, -1);
  return output;
}

function exactKeys(value, expected) {
  const keys = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return keys.length === sorted.length && keys.every((key, index) => key === sorted[index]);
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
