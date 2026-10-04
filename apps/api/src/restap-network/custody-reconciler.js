import { createHmac } from 'node:crypto';
import { getAddress } from 'viem';

import { RESTAP_NETWORK_ACCOUNT_RELEASE, deriveReleasedAccount } from './account-integrity.js';

export function createCustodyReconciler({
  store,
  providers,
  release = RESTAP_NETWORK_ACCOUNT_RELEASE,
  auditKey,
  auditKeyId,
  timeoutMs = 5_000,
  now = Date.now,
  allowSafeBlockSkew = false,
} = {}) {
  if (!store || typeof store.transaction !== 'function' || typeof store.readOne !== 'function') throw new TypeError('Custody reconciler requires the network store.');
  if (!Array.isArray(providers) || providers.length < 2 || providers.some((provider) => typeof provider?.readCustody !== 'function')) {
    throw new TypeError('Custody reconciler requires at least two approved providers.');
  }
  if (!Buffer.isBuffer(auditKey) && !(auditKey instanceof Uint8Array)) throw new TypeError('Custody reconciler requires a keyed audit hash secret.');
  if (auditKey.byteLength < 32) throw new TypeError('Custody audit hash key must be at least 256 bits.');
  if (typeof auditKeyId !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(auditKeyId)) throw new TypeError('Custody audit key ID is invalid.');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new TypeError('Custody provider timeout is invalid.');
  if (typeof now !== 'function') throw new TypeError('Custody clock is invalid.');
  if (typeof allowSafeBlockSkew !== 'boolean') throw new TypeError('Custody safe block skew policy is invalid.');
  const chainId = Number(release.chainId);
  const collection = getAddress(release.collection);

  async function reconcileToken({ tokenId } = {}, requestedRange = null) {
    const normalizedTokenId = normalizeTokenId(tokenId);
    const current = readCurrent(normalizedTokenId);
    const breakerOpen = readBreakerState(normalizedTokenId) === 'open';
    const fullRebuild = !current || current.status !== 'ready' || breakerOpen;
    const fromBlock = fullRebuild ? 0 : (requestedRange?.fromBlock ?? current.safeBlockNumber + 1);
    const toBlock = requestedRange?.toBlock ?? null;
    const request = deepFreeze({
      chainId,
      collection,
      tokenId: normalizedTokenId,
      fromBlock,
      toBlock,
      previousSafeBlock: current ? { number: current.safeBlockNumber, hash: current.safeBlockHash } : null,
    });
    const outcomes = await Promise.all(providers.map((provider) => timedRead(() => provider.readCustody(request), timeoutMs)));
    if (outcomes.some((outcome) => outcome.timeout)) return markIneligible(normalizedTokenId, current, 'provider_timeout');
    if (outcomes.some((outcome) => outcome.error)) return markIneligible(normalizedTokenId, current, 'provider_unavailable');

    const observations = [];
    for (const outcome of outcomes) {
      try {
        observations.push(normalizeEvidence(outcome.value, { tokenId: normalizedTokenId, release }));
      } catch (error) {
        return markIneligible(normalizedTokenId, current, error?.failureClass ?? 'unresolved_range');
      }
    }
    const safeCoordinate = canonical(observations[0].safeBlock);
    const safeDisagreement = observations.some((value) => canonical(value.safeBlock) !== safeCoordinate);
    const sameSafeNumber = observations.every((value) => value.safeBlock.number === observations[0].safeBlock.number);
    if (safeDisagreement && (!allowSafeBlockSkew || sameSafeNumber)) {
      return markIneligible(normalizedTokenId, current, 'safe_block_disagreement');
    }
    const comparable = (value) => ({ ...value, safeBlock: null, range: { ...value.range, toBlock: null } });
    const first = canonical(comparable(observations[0]));
    if (observations.some((value) => canonical(comparable(value)) !== first)) return markIneligible(normalizedTokenId, current, 'provider_disagreement');
    const evidence = safeDisagreement
      ? observations.reduce((older, value) => value.safeBlock.number < older.safeBlock.number ? value : older)
      : observations[0];

    if (current && !fullRebuild && evidence.priorSafeHash !== current.safeBlockHash) {
      return markIneligible(normalizedTokenId, current, 'prior_hash_mismatch');
    }
    const expectedTo = toBlock ?? evidence.safeBlock.number;
    if (evidence.range.fromBlock !== fromBlock || evidence.range.toBlock !== expectedTo || evidence.safeBlock.number < expectedTo) {
      return markIneligible(normalizedTokenId, current, 'unresolved_range');
    }
    if (evidence.latestOwner !== evidence.safeOwner || evidence.latestController !== evidence.safeController) {
      return markIneligible(normalizedTokenId, current, 'latest_authority_mismatch');
    }
    try {
      replayEventHistory({ evidence, prior: fullRebuild ? null : current, release });
    } catch {
      return markIneligible(normalizedTokenId, current, 'event_history_invalid');
    }

    const transitions = evidence.events.length;
    const rebuilt = Boolean(current && fullRebuild);
    const generation = current
      ? current.generation + (rebuilt ? Math.max(1, transitions) : transitions)
      : Math.max(1, transitions);
    const lastEvent = evidence.events.at(-1);
    const eventBlockNumber = lastEvent?.blockNumber ?? current?.eventBlockNumber ?? 0;
    const eventLogIndex = lastEvent?.logIndex ?? current?.eventLogIndex ?? 0;
    const timestamp = normalizeTime(now());

    store.transaction('custody_ready', (tx) => {
      if (current && generation === current.generation) {
        tx.run(
          'UPDATE restap_network_custody_epochs SET canonical_account = ?, owner_address = ?, controller_address = ?, safe_block_number = ?, safe_block_hash = ?, event_block_number = ?, event_log_index = ?, status = ?, updated_at = ? WHERE chain_id = ? AND collection = ? AND token_id = ? AND generation = ?',
          [evidence.canonicalAccount, evidence.safeOwner, evidence.safeController, evidence.safeBlock.number, strip0x(evidence.safeBlock.hash), eventBlockNumber, eventLogIndex, 'ready', timestamp, chainId, collection, normalizedTokenId, generation],
        );
      } else {
        tx.run(
          'INSERT INTO restap_network_custody_epochs (chain_id, collection, token_id, generation, canonical_account, owner_address, controller_address, safe_block_number, safe_block_hash, event_block_number, event_log_index, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [chainId, collection, normalizedTokenId, generation, evidence.canonicalAccount, evidence.safeOwner, evidence.safeController, evidence.safeBlock.number, strip0x(evidence.safeBlock.hash), eventBlockNumber, eventLogIndex, 'ready', timestamp],
        );
      }
      closeBreaker(tx, normalizedTokenId, timestamp);
    });
    return deepFreeze({ eligible: true, status: 'ready', generation, rebuilt });
  }

  async function reconcileRange({ fromBlock, toBlock } = {}) {
    const start = normalizeBlockNumber(fromBlock);
    const end = normalizeBlockNumber(toBlock);
    if (end < start || end - start + 1 > 2_000) throw new TypeError('Custody reconciliation range is invalid or unbounded.');
    const outcomes = await Promise.all(providers.map((provider) => timedRead(
      () => provider.listAffectedTokens?.({ chainId, collection, fromBlock: start, toBlock: end }),
      timeoutMs,
    )));
    const tokenSets = [];
    let unavailable = false;
    for (const outcome of outcomes) {
      if (outcome.timeout || outcome.error || !Array.isArray(outcome.value)) {
        if (!outcome.timeout) unavailable = true;
        continue;
      }
      try {
        tokenSets.push([...new Set(outcome.value.map(normalizeTokenId))].sort(compareTokenIds));
      } catch {
        unavailable = true;
      }
    }
    const union = [...new Set(tokenSets.flat())].sort(compareTokenIds);
    if (outcomes.some((outcome) => outcome.timeout)) return markRangeIneligible(union, 'provider_timeout', start, end);
    if (unavailable || tokenSets.length !== providers.length) return markRangeIneligible(union, 'provider_unavailable', start, end);
    if (tokenSets.some((tokens) => canonical(tokens) !== canonical(tokenSets[0]))) {
      return markRangeIneligible(union, 'provider_disagreement', start, end);
    }
    let ready = 0;
    let ineligible = 0;
    for (const affectedTokenId of tokenSets[0]) {
      const result = await reconcileToken({ tokenId: affectedTokenId }, { fromBlock: start, toBlock: end });
      if (result.eligible) ready += 1; else ineligible += 1;
    }
    return deepFreeze({ fromBlock: start, toBlock: end, tokenIds: tokenSets[0], ready, ineligible });
  }

  function getEpochSnapshot({ tokenId } = {}) {
    const current = readCurrent(normalizeTokenId(tokenId));
    return current ? deepFreeze({ ...current }) : null;
  }

  function readCurrent(tokenId) {
    const row = store.readOne(
      'SELECT generation, canonical_account, owner_address, controller_address, safe_block_number, safe_block_hash, event_block_number, event_log_index, status, updated_at FROM restap_network_custody_epochs WHERE chain_id = ? AND collection = ? AND token_id = ? ORDER BY generation DESC LIMIT 1',
      [chainId, collection, tokenId],
    );
    if (!row) return null;
    return {
      chainId,
      collection,
      tokenId,
      generation: Number(row.generation),
      canonicalAccount: getAddress(row.canonical_account),
      owner: getAddress(row.owner_address),
      controller: getAddress(row.controller_address),
      safeBlockNumber: Number(row.safe_block_number),
      safeBlockHash: '0x' + row.safe_block_hash,
      eventBlockNumber: Number(row.event_block_number),
      eventLogIndex: Number(row.event_log_index),
      status: row.status,
      updatedAt: Number(row.updated_at),
    };
  }

  function readBreakerState(tokenId) {
    return store.readOne(
      "SELECT state FROM restap_network_circuit_breakers WHERE scope_class = 'token' AND scope_digest = ?",
      [tokenDigest(tokenId)],
    )?.state ?? null;
  }

  function markIneligible(tokenId, current, status) {
    const timestamp = normalizeTime(now());
    store.transaction('custody_ineligible', (tx) => {
      if (current) markCurrentEpochDisputed(tx, tokenId, timestamp);
      openBreaker(tx, tokenId, status, timestamp);
    });
    return deepFreeze({ eligible: false, status, generation: current?.generation ?? null, rebuilt: false });
  }

  function markRangeIneligible(tokenIds, status, fromBlock, toBlock) {
    const timestamp = normalizeTime(now());
    if (tokenIds.length) {
      store.transaction('custody_range_ineligible', (tx) => {
        for (const tokenId of tokenIds) {
          markCurrentEpochDisputed(tx, tokenId, timestamp);
          openBreaker(tx, tokenId, status, timestamp);
        }
      });
    }
    return deepFreeze({ eligible: false, status, fromBlock, toBlock, tokenIds });
  }

  function markCurrentEpochDisputed(tx, tokenId, timestamp) {
    tx.run(
      "UPDATE restap_network_custody_epochs SET status = 'disputed', updated_at = ? WHERE chain_id = ? AND collection = ? AND token_id = ? AND generation = (SELECT MAX(generation) FROM restap_network_custody_epochs WHERE chain_id = ? AND collection = ? AND token_id = ?)",
      [timestamp, chainId, collection, tokenId, chainId, collection, tokenId],
    );
  }

  function openBreaker(tx, tokenId, reason, timestamp) {
    const digest = tokenDigest(tokenId);
    const currentBreaker = tx.get("SELECT generation FROM restap_network_circuit_breakers WHERE scope_class = 'token' AND scope_digest = ?", [digest]);
    const generation = Number(currentBreaker?.generation ?? 0) + 1;
    tx.run(
      "INSERT INTO restap_network_circuit_breakers (breaker_id, scope_class, scope_digest, state, generation, reason_class, opened_at, updated_at) VALUES (?, 'token', ?, 'open', ?, ?, ?, ?) ON CONFLICT(scope_class, scope_digest) DO UPDATE SET state = 'open', generation = excluded.generation, reason_class = excluded.reason_class, opened_at = excluded.opened_at, updated_at = excluded.updated_at",
      ['token:' + digest, digest, generation, reason, timestamp, timestamp],
    );
  }

  function closeBreaker(tx, tokenId, timestamp) {
    const digest = tokenDigest(tokenId);
    const currentBreaker = tx.get("SELECT generation FROM restap_network_circuit_breakers WHERE scope_class = 'token' AND scope_digest = ?", [digest]);
    tx.run(
      "INSERT INTO restap_network_circuit_breakers (breaker_id, scope_class, scope_digest, state, generation, reason_class, opened_at, updated_at) VALUES (?, 'token', ?, 'closed', ?, NULL, NULL, ?) ON CONFLICT(scope_class, scope_digest) DO UPDATE SET state = 'closed', reason_class = NULL, opened_at = NULL, updated_at = excluded.updated_at",
      ['token:' + digest, digest, Number(currentBreaker?.generation ?? 0), timestamp],
    );
  }

  function tokenDigest(tokenId) {
    return createHmac('sha256', auditKey)
      .update(auditKeyId + ':' + chainId + ':' + collection.toLowerCase() + ':' + tokenId)
      .digest('hex');
  }

  return Object.freeze({ reconcileToken, reconcileRange, getEpochSnapshot });
}

