import { createPublicClient, fallback, getAddress, http, isAddress, toCoinType } from 'viem';
import { base, mainnet } from 'viem/chains';

const BASE_NAME_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/iu;
const ENS_NAME_PATTERN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/iu;

const ENS_CLIENT = createPublicClient({
  chain: mainnet,
  transport: fallback([
    http('https://ethereum.publicnode.com'),
    http('https://eth.llamarpc.com'),
  ]),
});

export function normalizeLooperAllowlistAddress(address) {
  const raw = String(address ?? '').trim();
  if (!isAddress(raw)) throw new Error('Enter a valid Ethereum address.');
  return getAddress(raw);
}

export function isLooperAllowlistEnsName(value) {
  return normalizeLooperAllowlistEnsNameInput(value) !== null;
}

export function normalizeLooperAllowlistEnsNameInput(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw || isAddress(raw)) return null;
  if (BASE_NAME_LABEL_PATTERN.test(raw)) return `${raw}.base.eth`;
  if (raw.endsWith('.base') && BASE_NAME_LABEL_PATTERN.test(raw.slice(0, -'.base'.length))) return `${raw}.eth`;
  if (ENS_NAME_PATTERN.test(raw)) return raw;
  return null;
}

export async function resolveLooperAllowlistAddressInput(input, { resolveEnsAddress = resolveEnsAddressOnBase } = {}) {
  const raw = String(input ?? '').trim();
  if (isAddress(raw)) return getAddress(raw);

  const normalizedName = normalizeLooperAllowlistEnsNameInput(raw);
  if (!normalizedName) {
    throw new Error('Enter a valid Base address or Base name.');
  }

  let resolved;
  try {
    resolved = await resolveEnsAddress(normalizedName);
  } catch {
    throw new Error(`Could not resolve ${normalizedName}. Enter a Base address or a valid Base name.`);
  }

  if (!resolved || !isAddress(resolved)) {
    throw new Error(`${normalizedName} does not resolve to a Base address.`);
  }
  return getAddress(resolved);
}

export async function resolveEnsAddressOnBase(name) {
  const normalizedName = normalizeLooperAllowlistEnsNameInput(name);
  if (!normalizedName) return null;

  let baseCoinAddress = null;
  try {
    baseCoinAddress = await ENS_CLIENT.getEnsAddress({ name: normalizedName, coinType: toCoinType(base.id) });
  } catch {
    baseCoinAddress = null;
  }
  if (baseCoinAddress) return getAddress(baseCoinAddress);

  const defaultAddress = await ENS_CLIENT.getEnsAddress({ name: normalizedName });
  return defaultAddress ? getAddress(defaultAddress) : null;
}

export async function registerLooperAllowlistAddress({
  address,
  apiBase = '/multipass-api',
  source = 'launch-page',
  fetchImpl = fetch,
  botTrap = '',
  turnstileToken = '',
} = {}) {
  const normalized = normalizeLooperAllowlistAddress(address);
  const response = await fetchImpl(`${stripTrailingSlash(apiBase)}/api/loopers/allowlist/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      address: normalized,
      source,
      looper_allowlist_contact: String(botTrap ?? ''),
      ...(turnstileToken ? { turnstileToken } : {}),
    }),
  });
  return parseAllowlistResponse(response, 'register');
}

export async function getLooperAllowlistStatus({ address, apiBase = '/multipass-api', fetchImpl = fetch } = {}) {
  const normalized = normalizeLooperAllowlistAddress(address);
  const response = await fetchImpl(`${stripTrailingSlash(apiBase)}/api/loopers/allowlist/status?address=${encodeURIComponent(normalized)}`);
  return parseAllowlistResponse(response, 'status');
}

export async function getLooperAllowlistProof({ address, apiBase = '/multipass-api', fetchImpl = fetch } = {}) {
  const normalized = normalizeLooperAllowlistAddress(address);
  const response = await fetchImpl(`${stripTrailingSlash(apiBase)}/api/loopers/allowlist/proof?address=${encodeURIComponent(normalized)}`);
  return parseAllowlistResponse(response, 'proof');
}

export function getLooperAllowlistSourceFromLocation(locationUrl) {
  let url;
  try {
    url = new URL(String(locationUrl));
  } catch {
    return 'launch-page';
  }

  const source = normalizeSourcePart(url.searchParams.get('source') || url.searchParams.get('utm_source'));
  const ref = normalizeSourcePart(url.searchParams.get('ref') || url.searchParams.get('utm_campaign'));
  if (source && ref) return `${source}:${ref}`.slice(0, 80);
  if (source) return source;
  if (ref) return `ref:${ref}`.slice(0, 80);
  return 'launch-page';
}

async function parseAllowlistResponse(response, action) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Allowlist ${action} returned invalid JSON.`);
  }

  if (!response.ok) {
    throw new Error(body?.error?.message || `Allowlist ${action} failed with ${response.status}.`);
  }
  return body;
}

function stripTrailingSlash(value) {
  return String(value || '/multipass-api').replace(/\/+$/g, '');
}

function normalizeSourcePart(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  return normalized || null;
}
