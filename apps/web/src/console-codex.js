const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const OPERATIONS = ['getTokenProfile', 'explainTraits', 'findSimilar'];

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
    const artifactHash = String(state.artifactHash ?? '');
    const codexVersion = String(state.codexVersion ?? '');
    if (!HASH_PATTERN.test(artifactHash) || !VERSION_PATTERN.test(codexVersion)) throw new Error('invalid release');
    const envelopes = OPERATIONS.map((operation) => validateEnvelope(state[envelopeKey(operation)], { operation, artifactHash, codexVersion, selectedTokenId }));
    const [profileEnvelope, explanationEnvelope, similarityEnvelope] = envelopes;
    const profile = profileEnvelope.result;
    const explanation = explanationEnvelope.result;
    const similarity = similarityEnvelope.result;
    assertResultToken(profile?.identity?.tokenId, selectedTokenId);
    assertResultToken(explanation?.tokenId, selectedTokenId);
    assertResultToken(similarity?.tokenId, selectedTokenId);

    const interpretation = isRecord(profile.interpretation) ? profile.interpretation : {};
    return {
      status: 'ready', selectedTokenId, artifactHash, codexVersion,
      identity: {
        canonicalName: cleanText(profile.identity?.canonicalName, `Looper #${selectedTokenId}`),
        description: cleanText(profile.identity?.description),
      },
      facts: compactEntries([
        ['Primary class', interpretation.primaryClass],
        ['Secondary class', interpretation.secondaryClass],
        ['Specialization', interpretation.specialization],
      ]),
      visualTraits: normalizeVisualTraits(profile.visualTraits),
      personality: {
        traits: compactEntries([
          ['Risk', formatScale(interpretation.risk)],
          ['Autonomy', formatScale(interpretation.autonomy)],
          ['Voice', interpretation.voice],
        ]),
        quirks: cleanTextList(interpretation.quirks),
        communicationStyle: cleanTextList(interpretation.communicationStyle),
        values: cleanTextList(interpretation.values),
        humor: cleanTextList(interpretation.humor),
      },
      lore: compactEntries([
        ['Origin', interpretation.origin],
        ['Mission bias', interpretation.missionBias],
        ['Short lore', interpretation.shortLore],
        ['Long lore', interpretation.longLore],
        ['First mission', interpretation.firstMission],
      ]),
      recommendations: normalizeRecommendations(interpretation.recommendedSkills),
      rarity: normalizeRarity(explanation.traits),
      similar: normalizeSimilar(similarity.items),
    };
  } catch {
    return { status: 'error', selectedTokenId, retryAvailable: true };
  }
}

export function renderConsoleCodexWorkspace(input = {}) {
  const state = input?.status === 'ready' && input?.identity ? input : normalizeConsoleCodexState(input);
  const tokenLabel = state.selectedTokenId ? `Looper #${state.selectedTokenId}` : 'selected Looper';
  if (state.status === 'loading') {
    return `
      <section class="console-codex-workspace console-codex-state console-codex-loading" aria-busy="true" aria-live="polite">
        <span class="console-gate-eyebrow">Verified identity</span>
        <h2>Loading verified Codex…</h2>
        <p>Checking the published identity release for ${escapeHtml(tokenLabel)}.</p>
        <div class="console-codex-loading-bars" aria-hidden="true"><i></i><i></i><i></i></div>
      </section>
    `;
  }
  if (state.status === 'unavailable') return renderFailureState('Verified Codex is unavailable right now', 'The selected Looper stays available while the verified release is checked again.');
  if (state.status !== 'ready') return renderFailureState('Verified Codex could not be loaded', 'No unverified identity details were shown. Try the verified read again.');

  const shortHash = state.artifactHash.slice(0, 12);
  return `<section class="console-codex-workspace" aria-labelledby="console-codex-title">
    <header class="console-codex-header">
      <div><span class="console-gate-eyebrow">Verified Codex</span><h2 id="console-codex-title">${escapeHtml(state.identity.canonicalName)}</h2>${state.identity.description ? `<p>${escapeHtml(state.identity.description)}</p>` : ''}</div>
      <div class="console-codex-proof">Token #${escapeHtml(state.selectedTokenId)} · Verified artifact ${escapeHtml(shortHash)} · Codex ${escapeHtml(state.codexVersion)}</div>
    </header>
    ${renderFacts(state.facts)}
    ${renderRecommendations(state.recommendations)}
    <div class="console-codex-drawers">
      ${renderDrawer('Visual traits', 'visual', renderVisualTraits(state.visualTraits), state.visualTraits.length ? `${state.visualTraits.length} traits` : 'None published')}
      ${renderDrawer('Personality', 'personality', renderPersonality(state.personality), summaryCount(state.personality))}
      ${renderDrawer('Lore', 'lore', renderEntries(state.lore, 'No verified lore published.'), state.lore.length ? `${state.lore.length} facts` : 'None published')}
      ${renderDrawer('Rarity', 'rarity', renderRarity(state.rarity), state.rarity.length ? `${state.rarity.length} frequencies` : 'None published')}
      ${renderDrawer('Similar Loopers', 'similar', renderSimilar(state.similar), state.similar.length ? `Top ${state.similar.length}` : 'No matches')}
    </div>
  </section>`;
}