function normalizeEvidence(value, { tokenId, release }) {
  if (!isPlainObject(value) || !isPlainObject(value.safeBlock) || !isPlainObject(value.range) || !Array.isArray(value.events)) throw new TypeError('Malformed custody evidence.');
  const safeBlock = { number: normalizeBlockNumber(value.safeBlock.number), hash: normalizeHash(value.safeBlock.hash) };
  const range = { fromBlock: normalizeBlockNumber(value.range.fromBlock), toBlock: normalizeBlockNumber(value.range.toBlock) };
  const canonicalAccount = getAddress(value.canonicalAccount);
  if (canonicalAccount !== deriveReleasedAccount({ tokenId, release })) throw new TypeError('Wrong canonical account.');
  let events;
  try {
    events = value.events.map((event) => normalizeEvent(event, { tokenId, release, range, safeBlock })).sort(compareEvents);
  } catch (error) {
    const failure = new Error('Custody event history is invalid.', { cause: error });
    failure.failureClass = 'event_history_invalid';
    throw failure;
  }
  return deepFreeze({
    safeBlock,
    safeOwner: getAddress(value.safeOwner),
    safeController: getAddress(value.safeController),
    latestOwner: getAddress(value.latestOwner),
    latestController: getAddress(value.latestController),
    canonicalAccount,
    range,
    events,
    priorSafeHash: value.priorSafeHash === null || value.priorSafeHash === undefined ? null : normalizeHash(value.priorSafeHash),
  });
}

