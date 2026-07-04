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
      return agent === null || (/^\d+$/.test(agent) && [...parsed.searchParams.keys()].every((key) => key === 'agent'));
    }
    const match = parsed.pathname.match(/^\/multipass\/([a-z0-9][a-z0-9-]{1,80})$/);
    return Boolean(match) && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
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
    ? `<p class="save-message">Activated Multipass. Stable public trust profile is ready to share.</p>${share}<p class="save-message muted">Activated, unclaimed Multipass. Claim management when ready.</p>`
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
