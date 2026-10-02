import { randomBytes as nodeRandomBytes } from 'node:crypto';
import { getAddress } from 'viem';

const MAX_LEASE_TTL_MS = 24 * 60 * 60 * 1_000;

export function createRestapNetworkActivationLeaseService({
  store,
  now = Date.now,
  randomBytes = nodeRandomBytes,
  getPolicyGeneration = () => 0,
} = {}) {
  if (!store || typeof store.transaction !== 'function' || typeof store.readOne !== 'function') throw new TypeError('Activation leases require the RESTAP network store.');
  if (typeof now !== 'function' || typeof randomBytes !== 'function' || typeof getPolicyGeneration !== 'function') throw new TypeError('Activation lease dependencies are invalid.');

  function issue({ custody, expectedPolicyGeneration, ttlMs = MAX_LEASE_TTL_MS } = {}) {
    const authority = requireAuthority(custody, expectedPolicyGeneration);
    const timestamp = normalizeTime(now());
    const ttl = normalizeTtl(ttlMs);
    const leaseId = createLeaseId(randomBytes);
    store.transaction('activation_lease_issue', (tx) => {
      tx.run(
        "UPDATE restap_network_activation_leases SET status = 'deactivated', deactivated_at = ? WHERE chain_id = ? AND collection = ? AND token_id = ? AND status IN ('active','candidate')",
        [timestamp, authority.chainId, authority.collection, authority.tokenId],
      );
      tx.run(
        'INSERT INTO restap_network_activation_leases (lease_id, chain_id, collection, token_id, custody_generation, canonical_account, owner_address, controller_address, issued_at, last_renewed_at, expires_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [leaseId, authority.chainId, authority.collection, authority.tokenId, authority.generation, authority.canonicalAccount, authority.owner, authority.controller, timestamp, timestamp, timestamp + ttl, 'active'],
      );
    });
    return readLease(leaseId);
  }

  function renew({ custody, expectedPolicyGeneration, ttlMs = MAX_LEASE_TTL_MS } = {}) {
    const authority = requireAuthority(custody, expectedPolicyGeneration);
    const timestamp = normalizeTime(now());
    const ttl = normalizeTtl(ttlMs);
    const row = store.readOne(
      "SELECT lease_id FROM restap_network_activation_leases WHERE chain_id = ? AND collection = ? AND token_id = ? AND custody_generation = ? AND status = 'active' AND expires_at > ? ORDER BY issued_at DESC LIMIT 1",
      [authority.chainId, authority.collection, authority.tokenId, authority.generation, timestamp],
    );
    if (!row) return null;
    assertLeaseAuthority(store.readOne('SELECT * FROM restap_network_activation_leases WHERE lease_id = ?', [row.lease_id]), authority);
    let renewed = false;
    store.transaction('activation_lease_renew', (tx) => {
      renewed = Number(tx.run(
        "UPDATE restap_network_activation_leases SET last_renewed_at = ?, expires_at = ? WHERE lease_id = ? AND status = 'active' AND expires_at > ?",
        [timestamp, timestamp + ttl, row.lease_id, timestamp],
      ).changes) === 1;
    });
    return renewed ? readLease(row.lease_id) : null;
  }

  function deactivate({ custody, expectedPolicyGeneration } = {}) {
    const authority = requireAuthority(custody, expectedPolicyGeneration);
    const timestamp = normalizeTime(now());
    let changes = 0;
    store.transaction('activation_lease_deactivate', (tx) => {
      changes = Number(tx.run(
        "UPDATE restap_network_activation_leases SET status = 'deactivated', deactivated_at = ? WHERE chain_id = ? AND collection = ? AND token_id = ? AND status IN ('active','candidate')",
        [timestamp, authority.chainId, authority.collection, authority.tokenId],
      ).changes);
    });
    return Object.freeze({ deactivated: changes });
  }

  function loadCandidates() {
    const timestamp = normalizeTime(now());
    store.transaction('activation_lease_candidates', (tx) => {
      tx.run("UPDATE restap_network_activation_leases SET status = 'expired', deactivated_at = ? WHERE status IN ('active','candidate') AND expires_at <= ?", [timestamp, timestamp]);
      tx.run("UPDATE restap_network_activation_leases SET status = 'candidate' WHERE status = 'active' AND expires_at > ?", [timestamp]);
    });
    return Object.freeze(store.readAll(
      "SELECT * FROM restap_network_activation_leases WHERE status = 'candidate' AND expires_at > ? ORDER BY issued_at, lease_id",
      [timestamp],
    ).map(normalizeLease));
  }

  function reauthorizeCandidate({ leaseId, custody, expectedPolicyGeneration } = {}) {
    const authority = requireAuthority(custody, expectedPolicyGeneration);
    const id = normalizeLeaseId(leaseId);
    const timestamp = normalizeTime(now());
    const row = store.readOne("SELECT * FROM restap_network_activation_leases WHERE lease_id = ? AND status = 'candidate' AND expires_at > ?", [id, timestamp]);
    if (!row) throw new Error('Activation lease candidate is unavailable.');
    assertLeaseAuthority(row, authority);
    store.transaction('activation_lease_reauthorize', (tx) => {
      const result = tx.run("UPDATE restap_network_activation_leases SET status = 'active', last_renewed_at = ? WHERE lease_id = ? AND status = 'candidate' AND expires_at > ?", [timestamp, id, timestamp]);
      if (Number(result.changes) !== 1) throw new Error('Activation lease candidate changed concurrently.');
    });
    return readLease(id);
  }

  function requireAuthority(custody, expectedPolicyGeneration) {
    const authority = normalizeCustody(custody);
    if (authority.status !== 'ready') throw new Error('Activation leases require ready custody.');
    const expected = normalizeGeneration(expectedPolicyGeneration, 'Expected policy generation');
    const currentPolicyGeneration = normalizeGeneration(getPolicyGeneration({ custody: authority }), 'Current policy generation');
    if (currentPolicyGeneration !== expected) throw new Error('Activation lease policy generation mismatch.');
    const current = store.readOne(
      'SELECT generation, canonical_account, owner_address, controller_address, safe_block_number, safe_block_hash, status FROM restap_network_custody_epochs WHERE chain_id = ? AND collection = ? AND token_id = ? ORDER BY generation DESC LIMIT 1',
      [authority.chainId, authority.collection, authority.tokenId],
    );
    if (!current || current.status !== 'ready'
      || Number(current.generation) !== authority.generation
      || getAddress(current.canonical_account) !== authority.canonicalAccount
      || getAddress(current.owner_address) !== authority.owner
      || getAddress(current.controller_address) !== authority.controller
      || Number(current.safe_block_number) !== authority.safeBlockNumber
      || '0x' + current.safe_block_hash !== authority.safeBlockHash) {
      throw new Error('Activation lease authority snapshot does not match current custody.');
    }
    return authority;
  }

  function readLease(leaseId) {
    const row = store.readOne('SELECT * FROM restap_network_activation_leases WHERE lease_id = ?', [normalizeLeaseId(leaseId)]);
    return row ? normalizeLease(row) : null;
  }

  return Object.freeze({ issue, renew, deactivate, loadCandidates, reauthorizeCandidate });
}

