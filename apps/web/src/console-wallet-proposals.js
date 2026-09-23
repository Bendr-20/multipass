const CATALOG_KEYS = ['skills', 'version'];
const SKILL_KEYS = [
  'capabilities',
  'constraints',
  'credentialAccess',
  'enabledCapabilities',
  'execution',
  'id',
  'name',
  'summary',
];
const CANDIDATE_KEYS = [
  'amountBaseUnits',
  'assetContract',
  'assetType',
  'participantId',
  'rationale',
  'recipient',
  'skill',
  'skillRefs',
  'sourceMessageId',
  'sourceOrdinal',
];
const MAX_UINT256 = (1n << 256n) - 1n;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const CAPABILITY_LABELS = Object.freeze({
  market_research: 'Market research',
  portfolio_read: 'Portfolio read',
  transfer: 'Transfer',
  swap: 'Swap',
  token_launch: 'Token launch',
  explain: 'Explanations',
  propose_transfer: 'Transfer',
});

export function createConsoleCapabilityViewModel(capabilities) {
  assertExactKeys(capabilities, CATALOG_KEYS, 'capability catalog');
  assertBoundedString(capabilities.version, 'capability catalog version', 96, { nonEmpty: true });
  if (!Array.isArray(capabilities.skills) || capabilities.skills.length === 0 || capabilities.skills.length > 8) {
    throw new TypeError('capability catalog skills must contain between 1 and 8 items.');
  }

  const seen = new Set();
  const skills = capabilities.skills.map((skill) => {
    validateSkill(skill, seen);
    return {
      id: skill.id,
      name: skill.name,
      understands: skill.capabilities.map(formatCapabilityLabel),
      canPropose: skill.enabledCapabilities
        .filter((capability) => capability.startsWith('propose_'))
        .map(formatCapabilityLabel),
      cannotExecuteDirectly: 'Human review required. Catalog knowledge does not execute tools.',
    };
  });

  return deepFreeze({ skills });
}

export function createUnverifiedTransferSuggestion(candidate, { capabilities, messages, participants } = {}) {
  const capabilityModel = createConsoleCapabilityViewModel(capabilities);
  assertExactKeys(candidate, CANDIDATE_KEYS, 'transfer candidate');
  assertBoundedString(candidate.skill, 'candidate skill', 32, { nonEmpty: true });
  assertBoundedString(candidate.sourceMessageId, 'candidate sourceMessageId', 160, { nonEmpty: true });
  assertBoundedString(candidate.participantId, 'candidate participantId', 160, { nonEmpty: true });
  assertBoundedString(candidate.rationale, 'candidate rationale', 512);
  assertAddress(candidate.recipient, 'candidate recipient');
  assertAmount(candidate.amountBaseUnits);

  if (candidate.assetType === 'native') {
    if (candidate.assetContract !== null) throw new TypeError('native candidate assetContract must be null.');
  } else if (candidate.assetType === 'erc20') {
    assertAddress(candidate.assetContract, 'candidate assetContract');
  } else {
    throw new TypeError('candidate assetType is unsupported.');
  }
  if (candidate.sourceOrdinal !== 0) {
    throw new TypeError('candidate sourceOrdinal is invalid.');
  }
  if (!Array.isArray(candidate.skillRefs) || candidate.skillRefs.length === 0 || candidate.skillRefs.length > 4) {
    throw new TypeError('candidate skillRefs is invalid.');
  }
  const skillRefs = new Set();
  for (const skillRef of candidate.skillRefs) {
    assertBoundedString(skillRef, 'candidate skillRef', 32, { nonEmpty: true });
    if (skillRefs.has(skillRef)) throw new TypeError('candidate skillRefs contains duplicates.');
    skillRefs.add(skillRef);
  }

  const knownSkills = new Set(capabilityModel.skills.map((entry) => entry.id));
  const skill = capabilityModel.skills.find((entry) => entry.id === candidate.skill);
  if (
    !skill
    || !skillRefs.has(candidate.skill)
    || [...skillRefs].some((skillRef) => !knownSkills.has(skillRef))
    || !skill.canPropose.includes('Transfer')
  ) {
    throw new TypeError('candidate skill provenance is invalid.');
  }
  const messageMatches = (Array.isArray(messages) ? messages : []).filter((entry) => (
    entry?.role === 'agent'
    && String(entry.id ?? '') === candidate.sourceMessageId
    && String(entry.participantId ?? '') === candidate.participantId
  ));
  const participantMatches = (Array.isArray(participants) ? participants : []).filter((entry) => (
    String(entry?.participantId ?? '') === candidate.participantId
  ));
  if (messageMatches.length !== 1 || participantMatches.length !== 1) {
    throw new TypeError('candidate message and participant provenance is invalid.');
  }
  const participant = participantMatches[0];
  const participantLabel = String(participant.displayName ?? participant.agentName ?? '').trim();
  assertBoundedString(participantLabel, 'candidate participant label', 160, { nonEmpty: true });

  return deepFreeze({
    heading: 'Unverified transfer suggestion — awaiting server verification',
    assetType: candidate.assetType,
    assetContract: candidate.assetContract,
    recipient: candidate.recipient,
    amountBaseUnits: candidate.amountBaseUnits,
    rationale: candidate.rationale,
    skill: { id: skill.id, name: skill.name },
    participant: { id: candidate.participantId, label: participantLabel },
    sourceMessage: { id: candidate.sourceMessageId },
  });
}

