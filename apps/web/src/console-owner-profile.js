import { createPublicClient, fallback, getAddress, http, isAddress } from 'viem';
import { mainnet } from 'viem/chains';

const ENS_CLIENT = createPublicClient({
  chain: mainnet,
  transport: fallback([
    http('https://ethereum.publicnode.com', { timeout: 3_000, retryCount: 0 }),
    http('https://eth.llamarpc.com', { timeout: 3_000, retryCount: 0 }),
  ]),
});
const DEFAULT_PROFILE_CACHE = new Map();

async function defaultGetEnsName({ address }) {
  return ENS_CLIENT.getEnsName({ address });
}

async function defaultGetEnsAvatar({ name }) {
  return ENS_CLIENT.getEnsAvatar({ name });
}

export function safeConsoleAvatarUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  try {
    const source = raw.startsWith('ipfs://')
      ? `https://ipfs.io/ipfs/${raw.slice('ipfs://'.length).replace(/^ipfs\//u, '')}`
      : raw;
    const url = source.startsWith('/') ? new URL(source, 'https://helixa.xyz') : new URL(source);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export async function resolveConsoleOwnerProfile(address, {
  getEnsName = defaultGetEnsName,
  getEnsAvatar = defaultGetEnsAvatar,
} = {}) {
  const rawAddress = String(address ?? '').trim();
  const normalizedAddress = isAddress(rawAddress) ? getAddress(rawAddress) : rawAddress;
  const fallbackProfile = {
    address: normalizedAddress,
    displayName: normalizedAddress,
    ensName: null,
    avatarUrl: null,
  };

  const useDefaultClient = getEnsName === defaultGetEnsName && getEnsAvatar === defaultGetEnsAvatar;
  if (useDefaultClient && DEFAULT_PROFILE_CACHE.has(normalizedAddress)) {
    return DEFAULT_PROFILE_CACHE.get(normalizedAddress);
  }

  const lookup = resolveProfile();
  if (useDefaultClient) {
    DEFAULT_PROFILE_CACHE.set(normalizedAddress, lookup);
    lookup.then((profile) => {
      if (!profile?.ensName && DEFAULT_PROFILE_CACHE.get(normalizedAddress) === lookup) {
        DEFAULT_PROFILE_CACHE.delete(normalizedAddress);
      }
    }, () => DEFAULT_PROFILE_CACHE.delete(normalizedAddress));
  }
  return lookup;

  async function resolveProfile() {
    try {
      const ensName = String(await getEnsName({ address: normalizedAddress }) ?? '').trim() || null;
      if (!ensName) return fallbackProfile;
      let avatarUrl = null;
      try {
        avatarUrl = safeConsoleAvatarUrl(await getEnsAvatar({ name: ensName }));
      } catch {
        avatarUrl = null;
      }
      return {
        address: normalizedAddress,
        displayName: ensName,
        ensName,
        avatarUrl,
      };
    } catch {
      return fallbackProfile;
    }
  }
}
