export const LOOPER_STATUS_HUD_STORAGE_KEY = 'multipass.loopers.statusHud';

export const SAMPLE_LOOPER_STATUS_CARD = {
  tokenName: 'Looper #14',
  imageUrl: getPublicAssetPath('loopers/approved-only-agent-14.png'),
  imageAlt: 'Approved Looper layer composite #14',
  traits: ['OpenClaw Hoodie', 'Zombie', 'Robot Eyes'],
  status: {
    activation: 'Active Agent',
    credScore: null,
    credTier: 'Pending',
    walletValueUsd: null,
    tokenBoundAccount: '0x12...9F',
    scoredAt: 'Pending',
    proofState: 'pending',
  },
};

export function getInitialLooperStatusHudVisible(storage = getBrowserStorage()) {
  if (!storage) return true;
  try {
    return storage.getItem(LOOPER_STATUS_HUD_STORAGE_KEY) !== 'hidden';
  } catch {
    return true;
  }
}

export function setLooperStatusHudVisible(visible, storage = getBrowserStorage()) {
  if (!storage) return;
  try {
    storage.setItem(LOOPER_STATUS_HUD_STORAGE_KEY, visible ? 'visible' : 'hidden');
  } catch {
    // Local UI preference only. Ignore unavailable storage.
  }
}

export function renderLooperStatusCard(card = SAMPLE_LOOPER_STATUS_CARD, options = {}) {
  const hudVisible = options.hudVisible !== false;
  const status = normalizeStatus(card.status);
  const traits = Array.isArray(card.traits) ? card.traits.slice(0, 3) : [];
  return `
    <section class="looper-status-card" aria-label="Looper live status preview" data-hud="${hudVisible ? 'visible' : 'hidden'}">
      <div class="looper-status-frame">
        <img class="looper-status-art" src="${escapeAttribute(card.imageUrl)}" alt="${escapeAttribute(card.imageAlt ?? card.tokenName ?? 'Looper art')}" />
        ${hudVisible ? renderLooperStatusHud(card, status) : ''}
        <button class="looper-status-toggle" type="button" data-action="toggle-looper-status-hud" aria-pressed="${hudVisible ? 'true' : 'false'}">
          ${hudVisible ? 'Hide status' : 'Show status'}
        </button>
      </div>
      <div class="looper-status-caption">
        <strong>${escapeHtml(card.tokenName ?? 'Looper')}</strong>
        ${traits.length ? `<span>${escapeHtml(traits.join(' / '))}</span>` : ''}
      </div>
    </section>
  `;
}

function renderLooperStatusHud(card, status) {
  return `
    <div class="looper-status-hud" aria-label="Live agent status overlay">
      <div class="looper-status-badge"><span></span>${escapeHtml(status.activation)}</div>
      <dl class="looper-status-readout">
        ${renderStatusField('Cred', status.credLabel, status.proofState === 'verified' ? 'verified' : 'pending')}
        ${renderStatusField('Tier', status.credTier)}
        ${renderStatusField('Wallet', status.walletValueLabel)}
        ${renderStatusField('TBA', status.tokenBoundAccount)}
        ${renderStatusField('Scored', status.scoredAt)}
        ${renderStatusField('Proof', status.proofLabel, status.proofState)}
      </dl>
    </div>
  `;
}

function renderStatusField(label, value, tone = '') {
  return `
    <div class="${tone ? `tone-${escapeAttribute(tone)}` : ''}">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

export function normalizeStatus(status = {}) {
  const rawCredScore = status.credScore;
  const credScore = rawCredScore === null || rawCredScore === undefined || rawCredScore === ''
    ? null
    : (Number.isFinite(Number(rawCredScore)) ? Math.max(0, Math.min(100, Number(rawCredScore))) : null);
  const proofState = normalizeProofState(status.proofState);
  const credLabel = proofState === 'invalid' ? 'Proof invalid' : (credScore === null ? 'Pending' : String(Math.round(credScore)));
  const credTier = proofState === 'invalid' ? 'Untrusted' : (status.credTier ?? (credScore === null ? 'Pending' : getCredTier(credScore)));
  return {
    activation: status.activation ?? 'Not Activated',
    credLabel,
    credTier,
    walletValueLabel: status.walletValueUsd === null || status.walletValueUsd === undefined ? 'Pending' : `$${status.walletValueUsd}`,
    tokenBoundAccount: status.tokenBoundAccount ?? 'Pending',
    scoredAt: status.scoredAt ?? 'Pending',
    proofState,
    proofLabel: getProofLabel(proofState),
  };
}

function normalizeProofState(proofState) {
  if (proofState === 'verified' || proofState === 'stale' || proofState === 'invalid') return proofState;
  return 'pending';
}

function getProofLabel(proofState) {
  if (proofState === 'verified') return 'Verified';
  if (proofState === 'stale') return 'Stale';
  if (proofState === 'invalid') return 'Invalid';
  return 'Pending';
}

function getCredTier(score) {
  if (score <= 25) return 'Junk';
  if (score <= 50) return 'Marginal';
  if (score <= 75) return 'Qualified';
  if (score <= 90) return 'Prime';
  return 'Preferred';
}

function getBrowserStorage() {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function getPublicAssetPath(path) {
  const baseUrl = import.meta.env?.BASE_URL ?? '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${String(path).replace(/^\/+/, '')}`;
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