function validateEnvelope(envelope, { operation, artifactHash, codexVersion, selectedTokenId }) {
  if (!isRecord(envelope) || envelope.schemaVersion !== '1.0.0' || envelope.operation !== operation
    || envelope.artifactHash !== artifactHash || envelope.codexVersion !== codexVersion
    || !Array.isArray(envelope.evidence) || !isRecord(envelope.result)
    || !Array.isArray(envelope.subjectIds) || envelope.subjectIds.length !== 1
    || normalizeTokenId(envelope.subjectIds[0]) !== selectedTokenId) throw new Error('invalid envelope');
  return envelope;
}

function envelopeKey(operation) {
  return operation === 'getTokenProfile' ? 'profile' : operation === 'explainTraits' ? 'explanation' : 'similarity';
}

function assertResultToken(value, selectedTokenId) {
  if (normalizeTokenId(value) !== selectedTokenId) throw new Error('mixed token');
}

function normalizeVisualTraits(value) {
  return (Array.isArray(value) ? value : []).slice(0, 64).flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const type = cleanText(entry.type);
    const traitValue = cleanText(entry.value);
    return type && traitValue ? [{ type, value: traitValue }] : [];
  });
}

function normalizeRarity(value) {
  return (Array.isArray(value) ? value : []).slice(0, 64).flatMap((entry) => {
    if (!isRecord(entry) || !isRecord(entry.frequency)) return [];
    const type = cleanText(entry.type);
    const traitValue = cleanText(entry.value);
    const numerator = safeInteger(entry.frequency.numerator);
    const denominator = safeInteger(entry.frequency.denominator);
    const ppm = safeInteger(entry.frequency.ppm);
    if (!type || !traitValue || numerator === null || denominator === null || denominator <= 0 || ppm === null) return [];
    return [{ type, value: traitValue, numerator, denominator, ppm }];
  });
}

function normalizeRecommendations(value) {
  return (Array.isArray(value) ? value : []).slice(0, 24).flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const family = cleanText(entry.family);
    const skill = cleanText(entry.skill);
    return family && skill ? [{ family, skill, status: formatStatus(entry.status) }] : [];
  });
}

function normalizeSimilar(value) {
  return (Array.isArray(value) ? value : []).slice(0, 10).flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const tokenId = normalizeTokenId(entry.tokenId);
    if (!tokenId) return [];
    return [{ tokenId, canonicalName: cleanText(entry.canonicalName, `Looper #${tokenId}`), scorePpm: safeInteger(entry.scorePpm), sharedTraits: normalizeVisualTraits(entry.sharedTraits).slice(0, 8) }];
  });
}

function renderFailureState(title, body) {
  return `<section class="console-codex-workspace console-codex-state" role="status"><span class="console-gate-eyebrow">Verified identity</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p><button type="button" data-action="retry-console-codex">Retry verified Codex</button></section>`;
}

function renderFacts(facts) {
  return facts.length ? `<dl class="console-codex-facts">${facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>` : '';
}

function renderRecommendations(recommendations) {
  return `<section class="console-codex-recommendations" data-codex-section="recommendations" aria-labelledby="console-codex-recommendations-title"><div><span class="console-gate-eyebrow">Skill families</span><h3 id="console-codex-recommendations-title">Recommended skills</h3></div>${recommendations.length ? `<ul>${recommendations.map((item) => `<li><span>${escapeHtml(item.family)}</span><strong>${escapeHtml(item.skill)}</strong><small>${escapeHtml(item.status)}</small></li>`).join('')}</ul>` : '<p>No verified skill recommendations published.</p>'}</section>`;
}

