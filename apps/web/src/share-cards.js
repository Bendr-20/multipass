const TOKEN_ID_PATTERN = /^\d+$/;
const VERSION_PATTERN = /^[a-f0-9]{8,16}$/i;

function normalizeGeneratedShareCard(card) {
  if (!card) return null;
  const tokenId = String(card.tokenId ?? '').trim();
  const version = String(card.version ?? '').trim();
  if (!TOKEN_ID_PATTERN.test(tokenId) || !VERSION_PATTERN.test(version)) return null;
  return { ...card, tokenId, version };
}

export function getAgentShareCard(tokenId, manifest = {}) {
  const key = String(tokenId ?? '').trim();
  if (!TOKEN_ID_PATTERN.test(key)) return null;
  const card = normalizeGeneratedShareCard(manifest[key]);
  return card?.tokenId === key ? card : null;
}

export function getAgentSharePath(card) {
  const normalized = normalizeGeneratedShareCard(card);
  if (!normalized) return null;
  return `/multipass/share/${encodeURIComponent(normalized.tokenId)}/?v=${encodeURIComponent(normalized.version)}`;
}

export function getAgentSharePageUrl(card, origin = 'https://helixa.xyz') {
  const path = getAgentSharePath(card);
  return path ? new URL(path, origin).toString() : null;
}

export function getAgentShareImageUrl(card, origin = 'https://helixa.xyz') {
  const normalized = normalizeGeneratedShareCard(card);
  if (!normalized) return null;
  return new URL(`/multipass/share/${encodeURIComponent(normalized.tokenId)}.jpg?v=${encodeURIComponent(normalized.version)}`, origin).toString();
}
