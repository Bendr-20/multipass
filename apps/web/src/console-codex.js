const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)$/u;
const COLLECTION_COUNT = 7777;
const RECOMMENDATION_MAP_VERSION = 'looper-skill-map-v01';
const OPERATIONS = ['getTokenProfile', 'explainTraits', 'findSimilar'];
const ENVELOPE_KEYS = ['schemaVersion', 'artifactHash', 'codexVersion', 'operation', 'subjectIds', 'evidence', 'result'];
const PROFILE_KEYS = ['identity', 'visualTraits', 'interpretation', 'versions'];
const IDENTITY_KEYS = ['tokenId', 'canonicalName', 'description', 'image', 'externalUrl'];
const INTERPRETATION_KEYS = ['primaryClass', 'secondaryClass', 'specialization', 'risk', 'autonomy', 'voice', 'quirks', 'communicationStyle', 'values', 'humor', 'origin', 'missionBias', 'shortLore', 'longLore', 'activationSeed', 'firstMission', 'firstMissions', 'recommendedSkills'];
const EXPLANATION_KEYS = ['tokenId', 'traits'];
const EXPLAINED_TRAIT_KEYS = ['type', 'value', 'frequency', 'evidenceId', 'interpretation'];
const TRAIT_INTERPRETATION_KEYS = ['archetype', 'role', 'narrativeSeed', 'voice', 'values', 'missionBias', 'riskDelta', 'autonomyDelta', 'label'];
const SIMILARITY_KEYS = ['tokenId', 'items'];
const SIMILAR_ITEM_KEYS = ['tokenId', 'canonicalName', 'intersectionWeight', 'unionWeight', 'scorePpm', 'sharedTraits'];

export function normalizeConsoleCodexState(state = {}) {
  const status = String(state?.status ?? 'idle');
  const selectedTokenId = normalizeTokenId(state?.selectedTokenId);
  if (status !== 'ready') {
    if (status === 'loading') return { status, selectedTokenId };
    if (status === 'unavailable' || status === 'error') return { status, selectedTokenId, retryAvailable: true };
    return { status: 'unavailable', selectedTokenId, retryAvailable: true };
  }

  try {
    if (!selectedTokenId) throw new Error('missing token');
    const artifactHash = requireHash(state.artifactHash, 'artifact hash');
    const codexVersion = requireVersion(state.codexVersion, 'Codex version');
    const envelopes = OPERATIONS.map((operation) => validateEnvelope(state[envelopeKey(operation)], {
      operation, artifactHash, codexVersion, selectedTokenId,
    }));
    const [profileEnvelope, explanationEnvelope, similarityEnvelope] = envelopes;
    const profile = validateProfileResult(profileEnvelope.result, { selectedTokenId, codexVersion });
    const explanation = validateExplanationResult(explanationEnvelope.result, {
      selectedTokenId, evidence: explanationEnvelope.evidence, visualTraits: profile.visualTraits,
    });
    const similarity = validateSimilarityResult(similarityEnvelope.result, { selectedTokenId });
    const interpretation = profile.interpretation;
    const evidence = envelopes.flatMap((envelope) => envelope.evidence);

    return {
      status: 'ready', selectedTokenId, artifactHash, codexVersion,
      identity: {
        canonicalName: profile.identity.canonicalName,
      },
      facts: compactEntries([
        ['Primary class', interpretation.primaryClass],
        ['Secondary class', interpretation.secondaryClass],
        ['Specialization', interpretation.specialization],
        ['Risk', formatScale(interpretation.risk)],
        ['Autonomy', formatScale(interpretation.autonomy)],
      ]),
      visualTraits: profile.visualTraits.map(({ type, value }) => ({ type, value })),
      personality: {
        traits: compactEntries([
          ['Risk', formatScale(interpretation.risk)],
          ['Autonomy', formatScale(interpretation.autonomy)],
          ['Voice', interpretation.voice],
        ]),
        quirks: [...interpretation.quirks],
        communicationStyle: [...interpretation.communicationStyle],
        values: [...interpretation.values],
        humor: [...interpretation.humor],
      },
      lore: compactEntries([
        ['Origin', interpretation.origin],
        ['Mission bias', interpretation.missionBias],
        ['Short lore', interpretation.shortLore],
        ['Long lore', interpretation.longLore],
        ['Activation seed', interpretation.activationSeed],
        ['First mission', interpretation.firstMission],
        ['First missions', interpretation.firstMissions.join(' · ')],
      ]),
      recommendations: interpretation.recommendedSkills.map((entry) => ({ ...entry })),
      rarity: explanation.traits.map((entry) => ({
        type: entry.type,
        value: entry.value,
        ...entry.frequency,
        evidenceLabel: evidenceDisplayLabel(entry.evidenceLabel),
      })),
      similar: similarity.items.slice(0, 10).map((entry) => ({
        tokenId: String(entry.tokenId),
        canonicalName: entry.canonicalName,
        scorePpm: entry.scorePpm,
        sharedTraits: entry.sharedTraits.map(({ type, value }) => ({ type, value })),
      })),
      evidenceCount: evidence.length,
    };
  } catch {
    return { status: 'error', selectedTokenId, retryAvailable: true };
  }
}