function renderDrawer(title, section, body, summary) {
  return `<details class="console-codex-drawer"><summary><strong>${escapeHtml(title)}</strong><span>${escapeHtml(summary)}</span></summary><div class="console-codex-drawer-body" data-codex-section="${escapeAttribute(section)}">${body}</div></details>`;
}

function renderVisualTraits(traits) {
  if (!traits.length) return '<p class="console-codex-empty">No verified visual traits published.</p>';
  return `<ul class="console-codex-traits">${traits.map((trait) => `<li><span>${escapeHtml(trait.type)}</span><strong>${escapeHtml(trait.value)}</strong></li>`).join('')}</ul>`;
}

function renderPersonality(personality) {
  const groups = [
    ...personality.traits.map(([label, value]) => `<div class="console-codex-personality-fact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`),
    ...[['Quirks', personality.quirks], ['Communication', personality.communicationStyle], ['Values', personality.values], ['Humor', personality.humor]]
      .filter(([, values]) => values.length)
      .map(([label, values]) => `<div class="console-codex-personality-list"><span>${escapeHtml(label)}</span><p>${values.map(escapeHtml).join(' · ')}</p></div>`),
  ];
  return groups.length ? `<div class="console-codex-personality">${groups.join('')}</div>` : '<p class="console-codex-empty">No verified personality facts published.</p>';
}

function renderEntries(entries, emptyText) {
  return entries.length ? `<dl class="console-codex-entry-list">${entries.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>` : `<p class="console-codex-empty">${escapeHtml(emptyText)}</p>`;
}

function renderRarity(rarity) {
  if (!rarity.length) return '<p class="console-codex-empty">No verified trait frequencies published.</p>';
  return `<ul class="console-codex-rarity">${rarity.map((entry) => `<li><span><strong>${escapeHtml(entry.type)}</strong> · ${escapeHtml(entry.value)}</span><small>${formatNumber(entry.numerator)} / ${formatNumber(entry.denominator)} · ${formatNumber(entry.ppm)} ppm</small></li>`).join('')}</ul>`;
}

function renderSimilar(similar) {
  if (!similar.length) return '<p class="console-codex-empty">No similar Loopers found.</p>';
  return `<ol class="console-codex-similar">${similar.map((item) => `<li data-codex-similar-token="${escapeAttribute(item.tokenId)}"><span><strong>${escapeHtml(item.canonicalName)}</strong><small>Token #${escapeHtml(item.tokenId)}</small></span>${item.scorePpm === null ? '' : `<small>${formatNumber(item.scorePpm)} ppm match</small>`}${item.sharedTraits.length ? `<p>${item.sharedTraits.map((trait) => `${escapeHtml(trait.type)}: ${escapeHtml(trait.value)}`).join(' · ')}</p>` : ''}</li>`).join('')}</ol>`;
}

function summaryCount(personality) {
  const count = personality.traits.length + personality.quirks.length + personality.communicationStyle.length + personality.values.length + personality.humor.length;
  return count ? `${count} facts` : 'None published';
}

function compactEntries(entries) {
  return entries.flatMap(([label, value]) => { const text = cleanText(value); return text ? [[label, text]] : []; });
}

function cleanTextList(value) {
  return (Array.isArray(value) ? value : []).slice(0, 32).map((entry) => cleanText(entry)).filter(Boolean);
}

function cleanText(value, fallback = '') {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;
  const text = String(value).trim().slice(0, 2000);
  return text || fallback;
}

function formatScale(value) {
  if (!isRecord(value)) return '';
  const label = cleanText(value.label);
  const score = safeInteger(value.value);
  if (label && score !== null) return `${label} (${score})`;
  return label || (score === null ? '' : String(score));
}

function formatStatus(value) {
  const status = cleanText(value).toLowerCase();
  return !status || status === 'recommended' ? 'Recommended' : 'Candidate';
}

function normalizeTokenId(value) {
  const tokenId = String(value ?? '').trim();
  return /^(?:0|[1-9]\d*)$/u.test(tokenId) ? tokenId : null;
}

function safeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function formatNumber(value) { return new Intl.NumberFormat('en-US').format(value); }
function isRecord(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('=', '&#61;').replaceAll('\"', '&quot;').replaceAll("'", '&#39;');
}

function escapeAttribute(value) { return escapeHtml(value).replaceAll('`', '&#96;'); }