function normalizeCustody(value) {
  if (!isPlainObject(value)) throw new TypeError('Custody snapshot must be a plain object.');
  const chainId = normalizePositiveInteger(value.chainId, 'Custody chain ID');
  const tokenId = String(value.tokenId ?? '');
  if (!/^(0|[1-9][0-9]*)$/u.test(tokenId)) throw new TypeError('Custody token ID is invalid.');
  const safeBlockHash = String(value.safeBlockHash ?? '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(safeBlockHash)) throw new TypeError('Custody safe block hash is invalid.');
  return Object.freeze({
    chainId,
    collection: getAddress(value.collection),
    tokenId,
    generation: normalizeGeneration(value.generation, 'Custody generation'),
    canonicalAccount: getAddress(value.canonicalAccount),
    owner: getAddress(value.owner),
    controller: getAddress(value.controller),
    safeBlockNumber: normalizeGeneration(value.safeBlockNumber, 'Custody safe block'),
    safeBlockHash,
    status: String(value.status ?? ''),
  });
}

function assertLeaseAuthority(row, authority) {
  if (!row
    || Number(row.chain_id) !== authority.chainId
    || getAddress(row.collection) !== authority.collection
    || row.token_id !== authority.tokenId
    || Number(row.custody_generation) !== authority.generation
    || getAddress(row.canonical_account) !== authority.canonicalAccount
    || getAddress(row.owner_address) !== authority.owner
    || getAddress(row.controller_address) !== authority.controller) {
    throw new Error('Activation lease authority mismatch.');
  }
}

function normalizeLease(row) {
  return Object.freeze({
    leaseId: row.lease_id,
    chainId: Number(row.chain_id),
    collection: getAddress(row.collection),
    tokenId: row.token_id,
    custodyGeneration: Number(row.custody_generation),
    canonicalAccount: getAddress(row.canonical_account),
    owner: getAddress(row.owner_address),
    controller: getAddress(row.controller_address),
    issuedAt: Number(row.issued_at),
    lastRenewedAt: Number(row.last_renewed_at),
    expiresAt: Number(row.expires_at),
    status: row.status,
  });
}

function createLeaseId(randomBytes) {
  const bytes = randomBytes(16);
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) throw new TypeError('Activation lease random source must return bytes.');
  if (bytes.byteLength !== 16) throw new Error('Activation lease IDs require exactly 128-bit randomness.');
  return Buffer.from(bytes).toString('hex');
}

function normalizeLeaseId(value) {
  const id = String(value ?? '').toLowerCase();
  if (!/^[0-9a-f]{32}$/u.test(id)) throw new TypeError('Activation lease ID is invalid.');
  return id;
}

function normalizeTtl(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_LEASE_TTL_MS) throw new TypeError('Activation lease TTL must be between 1 ms and 24 hours.');
  return value;
}

function normalizeTime(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Activation lease clock is invalid.');
  return value;
}

function normalizeGeneration(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(label + ' is invalid.');
  return value;
}

function normalizePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(label + ' is invalid.');
  return value;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
