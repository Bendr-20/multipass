import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const DEFAULT_NONCE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function createConsoleAuthStore({
  now = () => new Date(),
  nonceTtlMs = DEFAULT_NONCE_TTL_MS,
  sessionTtlMs = DEFAULT_SESSION_TTL_MS,
  randomBytesImpl = randomBytes,
} = {}) {
  const challenges = new Map();
  const sessions = new Map();

  return {
    createChallenge({ wallet, domain = 'helixa.xyz' } = {}) {
      const normalizedWallet = normalizeWallet(wallet);
      const normalizedDomain = normalizeDomain(domain);
      const issuedAt = asDate(now());
      const expiresAt = new Date(issuedAt.getTime() + nonceTtlMs);
      const nonce = randomBytesImpl(16).toString('hex');
      const message = [
        `${normalizedDomain} wants you to sign in with your Ethereum account:`,
        normalizedWallet,
        '',
        'Authenticate this wallet for the review-only Looper runtime.',
        '',
        `URI: https://${normalizedDomain}/multipass/console`,
        'Version: 1',
        'Chain ID: 8453',
        `Nonce: ${nonce}`,
        `Issued At: ${issuedAt.toISOString()}`,
        `Expiration Time: ${expiresAt.toISOString()}`,
      ].join('\n');
      challenges.set(hash(nonce), {
        wallet: normalizedWallet,
        message,
        expiresAt: expiresAt.toISOString(),
        usedAt: null,
      });
      return {
        wallet: normalizedWallet,
        nonce,
        message,
        issued_at: issuedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      };
    },

    async verifyChallenge({ wallet, nonce, signature, signatureVerifier } = {}) {
      const normalizedWallet = normalizeWallet(wallet);
      const nonceKey = hash(String(nonce ?? ''));
      const challenge = challenges.get(nonceKey);
      if (!challenge) throw new Error('Console auth challenge not found.');
      if (challenge.usedAt) throw new Error('Console auth challenge was already used.');
      if (challenge.wallet !== normalizedWallet) throw new Error('Console auth challenge is bound to another wallet.');
      if (Date.parse(challenge.expiresAt) <= asDate(now()).getTime()) throw new Error('Console auth challenge expired.');
      if (typeof signatureVerifier !== 'function') throw new Error('Console signature verifier is unavailable.');
      const valid = await signatureVerifier({ wallet: normalizedWallet, message: challenge.message, signature });
      if (!valid) throw new Error('Wallet signature did not verify against the Console challenge.');

      challenge.usedAt = asDate(now()).toISOString();
      const sessionId = randomBytesImpl(32).toString('hex');
      const csrfToken = randomBytesImpl(32).toString('hex');
      const expiresAt = new Date(asDate(now()).getTime() + sessionTtlMs);
      sessions.set(hash(sessionId), {
        wallet: normalizedWallet,
        csrfHash: hash(csrfToken),
        expiresAt: expiresAt.toISOString(),
        revokedAt: null,
      });
      return {
        sessionId,
        csrfToken,
        wallet: normalizedWallet,
        expires_at: expiresAt.toISOString(),
      };
    },

    validateSession({ sessionId, csrfToken, requireCsrf = false } = {}) {
      const session = sessions.get(hash(String(sessionId ?? '')));
      if (!session) throw new Error('Console session not found.');
      if (session.revokedAt) throw new Error('Console session revoked.');
      if (Date.parse(session.expiresAt) <= asDate(now()).getTime()) throw new Error('Console session expired.');
      if (requireCsrf && !constantTimeEqual(session.csrfHash, hash(String(csrfToken ?? '')))) {
        throw new Error('Console session CSRF token is invalid.');
      }
      return { ...session };
    },

    revokeSession(sessionId) {
      const session = sessions.get(hash(String(sessionId ?? '')));
      if (session && !session.revokedAt) session.revokedAt = asDate(now()).toISOString();
    },
  };
}

function normalizeWallet(value) {
  const wallet = String(value ?? '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) throw new TypeError('wallet must be an EVM wallet address.');
  return wallet;
}

function normalizeDomain(value) {
  const domain = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9.-]+(?::\d+)?$/.test(domain)) throw new TypeError('domain is invalid.');
  return domain;
}

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid auth timestamp.');
  return date;
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