export function renderConsoleCodexWorkspace(input = {}) {
  const state = input?.status === 'ready' && input?.identity ? input : normalizeConsoleCodexState(input);
  const tokenLabel = state.selectedTokenId ? 'Looper #' + state.selectedTokenId : 'selected Looper';
  if (state.status === 'loading') {
    return       '<section class="console-codex-workspace console-codex-state console-codex-loading" aria-busy="true" aria-live="polite">' +
        '<span class="console-gate-eyebrow">Verified identity</span>' +
        '<h2>Loading verified Codex…</h2>' +
        '<p>Checking the published identity release for ' + escapeHtml(tokenLabel) + '.</p>' +
        '<div class="console-codex-loading-bars" aria-hidden="true"><i></i><i></i><i></i></div>' +
      '</section>';
  }
  if (state.status === 'unavailable') return renderFailureState('Verified Codex is unavailable right now', 'The selected Looper stays available while the verified release is checked again.');
  if (state.status !== 'ready') return renderFailureState('Verified Codex could not be loaded', 'No unverified identity details were shown. Try the verified read again.');

  const shortHash = state.artifactHash.slice(0, 12);
  return '<section class="console-codex-workspace" aria-labelledby="console-codex-title">' +
    '<header class="console-codex-header">' +
      '<div><span class="console-gate-eyebrow">Verified Codex</span><h2 id="console-codex-title">' + escapeHtml(state.identity.canonicalName) + '</h2><p>Verified identity derived from this Looper&#39;s published traits.</p></div>' +
      '<div class="console-codex-proof">Token #' + escapeHtml(state.selectedTokenId) + ' · Verified artifact ' + escapeHtml(shortHash) + ' · Codex ' + escapeHtml(state.codexVersion) + ' · ' + formatNumber(state.evidenceCount) + ' evidence records</div>' +
    '</header>' +
    renderFacts(state.facts) +
    renderRecommendations(state.recommendations) +
    '<div class="console-codex-drawers">' +
      renderDrawer('Visual traits', 'visual', renderVisualTraits(state.visualTraits), state.visualTraits.length ? state.visualTraits.length + ' traits' : 'None published') +
      renderDrawer('Personality', 'personality', renderPersonality(state.personality), summaryCount(state.personality)) +
      renderDrawer('Lore', 'lore', renderEntries(state.lore, 'No verified lore published.'), state.lore.length ? state.lore.length + ' facts' : 'None published') +
      renderDrawer('Rarity', 'rarity', renderRarity(state.rarity), state.rarity.length ? state.rarity.length + ' frequencies' : 'None published') +
      renderDrawer('Similar Loopers', 'similar', renderSimilar(state.similar), state.similar.length ? 'Top ' + state.similar.length : 'No matches') +
    '</div>' +
  '</section>';
}