function normalizeEvent(event, { tokenId, release, range, safeBlock }) {
  if (!isPlainObject(event) || !['transfer', 'controller'].includes(event.kind)) throw new TypeError('Malformed custody event.');
  const blockNumber = normalizeBlockNumber(event.blockNumber);
  if (blockNumber < range.fromBlock || blockNumber > range.toBlock || blockNumber > safeBlock.number) throw new TypeError('Custody event outside resolved range.');
  const source = getAddress(event.source);
  const expectedSource = event.kind === 'transfer' ? getAddress(release.collection) : getAddress(release.controllerSource);
  if (source !== expectedSource || normalizeTokenId(event.tokenId) !== tokenId) throw new TypeError('Custody event source or token mismatch.');
  return {
    kind: event.kind,
    source,
    tokenId,
    blockNumber,
    blockHash: normalizeHash(event.blockHash),
    transactionHash: normalizeHash(event.transactionHash),
    transactionIndex: normalizeBlockNumber(event.transactionIndex),
    logIndex: normalizeBlockNumber(event.logIndex),
    from: getAddress(event.from),
    to: getAddress(event.to),
  };
}

function replayEventHistory({ evidence, prior, release }) {
  const positions = new Set();
  const logIds = new Set();
  let owner = prior?.owner ?? evidence.events.find((event) => event.kind === 'transfer')?.from ?? evidence.safeOwner;
  let controller = prior?.controller ?? evidence.events.find((event) => event.kind === 'controller')?.from ?? evidence.safeController;
  for (const event of evidence.events) {
    const position = [event.blockNumber, event.transactionIndex, event.logIndex].join(':');
    const logId = [event.transactionHash, event.logIndex].join(':');
    if (positions.has(position) || logIds.has(logId)) throw new Error('Duplicate custody event coordinate.');
    positions.add(position);
    logIds.add(logId);
    if (event.kind === 'transfer') {
      if (event.from !== owner) throw new Error('Contradictory Transfer history.');
      owner = event.to;
      if (release.controllerModel === 'erc721_owner') controller = event.to;
    } else {
      if (event.from !== controller) throw new Error('Contradictory controller history.');
      controller = event.to;
    }
  }
  if (owner !== evidence.safeOwner || controller !== evidence.safeController) throw new Error('Custody event history does not resolve to safe authority.');
}

async function timedRead(read, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(read).then((value) => ({ value }), (error) => ({ error })),
      new Promise((resolve) => { timer = setTimeout(() => resolve({ timeout: true }), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

function normalizeTokenId(value) {
  const text = typeof value === 'bigint' ? value.toString() : String(value ?? '');
  if (!/^[1-9]\d*$/u.test(text) || BigInt(text) > ((1n << 256n) - 1n)) throw new TypeError('Custody token ID is invalid.');
  return text;
}
function normalizeBlockNumber(value) {
  const number = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new TypeError('Custody block coordinate is invalid.');
  return number;
}
function normalizeTime(value) {
  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new TypeError('Custody timestamp is invalid.');
  return timestamp;
}
function normalizeHash(value) {
  const hash = String(value ?? '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(hash)) throw new TypeError('Custody hash is invalid.');
  return hash;
}
function strip0x(value) { return value.slice(2); }
function compareTokenIds(left, right) { return BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0; }
function compareEvents(left, right) { return left.blockNumber - right.blockNumber || left.transactionIndex - right.transactionIndex || left.logIndex - right.logIndex; }
function canonical(value) { return JSON.stringify(value); }
function isPlainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}
