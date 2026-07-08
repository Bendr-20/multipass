export function isSafeMultipassSharePath(sharePath) {
  if (!sharePath) return false;
  const raw = String(sharePath);
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !raw.startsWith('https://helixa.xyz/')) return false;
  if (/%2f|%5c/i.test(raw) || raw.includes('..')) return false;

  try {
    const parsed = new URL(raw, 'https://helixa.xyz');
    if (parsed.origin !== 'https://helixa.xyz') return false;
    if (parsed.pathname === '/multipass/' || parsed.pathname === '/multipass') {
      const agent = parsed.searchParams.get('agent');
      return agent === null || (isSafeActivationAgentQuery(agent) && [...parsed.searchParams.keys()].every((key) => key === 'agent'));
    }
    const shareMatch = parsed.pathname.match(/^\/multipass\/share\/([a-z0-9][a-z0-9-]{1,80})$/);
    if (shareMatch) return !parsed.search && !parsed.hash;

    const match = parsed.pathname.match(/^\/multipass\/([a-z0-9][a-z0-9-]{1,80})$/);
    return Boolean(match) && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}

function isSafeActivationAgentQuery(agent) {
  const raw = String(agent ?? '').trim();
  if (/^\d+$/.test(raw)) return true;
  if (/^erc8004:8453:\d+$/i.test(raw)) return true;
  if (/^eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:\d+$/i.test(raw)) return true;
  return false;
}

export function getSafeMultipassSharePath(sharePath) {
  return isSafeMultipassSharePath(sharePath) ? String(sharePath) : '/multipass/';
}

export function getAbsoluteShareUrl(sharePath) {
  return new URL(getSafeMultipassSharePath(sharePath), 'https://helixa.xyz').toString();
}

export function renderSavePanel(state) {
  if (state.resolverStatus !== 'loaded') return '';
  const disabled = state.saveStatus === 'saving' ? 'disabled' : '';
  const label = state.saveStatus === 'saving' ? 'Activating...' : 'Activate Multipass';
  const share = state.savedSharePath && isSafeMultipassSharePath(state.savedSharePath)
    ? `<p class="save-share-path">${escapeHtml(state.savedSharePath)}</p>`
    : '';
  const success = state.saveStatus === 'saved'
    ? `<p class="save-message">Activated Multipass. Stable public agent profile is ready to share.</p>${share}<p class="save-message muted">Activated, unclaimed Multipass. Claim management when ready.</p>`
    : '';
  const error = state.saveStatus === 'error'
    ? `<p class="save-message error">Could not activate Multipass. Try again. ${escapeHtml(state.saveError ?? '')}</p>`
    : '';
  return `<section class="save-panel" aria-label="Activate Multipass"><button type="button" data-action="save-multipass" ${disabled}>${label}</button><p>Claim management unlocks after activation.</p>${success}${error}</section>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