function validateEnvelope(envelope, { operation, artifactHash, codexVersion, selectedTokenId }) {
  requireExactRecord(envelope, ENVELOPE_KEYS, operation + ' envelope');
  if (envelope.schemaVersion !== '1.0.0' || envelope.operation !== operation
    || envelope.artifactHash !== artifactHash || envelope.codexVersion !== codexVersion) throw new Error('invalid envelope release');
  requireExactArray(envelope.subjectIds, operation + ' subject IDs');
  if (envelope.subjectIds.length !== 1 || requireTokenId(envelope.subjectIds[0], 'subject token') !== Number(selectedTokenId)) throw new Error('invalid envelope subject');
  requireExactRecord(envelope.result, resultKeys(operation), operation + ' result');
  validateEvidence(envelope.evidence);
  return envelope;
}

function validateProfileResult(profile, { selectedTokenId, codexVersion }) {
  requireExactRecord(profile, PROFILE_KEYS, 'profile result');
  requireExactRecord(profile.identity, IDENTITY_KEYS, 'profile identity');
  if (requireTokenId(profile.identity.tokenId, 'profile token') !== Number(selectedTokenId)) throw new Error('mixed profile token');
  requireText(profile.identity.canonicalName, 'canonical name', 128);
  if (profile.identity.canonicalName !== 'Looper #' + profile.identity.tokenId) throw new Error('noncanonical profile name');
  requireText(profile.identity.description, 'description', 2000);
  requireExactRecord(profile.identity.image, ['url', 'id'], 'profile image');
  requireText(profile.identity.image.url, 'image URL', 512);
  requireText(profile.identity.image.id, 'image ID', 128);
  requireText(profile.identity.externalUrl, 'external URL', 512);

  validateTraitArray(profile.visualTraits, 'profile visual traits', { min: 1, max: 64 });
  requireExactRecord(profile.interpretation, INTERPRETATION_KEYS, 'profile interpretation');
  const value = profile.interpretation;
  requireText(value.primaryClass, 'primary class', 96);
  if (value.secondaryClass !== null) requireText(value.secondaryClass, 'secondary class', 96);
  requireText(value.specialization, 'specialization', 256);
  validateScale(value.risk, 'risk');
  validateScale(value.autonomy, 'autonomy');
  for (const key of ['voice', 'origin', 'missionBias', 'shortLore', 'longLore', 'activationSeed', 'firstMission']) requireText(value[key], key, 2000);
  if (!/^[a-f0-9]{32}$/u.test(value.activationSeed)) throw new Error('invalid activation seed');
  for (const key of ['quirks', 'communicationStyle', 'values', 'humor']) validateTextArray(value[key], key, { max: 32 });
  validateTextArray(value.firstMissions, 'first missions', { min: 1, max: 32 });
  if (!value.firstMissions.includes(value.firstMission)) throw new Error('first missions mismatch');
  requireExactArray(value.recommendedSkills, 'recommended skills');
  if (value.recommendedSkills.length > 24) throw new Error('too many recommendations');
  for (const recommendation of value.recommendedSkills) {
    requireExactRecord(recommendation, ['skillFamily', 'reason', 'sourceClass', 'mapVersion', 'status'], 'skill recommendation');
    requireText(recommendation.skillFamily, 'skill family', 128);
    requireText(recommendation.reason, 'recommendation reason', 512);
    requireText(recommendation.sourceClass, 'recommendation source class', 96);
    requireVersion(recommendation.mapVersion, 'recommendation map version');
    if (recommendation.sourceClass !== value.primaryClass || recommendation.mapVersion !== RECOMMENDATION_MAP_VERSION || recommendation.status !== 'recommended') throw new Error('recommendation contract mismatch');
  }
  requireExactRecord(profile.versions, ['traitCodexVersion', 'classModelVersion'], 'profile versions');
  if (requireVersion(profile.versions.traitCodexVersion, 'trait Codex version') !== codexVersion) throw new Error('trait Codex version mismatch');
  requireVersion(profile.versions.classModelVersion, 'class model version');
  return profile;
}

