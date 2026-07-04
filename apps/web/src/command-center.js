import { getPublicRouteFragments } from './route-manager.js';
import { getPublicTools } from './tool-manager.js';

const SAFETY_NOTE = 'Discovery and display controls only. This panel does not call tools, does not transfer custody, does not release credentials, and does not prove trust by payment alone.';

export function createOwnerCommandCenterSnapshot(data = {}, state = {}) {
  const profile = data.profile ?? {};
  const ownerSummary = profile.owner_summary ?? {};
  const publicTools = getPublicTools(data);
  const publicRoutes = getPublicRouteFragments(data);
  const receiptCount = countRecentReceipts(data);
  const canEdit = Boolean(state.claimCsrfToken);
  const walletUnconfigured = state.walletSnapshot?.configured === false;
  const warnings = createCommandWarnings({ publicTools, publicRoutes, ownerSummary, walletUnconfigured });

  return {
    title: 'Owner Command Center',
    status: ownerSummary.owner_state ?? ownerSummary.verification_status ?? state.claimStatus ?? 'unclaimed',
    visibility: ownerSummary.visibility ?? profile.discovery_profile?.visibility ?? 'public',
    verification: ownerSummary.verification_status ?? ownerSummary.owner_state ?? 'none',
    canEdit,
    safetyNote: SAFETY_NOTE,
    nextAction: getNextAction({ canEdit, walletUnconfigured, warnings }),
    warnings,
    metrics: {
      publicTools: { label: 'Public tools', value: publicTools.length, helper: 'Registry cards published for discovery.' },
      x402Tools: { label: 'x402 cards', value: publicTools.filter(isX402Tool).length, helper: 'Payment metadata cards, not payment execution.' },
      publicRoutes: { label: 'Public routes', value: publicRoutes.length, helper: 'Safe public references linked to this profile.' },
      recentReceipts: { label: 'Recent receipts', value: receiptCount, helper: 'Receipts and change entries shown as public history.' },
    },
  };
}

export function renderOwnerCommandCenterSnapshot(snapshot = {}) {
  const metrics = Object.values(snapshot.metrics ?? {});
  return `
    <section class="owner-command-snapshot" aria-label="Owner command center snapshot">
      <div class="owner-command-snapshot-copy">
        <p class="card-label">${escapeHtml(snapshot.title ?? 'Owner Command Center')}</p>
        <h3>Profile operations at a glance.</h3>
        <p>${escapeHtml(snapshot.safetyNote ?? SAFETY_NOTE)}</p>
      </div>
      <dl class="owner-command-facts" aria-label="Owner command status">
        <div><dt>Status</dt><dd>${escapeHtml(snapshot.status ?? 'unclaimed')}</dd></div>
        <div><dt>Visibility</dt><dd>${escapeHtml(snapshot.visibility ?? 'public')}</dd></div>
        <div><dt>Verification</dt><dd>${escapeHtml(snapshot.verification ?? 'none')}</dd></div>
      </dl>
      <div class="owner-command-metrics" aria-label="Owner command metrics">
        ${metrics.map(renderMetric).join('')}
      </div>
      <div class="owner-command-next">
        <h3>Next best action</h3>
        <p>${escapeHtml(snapshot.nextAction ?? getNextAction({ canEdit: false }))}</p>
      </div>
      ${renderWarnings(snapshot.warnings)}
    </section>
  `;
}

function renderMetric(metric = {}) {
  return `
    <article class="owner-command-metric">
      <span>${escapeHtml(metric.label ?? 'Metric')}</span>
      <strong>${escapeHtml(metric.value ?? 0)}</strong>
      <em>${escapeHtml(metric.helper ?? '')}</em>
    </article>
  `;
}

function renderWarnings(warnings = []) {
  if (!Array.isArray(warnings) || warnings.length === 0) return '';
  return `
    <ul class="owner-command-warnings" aria-label="Owner command warnings">
      ${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}
    </ul>
  `;
}

function isX402Tool(tool = {}) {
  return String(tool.registry ?? '').toLowerCase().includes('x402');
}

function countRecentReceipts(data = {}) {
  const publicReceiptFragments = Array.isArray(data.fragments?.fragments)
    ? data.fragments.fragments.filter((fragment) => fragment?.visibility === 'public' && fragment?.fragment_type === 'receipt').length
    : 0;
  const directReceipt = data.receipt?.receipt_id || data.receipt?.status ? 1 : 0;
  const receiptSignals = directReceipt || publicReceiptFragments;
  const changeEntries = Array.isArray(data.changes?.entries) ? data.changes.entries.length : 0;
  return receiptSignals + changeEntries;
}

function createCommandWarnings({ publicTools, publicRoutes, ownerSummary, walletUnconfigured }) {
  const warnings = [];
  if (walletUnconfigured) warnings.push('Wallet login is unavailable; use manual review for public metadata changes.');
  if (!publicTools.length) warnings.push('No public tool cards are published yet.');
  if (!publicRoutes.length) warnings.push('No safe public routes are published yet.');
  if ((ownerSummary.verification_status ?? ownerSummary.owner_state) === 'unclaimed') warnings.push('Management is unclaimed until source-owner proof or manual review succeeds.');
  return warnings;
}

function getNextAction({ canEdit = false, walletUnconfigured = false, warnings = [] } = {}) {
  if (canEdit) return 'Review public fields, refresh public discovery metadata, and publish only safe route or tool cards.';
  if (walletUnconfigured) return 'Request manual review while wallet login is unavailable for this build.';
  if (warnings?.length) return 'Resolve the visible warnings before publishing more discovery metadata.';
  return 'Connect the owner wallet or request manual review to unlock safe public metadata controls.';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
