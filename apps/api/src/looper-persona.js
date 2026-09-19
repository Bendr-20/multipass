const DEFAULT_LOOPER_METADATA_BASE_URL = 'https://helixa.xyz/loopers/metadata-hotfix/';
const MAX_TOKEN_ID = 7_777n;

export function createLooperPersonaLoader({
  fetchImpl = fetch,
  metadataBaseUrl = DEFAULT_LOOPER_METADATA_BASE_URL,
} = {}) {
  const baseUrl = new URL(String(metadataBaseUrl ?? DEFAULT_LOOPER_METADATA_BASE_URL));
  if (baseUrl.protocol !== 'https:') throw new TypeError('Looper persona metadata base must use HTTPS.');

  return async function loadLooperPersona({ tokenId } = {}) {
    const normalizedTokenId = normalizeTokenId(tokenId);
    if (!normalizedTokenId) return null;
    try {
      const response = await fetchImpl(new URL(`${normalizedTokenId}.json`, ensureTrailingSlash(baseUrl)), {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response?.ok) return null;
      return normalizeLooperPersona(await response.json().catch(() => null), normalizedTokenId);
    } catch {
      return null;
    }
  };
}

export function normalizeLooperPersona(metadata, tokenId) {
  if (!isPlainObject(metadata)) return null;
  const normalizedTokenId = normalizeTokenId(tokenId);
  if (!normalizedTokenId) return null;
  const traits = metadataToTraits(metadata);
  const persona = {
    tokenId: normalizedTokenId,
    canonicalName: cleanText(metadata.name, 120) || `Looper #${normalizedTokenId}`,
    description: cleanText(metadata.description, 500),
    agentClass: cleanText(metadata.agent_class ?? traits['Agent Class'] ?? traits.Class, 120),
    secondaryClass: cleanText(metadata.secondary_class ?? traits['Secondary Class'], 120),
    specialization: cleanText(metadata.specialization ?? traits.Specialization, 160),
    riskProfile: cleanText(metadata.risk_profile ?? traits.Risk, 120),
    autonomy: cleanText(metadata.autonomy ?? traits.Autonomy, 120),
    voice: cleanText(metadata.voice, 300),
    firstMission: cleanText(metadata.first_mission, 300),
    codexVersion: cleanText(metadata.trait_codex_version ?? traits['Codex Version'], 160),
  };
  return Object.fromEntries(Object.entries(persona).filter(([, value]) => value));
}

function metadataToTraits(metadata) {
  const traits = {};
  for (const attribute of Array.isArray(metadata?.attributes) ? metadata.attributes : []) {
    const name = cleanText(attribute?.trait_type ?? attribute?.traitType, 120);
    const value = cleanText(attribute?.value, 300);
    if (name && value) traits[name] = value;
  }
  return traits;
}

function normalizeTokenId(value) {
  try {
    const tokenId = BigInt(String(value ?? '').trim());
    if (tokenId <= 0n || tokenId > MAX_TOKEN_ID) return null;
    return tokenId.toString();
  } catch {
    return null;
  }
}

function cleanText(value, maxLength) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, maxLength);
}

function ensureTrailingSlash(url) {
  const value = new URL(url);
  if (!value.pathname.endsWith('/')) value.pathname += '/';
  return value;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