function validateExplanationResult(explanation, { selectedTokenId, evidence, visualTraits }) {
  requireExactRecord(explanation, EXPLANATION_KEYS, 'trait explanation result');
  if (requireTokenId(explanation.tokenId, 'explanation token') !== Number(selectedTokenId)) throw new Error('mixed explanation token');
  requireExactArray(explanation.traits, 'explained traits');
  if (explanation.traits.length !== visualTraits.length) throw new Error('trait explanation coverage mismatch');
  const normalizedTraits = explanation.traits.map((entry, index) => {
    requireExactRecord(entry, EXPLAINED_TRAIT_KEYS, 'explained trait');
    validateTrait(entry, 'explained trait');
    if (entry.type !== visualTraits[index].type || entry.value !== visualTraits[index].value) throw new Error('explained trait mismatch');
    validateFrequency(entry.frequency);
    requireText(entry.evidenceId, 'trait evidence ID', 256);
    requireExactRecord(entry.interpretation, TRAIT_INTERPRETATION_KEYS, 'trait interpretation');
    for (const key of ['archetype', 'role', 'narrativeSeed', 'voice', 'values', 'missionBias']) requireText(entry.interpretation[key], 'trait ' + key, 2000);
    for (const key of ['riskDelta', 'autonomyDelta']) {
      if (!Number.isSafeInteger(entry.interpretation[key])) throw new Error('invalid trait delta');
    }
    if (entry.interpretation.label !== 'codex_interpretation') throw new Error('invalid interpretation label');
    const collectionEvidence = evidence.find((item) => item.id === entry.evidenceId && item.kind === 'trait' && item.label === 'collection_fact');
    if (!collectionEvidence) throw new Error('missing collection evidence');
    return { ...entry, evidenceLabel: collectionEvidence.label };
  });
  return { tokenId: explanation.tokenId, traits: normalizedTraits };
}

function validateSimilarityResult(similarity, { selectedTokenId }) {
  requireExactRecord(similarity, SIMILARITY_KEYS, 'similarity result');
  if (requireTokenId(similarity.tokenId, 'similarity token') !== Number(selectedTokenId)) throw new Error('mixed similarity token');
  requireExactArray(similarity.items, 'similarity items');
  if (similarity.items.length > 25) throw new Error('too many similarity items');
  const seen = new Set();
  for (const item of similarity.items) {
    requireExactRecord(item, SIMILAR_ITEM_KEYS, 'similarity item');
    const tokenId = requireTokenId(item.tokenId, 'similar token');
    if (tokenId === Number(selectedTokenId) || seen.has(tokenId)) throw new Error('invalid similar token');
    seen.add(tokenId);
    requireText(item.canonicalName, 'similar canonical name', 128);
    if (item.canonicalName !== 'Looper #' + tokenId) throw new Error('noncanonical similar name');
    const intersection = requireDecimal(item.intersectionWeight, 'intersection weight');
    const union = requireDecimal(item.unionWeight, 'union weight');
    if (intersection <= 0n || union <= 0n || intersection > union) throw new Error('invalid similarity weights');
    if (!Number.isSafeInteger(item.scorePpm) || item.scorePpm < 0 || item.scorePpm > 1_000_000
      || item.scorePpm !== Number((intersection * 1_000_000n) / union)) throw new Error('invalid similarity score');
    validateTraitArray(item.sharedTraits, 'shared traits', { min: 1, max: 64 });
  }
  return similarity;
}

function validateEvidence(evidence) {
  requireExactArray(evidence, 'envelope evidence');
  let prior = null;
  for (const item of evidence) {
    requireExactRecord(item, ['id', 'kind', 'label'], 'evidence record');
    requireText(item.id, 'evidence ID', 256);
    if (!['token', 'trait', 'collection'].includes(item.kind) || !item.id.startsWith(item.kind + ':')) throw new Error('invalid evidence kind');
    if (!['collection_fact', 'codex_interpretation'].includes(item.label)) throw new Error('invalid evidence label');
    const sortKey = item.id + '\0' + item.label;
    if (prior !== null && sortKey <= prior) throw new Error('evidence is not canonical');
    prior = sortKey;
  }
}

function validateFrequency(frequency) {
  requireExactRecord(frequency, ['numerator', 'denominator', 'ppm'], 'trait frequency');
  const { numerator, denominator, ppm } = frequency;
  if (!Number.isSafeInteger(numerator) || numerator < 1 || numerator > COLLECTION_COUNT
    || denominator !== COLLECTION_COUNT || !Number.isSafeInteger(ppm)
    || ppm !== Math.floor((numerator * 1_000_000 + denominator / 2) / denominator)) throw new Error('invalid trait frequency');
}

