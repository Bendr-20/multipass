const DEFAULT_SUBJECT_TYPE = 'swarm';
const SAFETY_COPY = 'Creates public parent Multipass metadata only. It does not transfer custody, does not call tools, does not expose private credentials, does not execute payments, and does not prove trust by payment alone.';

export function normalizeGroupMemberInput(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeGroupMemberInput(item));
  }
  return String(value ?? '')
    .split(/[\s,]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createGroupActivationPayload(formData) {
  return {
    subject_type: getFormString(formData, 'subject_type') || DEFAULT_SUBJECT_TYPE,
    display_name: getFormString(formData, 'display_name'),
    summary: getFormString(formData, 'summary'),
    shared_policy_note: getFormString(formData, 'shared_policy_note'),
    member_ids: normalizeGroupMemberInput(getFormString(formData, 'member_ids')),
  };
}

export function renderGroupActivationPanel(state = {}) {
  const input = state.input ?? {};
  const selectedSubjectType = String(input.subject_type ?? input.subjectType ?? DEFAULT_SUBJECT_TYPE);
  const hasPreview = Boolean(state.preview);
  const isPreviewing = state.status === 'previewing';
  const isSaving = state.status === 'saving';
  const previewDisabled = isPreviewing || isSaving;
  const saveDisabled = hasPreview && !isSaving ? '' : ' disabled';
  const saveHidden = hasPreview ? '' : ' hidden';
  const previewLabel = isPreviewing ? 'Previewing group Multipass...' : 'Preview group Multipass';
  const saveLabel = isSaving ? 'Activating group Multipass...' : 'Activate group Multipass';

  return `<section class="group-activation-panel" aria-label="Activate collection or swarm">
    <div class="section-kicker">Group activation</div>
    <h2>Activate collection or swarm</h2>
    <p>${escapeHtml(SAFETY_COPY)}</p>
    <form data-role="group-activation-form">
      <label>Subject type
        <select name="subject_type" required>
          <option value="swarm"${selectedSubjectType === 'swarm' ? ' selected' : ''}>Swarm</option>
          <option value="collection"${selectedSubjectType === 'collection' ? ' selected' : ''}>Collection</option>
        </select>
      </label>
      <label>Display name
        <input name="display_name" value="${escapeAttribute(input.display_name ?? input.displayName ?? '')}" required placeholder="Helixa Swarm">
      </label>
      <label>Summary
        <textarea name="summary" required rows="3">${escapeHtml(input.summary ?? '')}</textarea>
      </label>
      <label>Member IDs
        <textarea name="member_ids" required rows="3" placeholder="1, 81, 1066">${escapeHtml(renderMemberInputValue(input.member_ids ?? input.memberIds ?? ''))}</textarea>
      </label>
      <label>Shared policy note
        <textarea name="shared_policy_note" required rows="3">${escapeHtml(input.shared_policy_note ?? input.sharedPolicyNote ?? '')}</textarea>
      </label>
      <div class="group-activation-actions">
        <button type="button" data-action="preview-group-multipass"${previewDisabled ? ' disabled' : ''}>${previewLabel}</button>
        <button type="button" data-action="save-group-multipass"${saveDisabled}${saveHidden}>${saveLabel}</button>
      </div>
    </form>
  </section>`;
}

export function renderGroupActivationPreview(preview = null) {
  if (!hasPreviewData(preview)) return '';
  const profile = preview.record?.profile ?? preview.profile ?? {};
  const displayName = profile.display_name ?? profile.displayName ?? preview.display_name ?? 'Proposed group Multipass';
  const subjectType = profile.subject_type ?? profile.subjectType ?? preview.subject_type ?? 'group';
  const members = Array.isArray(preview.members) ? preview.members : [];
  const memberRows = members.length
    ? members.map(renderPreviewMember).join('')
    : '<li class="muted">No resolved members returned yet.</li>';

  return `<section class="group-activation-preview" aria-label="Group Multipass preview">
    <div class="section-kicker">Preview</div>
    <h3>${escapeHtml(displayName)}</h3>
    <p>Proposed parent profile for ${escapeHtml(subjectType)}.</p>
    <ul class="group-activation-members">${memberRows}</ul>
    <p>${escapeHtml(SAFETY_COPY)}</p>
  </section>`;
}

export function renderGroupActivationSuccess(result = null) {
  if (!hasSuccessData(result)) return '';
  const profileName = result.profile?.display_name ?? result.profile?.displayName ?? 'Group Multipass';
  const sharePath = getSafeGroupSharePath(result);
  const shareMarkup = sharePath
    ? `<p class="group-activation-share-path">${escapeHtml(sharePath)}</p><a href="${escapeAttribute(sharePath)}">Open parent Multipass</a>`
    : '<p class="group-activation-share-path">Share path pending safe profile route.</p>';

  return `<section class="group-activation-success" aria-label="Group Multipass activated">
    <div class="section-kicker">Activated</div>
    <h3>${escapeHtml(profileName)}</h3>
    <p>Public parent Multipass is ready to share.</p>
    ${shareMarkup}
    <p>Activated with unclaimed management. Claim management when ready.</p>
  </section>`;
}

export function renderGroupActivationError(error) {
  if (!error) return '';
  const structured = getStructuredError(error);
  const code = structured.code ? `<span class="group-activation-error-code">${escapeHtml(structured.code)}</span>` : '';
  const details = structured.details ? `<span class="group-activation-error-details">${escapeHtml(structured.details)}</span>` : '';

  return `<section class="group-activation-error" role="alert" aria-label="Group activation error">
    <p>${escapeHtml(structured.message)}</p>
    ${code}${details}
  </section>`;
}

function hasPreviewData(preview) {
  return Boolean(
    preview
      && (preview.record?.profile || preview.profile || preview.display_name || preview.displayName || preview.subject_type || preview.subjectType || (Array.isArray(preview.members) && preview.members.length > 0)),
  );
}

function hasSuccessData(result) {
  return Boolean(result && (result.profile || result.sharePath || result.slug));
}

function renderPreviewMember(member = {}) {
  const name = member.name ?? member.display_name ?? `Token ${member.token_id ?? member.tokenId ?? ''}`;
  const tokenId = member.token_id ?? member.tokenId ?? 'unknown';
  const status = member.source_status ?? member.sourceStatus ?? 'resolved';
  const cred = renderCredContext(member);
  return `<li>
    <strong>${escapeHtml(name)}</strong>
    <span>Token ID ${escapeHtml(tokenId)}</span>
    ${cred ? `<span>${escapeHtml(cred)}</span>` : ''}
    <span>${escapeHtml(status)}</span>
  </li>`;
}

function renderCredContext(member = {}) {
  const score = member.cred_score ?? member.credScore;
  const tier = member.cred_tier ?? member.credTier;
  if (score === null || score === undefined || score === '') return tier ? `Cred ${tier}` : '';
  return `Cred ${score}${tier ? ` ${tier}` : ''}`;
}

function getStructuredError(error) {
  const apiError = error?.details?.body?.error ?? error?.body?.error ?? error?.error ?? null;
  const message = apiError?.message ?? error?.message ?? 'Could not preview group Multipass.';
  return {
    message,
    code: apiError?.code ?? error?.code ?? '',
    details: summarizeErrorDetails(apiError?.details ?? error?.details),
  };
}

function summarizeErrorDetails(details) {
  if (!details || typeof details !== 'object') return '';
  if (typeof details.field === 'string') return details.field;
  if (Array.isArray(details.fields)) return details.fields.join(', ');
  if (typeof details.reason === 'string') return details.reason;
  return '';
}

function getFormString(formData, key) {
  const value = formData?.get?.(key);
  return String(value ?? '').trim();
}

function renderMemberInputValue(value) {
  if (Array.isArray(value)) return value.join('\n');
  return String(value ?? '');
}

function getSafeGroupSharePath(result = {}) {
  const rawPath = result.sharePath ?? (result.slug ? `/multipass/${result.slug}` : '');
  const path = String(rawPath ?? '');
  if (!path || /%2f|%5c|\.\./i.test(path)) return '';
  return /^\/multipass\/[a-z0-9][a-z0-9-]{1,80}$/u.test(path) ? path : '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}
