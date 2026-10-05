import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

import { createRestapNetworkDatabase } from './database.js';
import { createRestapNetworkPolicyStore } from './policy-store.js';
import { composeRestapVerifiedSendProduction } from './verified-send-production.js';

/**
 * Rehearses the production composition against an online SQLite backup.
 * The proof uses deterministic in-process providers only; it never creates a
 * fetch client, socket, public listener, or legacy worker.
 */
export async function rehearseRestapVerifiedSend({
  sourceDatabasePath,
  input,
  openingText = 'Isolated verified-send rehearsal opening.',
  replyText = 'Isolated verified-send rehearsal reply.',
  now = Date.now,
  onNetworkAttempt = null,
} = {}) {
  if (typeof sourceDatabasePath !== 'string' || !path.isAbsolute(sourceDatabasePath)) throw new TypeError('Rehearsal source database path must be absolute.');
  if (typeof now !== 'function') throw new TypeError('Rehearsal clock is invalid.');
  if (onNetworkAttempt !== null && typeof onNetworkAttempt !== 'function') throw new TypeError('Rehearsal network sentinel is invalid.');
  const opening = boundedPlaintext(openingText, 'opening', 2_000);
  const reply = boundedPlaintext(replyText, 'reply', 4_096);
  const before = await fileDigest(sourceDatabasePath);
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'restap-verified-send-rehearsal-'));
  const isolatedDatabasePath = path.join(temporaryDirectory, 'network.sqlite');
  let sourceDatabase;
  let store;
  try {
    sourceDatabase = new DatabaseSync(sourceDatabasePath, { readOnly: true });
    await backup(sourceDatabase, isolatedDatabasePath);
    sourceDatabase.close();
    sourceDatabase = null;

    store = createRestapNetworkDatabase({ filename: isolatedDatabasePath });
    const codexRuntime = Object.freeze({
      available: true,
      status: Object.freeze({ available: true, artifactHash: '0'.repeat(64), count: 2 }),
      getProfileContext(tokenId) { return Object.freeze({ identity: Object.freeze({ tokenId: String(tokenId), canonicalName: 'Rehearsal Looper #' + tokenId }) }); },
    });
    const recipientTokenId = String(input?.recipientTokenId ?? '');
    let openingCalls = 0;
    let recipientCalls = 0;
    const composeIsolated = () => composeRestapVerifiedSendProduction({
        config: Object.freeze({ enabled: true, emergencyStop: false, recipientTokenIds: Object.freeze([recipientTokenId]) }),
        store,
        custodyReconciler: createPersistedCustodyReader(store),
        policyReader: createRestapNetworkPolicyStore({ store, now, tokenScopeDigest: () => '0'.repeat(64) }),
        codexRuntime,
        openingRuntime: Object.freeze({ async generate() { openingCalls += 1; return Object.freeze({ message: opening, usage: null }); } }),
        recipientRuntimes: Object.freeze({
          [recipientTokenId]: Object.freeze({ async talk({ stateless, sessionId } = {}) {
            if (stateless !== true || sessionId !== undefined) throw new Error('Rehearsal recipient was not stateless.');
            recipientCalls += 1;
            return Object.freeze({ reply, usage: null });
          } }),
        }),
        resolvePublicProjection: async () => Object.freeze({ rehearsal: true }),
        now,
      });
    let composition = composeIsolated();
    const result = await composition.service.send(input);
    await Promise.resolve(store.checkpoint());
    store.close();
    store = createRestapNetworkDatabase({ filename: isolatedDatabasePath });
    composition = composeIsolated();
    const replay = await composition.service.send(input);
    if (openingCalls !== 1 || recipientCalls !== 1) throw new Error('Rehearsal provider call bound failed.');
    await Promise.resolve(store.checkpoint());
    store.close();
    store = null;
    const plaintextFree = !(await anyFileContains([isolatedDatabasePath, isolatedDatabasePath + '-wal', isolatedDatabasePath + '-shm'], [opening, reply]));
    const sourceUnchanged = before === await fileDigest(sourceDatabasePath);
    if (!plaintextFree) throw new Error('Rehearsal detected plaintext persistence.');
    if (!sourceUnchanged) throw new Error('Rehearsal source database changed.');
    return Object.freeze({
      status: result.status,
      replayStatus: replay.status,
      replayed: replay.replayed === true,
      operationId: result.operationId,
      plaintextFree,
      sourceUnchanged,
      temporaryDirectory,
    });
  } finally {
    try { store?.close(); } catch {}
    try { sourceDatabase?.close(); } catch {}
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function createPersistedCustodyReader(store) {
  function getEpochSnapshot({ tokenId }) {
    const row = store.readOne('SELECT * FROM restap_network_custody_epochs WHERE token_id = ? ORDER BY generation DESC LIMIT 1', [String(tokenId)]);
    if (!row) return null;
    return Object.freeze({
      chainId: Number(row.chain_id), collection: row.collection, tokenId: row.token_id, generation: Number(row.generation),
      canonicalAccount: row.canonical_account, owner: row.owner_address, controller: row.controller_address,
      safeBlockNumber: Number(row.safe_block_number), safeBlockHash: '0x' + row.safe_block_hash, status: row.status,
    });
  }
  return Object.freeze({
    async reconcileToken({ tokenId }) {
      const value = getEpochSnapshot({ tokenId });
      return value?.status === 'ready' ? Object.freeze({ eligible: true, status: 'ready', generation: value.generation }) : Object.freeze({ eligible: false, status: value?.status ?? 'missing' });
    },
    getEpochSnapshot,
  });
}

async function fileDigest(filename) { return createHash('sha256').update(await readFile(filename)).digest('hex'); }
async function anyFileContains(files, needles) {
  for (const filename of files) {
    let bytes;
    try { bytes = await readFile(filename); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (needles.some((value) => bytes.includes(Buffer.from(value)))) return true;
  }
  return false;
}
function boundedPlaintext(value, label, maximum) {
  if (typeof value !== 'string' || !value || /[\u0000-\u001f\u007f]/u.test(value) || Buffer.byteLength(value, 'utf8') > maximum) throw new TypeError('Rehearsal ' + label + ' is invalid.');
  return value;
}