function validateScale(value, label) {
  requireExactRecord(value, ['value', 'label'], label);
  if (!Number.isSafeInteger(value.value) || value.value < 0 || value.value > 10) throw new Error('invalid ' + label + ' value');
  requireText(value.label, label + ' label', 96);
}

function validateTraitArray(value, label, { min = 0, max = 64 } = {}) {
  requireExactArray(value, label);
  if (value.length < min || value.length > max) throw new Error('invalid ' + label + ' length');
  for (const trait of value) {
    requireExactRecord(trait, ['type', 'value'], label + ' item');
    validateTrait(trait, label + ' item');
  }
}

function validateTrait(value, label) {
  requireText(value.type, label + ' type', 96);
  requireText(value.value, label + ' value', 96);
}

function validateTextArray(value, label, { min = 0, max = 32 } = {}) {
  requireExactArray(value, label);
  if (value.length < min || value.length > max) throw new Error('invalid ' + label + ' length');
  for (const entry of value) requireText(entry, label + ' item', 2000);
}

function requireExactRecord(value, expectedKeys, label) {
  if (!isRecord(value)) throw new TypeError(label + ' must be a plain object');
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(label + ' has unknown or missing fields');
  return value;
}

function requireExactArray(value, label) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError(label + ' must be a plain array');
  return value;
}

function requireText(value, label, max) {
  if (typeof value !== 'string' || value !== value.trim() || value.length < 1 || value.length > max) throw new TypeError(label + ' must be bounded text');
  return value;
}

function requireHash(value, label) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) throw new TypeError(label + ' must be lowercase 64-hex');
  return value;
}

function requireVersion(value, label) {
  if (typeof value !== 'string' || !VERSION_PATTERN.test(value)) throw new TypeError(label + ' is invalid');
  return value;
}

function requireTokenId(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > COLLECTION_COUNT) throw new RangeError(label + ' is outside the collection');
  return value;
}

function requireDecimal(value, label) {
  if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value)) throw new TypeError(label + ' must be decimal');
  return BigInt(value);
}

function resultKeys(operation) {
  if (operation === 'getTokenProfile') return PROFILE_KEYS;
  if (operation === 'explainTraits') return EXPLANATION_KEYS;
  return SIMILARITY_KEYS;
}

function envelopeKey(operation) {
  return operation === 'getTokenProfile' ? 'profile' : operation === 'explainTraits' ? 'explanation' : 'similarity';
}

function renderFailureState(title, body) {
  return '<section class="console-codex-workspace console-codex-state" role="status"><span class="console-gate-eyebrow">Verified identity</span><h2>' + escapeHtml(title) + '</h2><p>' + escapeHtml(body) + '</p><button type="button" data-action="retry-console-codex">Retry verified Codex</button></section>';
}