export function renderConsoleCapabilitySurface(model) {
  if (!model?.skills?.length) return '';
  return `
    <aside class="console-skill-capabilities" aria-label="Skill capability knowledge">
      ${model.skills.map((skill) => `
        <section class="console-skill-capability">
          <span class="console-skill-badge">${escapeHtml(skill.name)} catalog knowledge</span>
          <dl>
            <div><dt>Understands</dt><dd>${escapeHtml(skill.understands.join(' · ') || 'No catalog entries')}</dd></div>
            <div><dt>Can propose</dt><dd>${escapeHtml(skill.canPropose.join(' · ') || 'Nothing enabled')}</dd></div>
            <div><dt>Cannot execute directly</dt><dd>${escapeHtml(skill.cannotExecuteDirectly)}</dd></div>
          </dl>
        </section>
      `).join('')}
    </aside>
  `;
}

export function renderUnverifiedTransferSuggestion(model) {
  if (!model) return '';
  return `
    <article class="console-unverified-transfer" aria-label="Unverified transfer suggestion">
      <header>
        <span class="console-skill-badge">${escapeHtml(model.skill.name)} catalog knowledge</span>
        <strong>${escapeHtml(model.heading)}</strong>
      </header>
      <dl class="console-unverified-transfer-grid">
        <div><dt>Asset type</dt><dd>${escapeHtml(model.assetType)}</dd></div>
        ${model.assetContract === null
          ? '<div><dt>Asset contract</dt><dd>None (native)</dd></div>'
          : `<div><dt>Asset contract</dt><dd><code>${escapeHtml(model.assetContract)}</code></dd></div>`}
        <div><dt>Recipient</dt><dd><code>${escapeHtml(model.recipient)}</code></dd></div>
        <div><dt>Base-unit amount</dt><dd><code>${escapeHtml(model.amountBaseUnits)}</code></dd></div>
        <div><dt>Participant</dt><dd>${escapeHtml(model.participant.label)}</dd></div>
        <div><dt>Source message</dt><dd><code>${escapeHtml(model.sourceMessage.id)}</code></dd></div>
      </dl>
      <p>${escapeHtml(model.rationale)}</p>
    </article>
  `;
}

function validateSkill(skill, seen) {
  assertExactKeys(skill, SKILL_KEYS, 'capability skill');
  assertBoundedString(skill.id, 'capability skill id', 32, { nonEmpty: true });
  assertBoundedString(skill.name, 'capability skill name', 64, { nonEmpty: true });
  assertBoundedString(skill.summary, 'capability skill summary', 320, { nonEmpty: true });
  if (seen.has(skill.id)) throw new TypeError('capability skill ids must be unique.');
  seen.add(skill.id);
  assertStringList(skill.capabilities, 'capability skill capabilities', 8, 48);
  assertStringList(skill.enabledCapabilities, 'capability skill enabledCapabilities', 8, 48);
  assertStringList(skill.constraints, 'capability skill constraints', 8, 160);
  if (skill.execution !== 'human_review' || skill.credentialAccess !== false) {
    throw new TypeError('capability skill must remain human-review knowledge without credential access.');
  }
}

function assertStringList(value, field, maxItems, maxBytes) {
  if (!Array.isArray(value) || value.length > maxItems) throw new TypeError(`${field} is invalid.`);
  const seen = new Set();
  for (const item of value) {
    assertBoundedString(item, `${field} item`, maxBytes, { nonEmpty: true });
    if (seen.has(item)) throw new TypeError(`${field} contains duplicates.`);
    seen.add(item);
  }
}

function assertExactKeys(value, expectedKeys, field) {
  if (!isPlainObject(value)) throw new TypeError(`${field} must be a plain object.`);
  const keys = Object.keys(value).sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    throw new TypeError(`${field} contains unknown or missing fields.`);
  }
}

function assertBoundedString(value, field, maxBytes, { nonEmpty = false } = {}) {
  if (typeof value !== 'string' || (nonEmpty && value.length === 0)) throw new TypeError(`${field} must be a string.`);
  if (new TextEncoder().encode(value).byteLength > maxBytes) throw new TypeError(`${field} exceeds ${maxBytes} UTF-8 bytes.`);
}

function assertAddress(value, field) {
  if (typeof value !== 'string' || !ADDRESS_PATTERN.test(value) || value.toLowerCase() === ZERO_ADDRESS) {
    throw new TypeError(`${field} must be a nonzero EVM address.`);
  }
}

function assertAmount(value) {
  assertBoundedString(value, 'candidate amountBaseUnits', 78, { nonEmpty: true });
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || BigInt(value) > MAX_UINT256) {
    throw new TypeError('candidate amountBaseUnits must be a canonical positive uint256 string.');
  }
}

function formatCapabilityLabel(value) {
  return CAPABILITY_LABELS[value] ?? String(value).replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