function renderFacts(facts) {
  return facts.length ? '<dl class="console-codex-facts">' + facts.map(([label, value]) => '<div><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(value) + '</dd></div>').join('') + '</dl>' : '';
}

function renderRecommendations(recommendations) {
  return '<section class="console-codex-recommendations" data-codex-section="recommendations" aria-labelledby="console-codex-recommendations-title"><div><span class="console-gate-eyebrow">Skill families</span><h3 id="console-codex-recommendations-title">Recommended skill families</h3></div>' + (recommendations.length ? '<ul>' + recommendations.map((item) => '<li><strong>' + escapeHtml(item.skillFamily) + '</strong><p>' + escapeHtml(item.reason) + '</p><small>' + escapeHtml(item.sourceClass) + ' · ' + escapeHtml(item.mapVersion) + ' · ' + escapeHtml(formatStatus(item.status)) + '</small></li>').join('') + '</ul>' : '<p>No verified skill recommendations published.</p>') + '</section>';
}

function renderDrawer(title, section, body, summary) {
  return '<details class="console-codex-drawer"><summary><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(summary) + '</span></summary><div class="console-codex-drawer-body" data-codex-section="' + escapeAttribute(section) + '">' + body + '</div></details>';
}

function renderVisualTraits(traits) {
  if (!traits.length) return '<p class="console-codex-empty">No verified visual traits published.</p>';
  return '<ul class="console-codex-traits">' + traits.map((trait) => '<li><span>' + escapeHtml(trait.type) + '</span><strong>' + escapeHtml(trait.value) + '</strong></li>').join('') + '</ul>';
}

function renderPersonality(personality) {
  const groups = [
    ...personality.traits.map(([label, value]) => '<div class="console-codex-personality-fact"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>'),
    ...[['Quirks', personality.quirks], ['Communication', personality.communicationStyle], ['Values', personality.values], ['Humor', personality.humor]]
      .filter(([, values]) => values.length)
      .map(([label, values]) => '<div class="console-codex-personality-list"><span>' + escapeHtml(label) + '</span><p>' + values.map(escapeHtml).join(' · ') + '</p></div>'),
  ];
  return groups.length ? '<div class="console-codex-personality">' + groups.join('') + '</div>' : '<p class="console-codex-empty">No verified personality facts published.</p>';
}

function renderEntries(entries, emptyText) {
  return entries.length ? '<dl class="console-codex-entry-list">' + entries.map(([label, value]) => '<div><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(value) + '</dd></div>').join('') + '</dl>' : '<p class="console-codex-empty">' + escapeHtml(emptyText) + '</p>';
}

function renderRarity(rarity) {
  if (!rarity.length) return '<p class="console-codex-empty">No verified trait frequencies published.</p>';
  return '<ul class="console-codex-rarity">' + rarity.map((entry) => '<li><span><strong>' + escapeHtml(entry.type) + '</strong> · ' + escapeHtml(entry.value) + '</span><small><b>' + escapeHtml(entry.evidenceLabel) + '</b> · ' + formatNumber(entry.numerator) + ' / ' + formatNumber(entry.denominator) + ' · ' + formatNumber(entry.ppm) + ' ppm</small></li>').join('') + '</ul>';
}

function renderSimilar(similar) {
  if (!similar.length) return '<p class="console-codex-empty">No similar Loopers found.</p>';
  return '<ol class="console-codex-similar">' + similar.map((item) => '<li data-codex-similar-token="' + escapeAttribute(item.tokenId) + '"><span><strong>' + escapeHtml(item.canonicalName) + '</strong><small>Token #' + escapeHtml(item.tokenId) + '</small></span><small>' + formatNumber(item.scorePpm) + ' ppm match</small>' + (item.sharedTraits.length ? '<p>' + item.sharedTraits.map((trait) => escapeHtml(trait.type) + ': ' + escapeHtml(trait.value)).join(' · ') + '</p>' : '') + '</li>').join('') + '</ol>';
}

function summaryCount(personality) {
  const count = personality.traits.length + personality.quirks.length + personality.communicationStyle.length + personality.values.length + personality.humor.length;
  return count ? count + ' facts' : 'None published';
}

function compactEntries(entries) {
  return entries.flatMap(([label, value]) => { const text = cleanText(value); return text ? [[label, text]] : []; });
}

function cleanText(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim().slice(0, 2000);
}

function formatScale(value) { return value.label + ' (' + value.value + ')'; }
function formatStatus(value) { return value === 'recommended' ? 'Recommended' : 'Candidate'; }
function evidenceDisplayLabel(value) { return value === 'collection_fact' ? 'Collection evidence' : 'Codex interpretation'; }

function normalizeTokenId(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 1 && value <= COLLECTION_COUNT ? String(value) : null;
  const tokenId = String(value ?? '').trim();
  return /^[1-9]\d{0,3}$/u.test(tokenId) && Number(tokenId) <= COLLECTION_COUNT ? tokenId : null;
}

function formatNumber(value) { return new Intl.NumberFormat('en-US').format(value); }
function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('=', '&#61;').replaceAll('\"', '&quot;').replaceAll("'", '&#39;');
}

function escapeAttribute(value) { return escapeHtml(value).replaceAll('`', '&#96;'); }
