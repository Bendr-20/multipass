import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, sign as cryptoSign } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createRestapNetworkDatabase } from '../src/restap-network/database.js';
import {
  canonicalizeRestapNetworkGrant,
  createRestapNetworkGrantService,
  createRestapNetworkPublicKeyRegistry,
  hashRestapNetworkGrant,
  loadRestapNetworkFileSigner,
  loadRestapNetworkPublicKeyRegistryFile,
  parseRestapNetworkGrantJson,
} from '../src/restap-network/grants.js';
import { canonicalizeRestapNetworkJson } from '../src/restap-network/jcs.js';

const NOW = 1_700_000_000;
const KEY_ID = 'test-key-000000000000000000000001';
const SEED_HEX = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const PUBLIC_HEX = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
const PRIVATE_DER = Buffer.from('302e020100300506032b657004220420' + SEED_HEX, 'hex');
const PUBLIC_DER = Buffer.from('302a300506032b6570032100' + PUBLIC_HEX, 'hex');
const PRIVATE_KEY = createPrivateKey({ key: PRIVATE_DER, format: 'der', type: 'pkcs8' });
const CANONICAL = '{"header":{"alg":"Ed25519","kid":"test-key-000000000000000000000001","schema_version":"1","typ":"looper-communication-grant+jcs"},"payload":{"aud":"helixa-restap-network-relay","body_sha256":"abababababababababababababababababababababababababababababababab","chain_id":8453,"collection":"0x1649cd37f4748807b4882fc48765ba0b2affa94a","correlation_id":"correlation-00000000000000000001","exp":1700000120,"iat":1700000000,"iss":"helixa-restap-network","nbf":1700000000,"nonce":"nonce-000000000000000000000000001","operation":"opening","operation_id":"operation-00000000000000000000001","path":"restap-network:opening","recipient_activation_lease_id":"22222222222222222222222222222222","recipient_custody_epoch":8,"recipient_policy_version":4,"recipient_token_id":"2","reservation":{"concurrency_per_token":2,"conversations":1,"cost_units":99,"messages":1},"sender_account":"0x3333333333333333333333333333333333333333","sender_activation_lease_id":"11111111111111111111111111111111","sender_custody_epoch":7,"sender_identity_id":"codex:1","sender_policy_version":3,"sender_token_id":"1"}}';
const HASH = '0436590e04f1107857ce658a1c9b135a7f09e99ef16bce71163a285028f55e7c';
const SIGNATURE = 'gmiWc_BVUi87spfUe2xW0Nh2oskhBIgtTfmDq-YM7kp0ti6JnxLSRGhEgvyzlokCdX-akEBM4_0QxMyCvSMkBw';

function payload() {
  return {
    iss: 'helixa-restap-network', aud: 'helixa-restap-network-relay', chain_id: 8453,
    collection: '0x1649cd37f4748807b4882fc48765ba0b2affa94a', sender_token_id: '1',
    sender_account: '0x3333333333333333333333333333333333333333', sender_identity_id: 'codex:1',
    sender_custody_epoch: 7, sender_activation_lease_id: '1'.repeat(32), recipient_token_id: '2',
    recipient_custody_epoch: 8, recipient_activation_lease_id: '2'.repeat(32), operation: 'opening',
    path: 'restap-network:opening', body_sha256: 'ab'.repeat(32), iat: NOW, nbf: NOW, exp: NOW + 120,
    nonce: 'nonce-000000000000000000000000001', operation_id: 'operation-00000000000000000000001',
    correlation_id: 'correlation-00000000000000000001', sender_policy_version: 3, recipient_policy_version: 4,
    reservation: { conversations: 1, messages: 1, concurrency_per_token: 2, cost_units: 99 },
  };
}

function key(status = 'signing', patch = {}) {
  return {
    keyId: KEY_ID, algorithm: 'Ed25519', publicKey: PUBLIC_DER, activatesAt: NOW - 100,
    notBefore: NOW - 100, notAfter: NOW + 10_000, status, ...patch,
  };
}

function registryFileKey(patch = {}) {
  return {
    key_id: KEY_ID,
    algorithm: 'Ed25519',
    public_key_spki_der_base64: PUBLIC_DER.toString('base64'),
    activates_at: NOW - 100,
    not_before: NOW - 100,
    not_after: NOW + 10_000,
    status: 'signing',
    ...patch,
  };
}

function registryFileBody(keys = [registryFileKey()]) {
  return JSON.stringify({ schema_version: '1', keys });
}

function registryFileOpen(body, statPatch = {}) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  const stat = { uid: 0, gid: process.getgid(), mode: 0o100640, size: bytes.byteLength, isFile: () => true, ...statPatch };
  let closes = 0;
  let flags;
  return {
    get closes() { return closes; },
    get flags() { return flags; },
    openImpl: async (_path, receivedFlags) => {
      flags = receivedFlags;
      return { stat: async () => stat, readFile: async () => bytes, close: async () => { closes += 1; } };
    },
  };
}

function fixture({ keys = [key()], now = NOW, signerPatch = {} } = {}) {
  const signed = [];
  const signer = Object.freeze({
    keyId: KEY_ID,
    async sign(bytes) { signed.push(Buffer.from(bytes)); return cryptoSign(null, bytes, PRIVATE_KEY); },
    ...signerPatch,
  });
  const keyRegistry = createRestapNetworkPublicKeyRegistry({ keys });
  const service = createRestapNetworkGrantService({ signer, keyRegistry, now: () => now });
  return { signer, signed, keyRegistry, service };
}

test('pins exact JCS bytes, SHA-256, and RFC 8032 Ed25519 signature', async () => {
  const f = fixture();
  const grant = await f.service.issue(payload());
  assert.equal(canonicalizeRestapNetworkGrant(grant), CANONICAL);
  assert.equal(hashRestapNetworkGrant(grant), HASH);
  assert.equal(grant.signature, SIGNATURE);
  assert.equal(f.signed.length, 1);
  assert.deepEqual(f.signed[0], Buffer.from(CANONICAL));
  assert.equal(Object.isFrozen(grant), true);
  assert.equal(Object.isFrozen(grant.payload.reservation), true);
  assert.deepEqual(await f.service.verify({ grant, expectedPayload: payload() }), { status: 'verified', payload: grant.payload });
});

test('JCS key permutation is equivalent while array order remains bound', async () => {
  const original = payload();
  const permuted = Object.fromEntries(Object.entries(original).reverse());
  permuted.reservation = Object.fromEntries(Object.entries(original.reservation).reverse());
  const a = await fixture().service.issue(original);
  const b = await fixture().service.issue(permuted);
  assert.equal(canonicalizeRestapNetworkGrant(a), canonicalizeRestapNetworkGrant(b));
  assert.equal(a.signature, b.signature);
  assert.notEqual(canonicalizeRestapNetworkJson({ order: ['sender', 'recipient'] }), canonicalizeRestapNetworkJson({ order: ['recipient', 'sender'] }));
});

test('verification uniformly rejects every authority and request binding mismatch', async () => {
  const f = fixture();
  const grant = await f.service.issue(payload());
  const cases = [
    ['sender', (p) => { p.sender_token_id = '3'; }],
    ['recipient', (p) => { p.recipient_token_id = '4'; }],
    ['path', (p) => { p.path = 'restap-network:reply'; }],
    ['operation', (p) => { p.operation = 'reply'; p.path = 'restap-network:reply'; }],
    ['body', (p) => { p.body_sha256 = 'cd'.repeat(32); }],
    ['nonce', (p) => { p.nonce = 'nonce-999999999999999999999999999'; }],
    ['audience', (p) => { p.aud = 'other'; }],
    ['time', (p) => { p.exp -= 1; }],
    ['sender lease', (p) => { p.sender_activation_lease_id = '3'.repeat(32); }],
    ['recipient lease', (p) => { p.recipient_activation_lease_id = '4'.repeat(32); }],
    ['sender epoch', (p) => { p.sender_custody_epoch += 1; }],
    ['recipient epoch', (p) => { p.recipient_custody_epoch += 1; }],
    ['sender policy', (p) => { p.sender_policy_version += 1; }],
    ['recipient policy', (p) => { p.recipient_policy_version += 1; }],
  ];
  for (const [label, mutate] of cases) {
    const expected = structuredClone(payload()); mutate(expected);
    assert.deepEqual(await f.service.verify({ grant, expectedPayload: expected }), { status: 'authentication_failed' }, label);
  }
  assert.deepEqual(await f.service.verify({ grant: { ...grant, header: { ...grant.header, alg: 'none' } }, expectedPayload: payload() }), { status: 'authentication_failed' });
  assert.deepEqual(await f.service.verify({ grant: { ...grant, header: { ...grant.header, kid: 'unknown-key-000000000000000000001' } }, expectedPayload: payload() }), { status: 'authentication_failed' });
});

test('time windows and signing/overlap/retired/compromised key states fail closed', async () => {
  const grant = await fixture().service.issue(payload());
  for (const [label, options] of [
    ['early grant', { now: NOW - 1 }], ['expired grant', { now: NOW + 121 }],
    ['early key', { keys: [key('signing', { notBefore: NOW + 1 })] }],
    ['expired key', { keys: [key('signing', { notAfter: NOW + 100 })], now: NOW + 101 }],
    ['retired key', { keys: [key('retired')] }], ['compromised key', { keys: [key('compromised')] }],
  ]) {
    const registry = createRestapNetworkPublicKeyRegistry({ keys: options.keys ?? [key()] , requireSigningKey: false });
    const service = createRestapNetworkGrantService({ signer: null, keyRegistry: registry, now: () => options.now ?? NOW });
    assert.deepEqual(await service.verify({ grant, expectedPayload: payload() }), { status: 'authentication_failed' }, label);
  }
  const overlapId = 'overlap-key-0000000000000000000001';
  const registry = createRestapNetworkPublicKeyRegistry({ keys: [key(), key('overlap', { keyId: overlapId })] });
  const overlapGrant = { ...grant, header: { ...grant.header, kid: overlapId } };
  const bytes = Buffer.from(canonicalizeRestapNetworkGrant(overlapGrant));
  overlapGrant.signature = cryptoSign(null, bytes, PRIVATE_KEY).toString('base64url');
  assert.equal((await createRestapNetworkGrantService({ signer: null, keyRegistry: registry, now: () => NOW }).verify({ grant: overlapGrant, expectedPayload: payload() })).status, 'verified');
  assert.throws(() => createRestapNetworkPublicKeyRegistry({ keys: [key(), key('signing', { keyId: overlapId })] }), /exactly one signing/i);
});

test('HTTP JSON parsing rejects duplicate decoded keys, non-JSON values, and malformed signatures', async () => {
  const grant = await fixture().service.issue(payload());
  assert.deepEqual(parseRestapNetworkGrantJson(JSON.stringify(grant)), grant);
  const duplicate = JSON.stringify(grant).replace('"alg":"Ed25519"', '"alg":"Ed25519","\u0061lg":"none"');
  assert.throws(() => parseRestapNetworkGrantJson(duplicate), /authentication/i);
  assert.throws(() => parseRestapNetworkGrantJson('{"header":NaN}'), /authentication/i);
  assert.deepEqual(await fixture().service.verify({ grant: { ...grant, signature: 'not-base64url' }, expectedPayload: payload() }), { status: 'authentication_failed' });
});

test('public-key registry boundary rejects accessors and custom prototypes', () => {
  const accessorKey = key();
  Object.defineProperty(accessorKey, 'status', { enumerable: true, get: () => 'signing' });
  assert.throws(() => createRestapNetworkPublicKeyRegistry({ keys: [accessorKey] }), /public key/i);

  const prototypeKey = Object.assign(Object.create({ inherited: true }), key());
  assert.throws(() => createRestapNetworkPublicKeyRegistry({ keys: [prototypeKey] }), /public key/i);
});

test('protected public-key registry file loads one signing key and one overlap key', async () => {
  const overlapId = 'overlap-key-0000000000000000000001';
  const source = registryFileOpen(registryFileBody([
    registryFileKey(),
    registryFileKey({ key_id: overlapId, status: 'overlap' }),
  ]));
  const registry = await loadRestapNetworkPublicKeyRegistryFile({
    filePath: '/run/secrets/restap-network-public-keys.json',
    openImpl: source.openImpl,
  });

  assert.equal(source.flags, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  assert.equal(source.closes, 1);
  const signing = registry.get(KEY_ID);
  assert.deepEqual(
    {
      keyId: signing.keyId,
      algorithm: signing.algorithm,
      publicKeyDer: signing.publicKey.export({ format: 'der', type: 'spki' }),
      activatesAt: signing.activatesAt,
      notBefore: signing.notBefore,
      notAfter: signing.notAfter,
      status: signing.status,
    },
    {
      keyId: KEY_ID,
      algorithm: 'Ed25519',
      publicKeyDer: PUBLIC_DER,
      activatesAt: NOW - 100,
      notBefore: NOW - 100,
      notAfter: NOW + 10_000,
      status: 'signing',
    },
  );
  assert.equal(registry.get(overlapId).status, 'overlap');
  assert.equal(registry.get('missing'), null);
});

test('protected public-key registry accepts root-owned service-group-readable mode-0640 files', async () => {
  const source = registryFileOpen(registryFileBody(), { mode: 0o100640, gid: process.getgid() });
  const registry = await loadRestapNetworkPublicKeyRegistryFile({ filePath: '/run/secrets/restap-network-public-keys.json', openImpl: source.openImpl });
  assert.equal(registry.get(KEY_ID).status, 'signing');
});

test('protected public-key registry file rejects unsafe paths, metadata, symlinks, size, and UTF-8', async () => {
  const body = registryFileBody();
  const source = registryFileOpen(body);
  await assert.rejects(() => loadRestapNetworkPublicKeyRegistryFile({ filePath: 'relative.json', openImpl: source.openImpl }), /registry unavailable/i);
  assert.equal(source.closes, 0);

  for (const statPatch of [
    { uid: 1000 },
    { mode: 0o100600 },
    { mode: 0o100640, gid: process.getgid() + 1 },
    { mode: 0o104640 },
    { isFile: () => false },
    { size: (64 * 1024) + 1 },
  ]) {
    const unsafe = registryFileOpen(body, statPatch);
    await assert.rejects(() => loadRestapNetworkPublicKeyRegistryFile({ filePath: '/secret', openImpl: unsafe.openImpl }), /registry unavailable/i);
    assert.equal(unsafe.closes, 1);
  }

  const symlinkOpen = async (_path, flags) => {
    assert.equal(flags & fsConstants.O_NOFOLLOW, fsConstants.O_NOFOLLOW);
    const error = new Error('symbolic link'); error.code = 'ELOOP'; throw error;
  };
  await assert.rejects(() => loadRestapNetworkPublicKeyRegistryFile({ filePath: '/symlink', openImpl: symlinkOpen }), /registry unavailable/i);

  const invalidUtf8 = registryFileOpen(Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d]));
  await assert.rejects(() => loadRestapNetworkPublicKeyRegistryFile({ filePath: '/invalid-utf8', openImpl: invalidUtf8.openImpl }), /registry unavailable/i);
  const grown = registryFileOpen(Buffer.alloc((64 * 1024) + 1, 0x20), { size: 1 });
  await assert.rejects(() => loadRestapNetworkPublicKeyRegistryFile({ filePath: '/grown', openImpl: grown.openImpl }), /registry unavailable/i);
});

test('protected public-key registry file enforces duplicate-free exact JSON schema', async () => {
  const validKey = registryFileKey();
  const cases = [
    '{}',
    JSON.stringify({ schema_version: '2', keys: [validKey] }),
    JSON.stringify({ schema_version: '1', keys: [validKey], extra: true }),
    JSON.stringify({ schema_version: '1', keys: [] }),
    JSON.stringify({ schema_version: '1', keys: [validKey, validKey, validKey] }),
    JSON.stringify({ schema_version: '1', keys: [{ ...validKey, extra: true }] }),
    JSON.stringify({ schema_version: '1', keys: [{ ...validKey, status: undefined }] }),
    registryFileBody().replace('{"key_id"', '{"__proto__":{},"key_id"'),
    registryFileBody().replace('"schema_version":"1"', '"schema_version":"1","\u0073chema_version":"1"'),
    registryFileBody().replace('"key_id"', '"key_id":"other-key-000000000000000000000001","\u006bey_id"'),
  ];
  for (const body of cases) {
    const source = registryFileOpen(body);
    await assert.rejects(() => loadRestapNetworkPublicKeyRegistryFile({ filePath: '/secret', openImpl: source.openImpl }), /registry unavailable/i, body);
  }
});

test('protected public-key registry file rejects a valid SPKI with trailing bytes accepted by Node', async () => {
  const publicKey = Buffer.concat([PUBLIC_DER, Buffer.from([0x00])]);
  assert.equal(createPublicKey({ key: publicKey, format: 'der', type: 'spki' }).asymmetricKeyType, 'ed25519');
  const source = registryFileOpen(registryFileBody([
    registryFileKey({ public_key_spki_der_base64: publicKey.toString('base64') }),
  ]));
  await assert.rejects(
    () => loadRestapNetworkPublicKeyRegistryFile({ filePath: '/secret', openImpl: source.openImpl }),
    /registry unavailable/i,
  );
});

test('protected public-key registry file rejects a non-canonical BER long-form length accepted by Node', async () => {
  const publicKey = Buffer.concat([Buffer.from([0x30, 0x81, 0x2a]), PUBLIC_DER.subarray(2)]);
  assert.equal(createPublicKey({ key: publicKey, format: 'der', type: 'spki' }).asymmetricKeyType, 'ed25519');
  const source = registryFileOpen(registryFileBody([
    registryFileKey({ public_key_spki_der_base64: publicKey.toString('base64') }),
  ]));
  await assert.rejects(
    () => loadRestapNetworkPublicKeyRegistryFile({ filePath: '/secret', openImpl: source.openImpl }),
    /registry unavailable/i,
  );
});

test('protected public-key registry file rejects invalid keys before registry construction', async () => {
  const secondId = 'second-key-00000000000000000000001';
  const cases = [
    [registryFileKey({ algorithm: 'RSA' })],
    [registryFileKey({ status: 'unknown' })],
    [registryFileKey({ public_key_spki_der_base64: 'not base64' })],
    [registryFileKey({ public_key_spki_der_base64: PUBLIC_DER.toString('base64').replace(/=$/u, '') })],
    [registryFileKey({ public_key_spki_der_base64: PRIVATE_DER.toString('base64') })],
    [registryFileKey({ not_before: NOW - 101 })],
    [registryFileKey({ not_after: NOW - 100 })],
    [registryFileKey(), registryFileKey()],
    [registryFileKey(), registryFileKey({ key_id: secondId, status: 'signing' })],
    [registryFileKey({ status: 'retired' })],
    [registryFileKey({ key_id: 'short' })],
    [registryFileKey({ activates_at: 1.5 })],
  ];
  for (const keys of cases) {
    const source = registryFileOpen(registryFileBody(keys));
    await assert.rejects(() => loadRestapNetworkPublicKeyRegistryFile({ filePath: '/secret', openImpl: source.openImpl }), /registry unavailable/i, JSON.stringify(keys));
  }
});

test('file signer requires root-owned service-group-readable mode-0640 and exposes sign(bytes) only', async () => {
  const fileBody = JSON.stringify({ key_id: KEY_ID, pkcs8_der_base64: PRIVATE_DER.toString('base64') });
  const safeStat = { uid: 0, gid: process.getgid(), mode: 0o100640, isFile: () => true };
  let closes = 0;
  const openImpl = async () => ({ stat: async () => safeStat, readFile: async () => fileBody, close: async () => { closes += 1; } });
  const signer = await loadRestapNetworkFileSigner({ filePath: '/run/secrets/restap-network-signer', openImpl });
  assert.deepEqual(Object.keys(signer), ['keyId', 'sign']);
  assert.equal(signer.keyId, KEY_ID);
  assert.equal(Buffer.from(await signer.sign(Buffer.from(CANONICAL))).byteLength, 64);
  await assert.rejects(() => signer.sign(Buffer.from('proof')), /signing unavailable/i);
  assert.equal(closes, 1);
  for (const unsafe of [
    { ...safeStat, uid: 1000 }, { ...safeStat, gid: process.getgid() + 1 },
    { ...safeStat, mode: 0o100600 }, { ...safeStat, mode: 0o104640 }, { ...safeStat, isFile: () => false },
  ]) await assert.rejects(() => loadRestapNetworkFileSigner({ filePath: '/secret', openImpl: async () => ({ stat: async () => unsafe, readFile: async () => fileBody, close: async () => {} }) }), /signer unavailable/i);
  await assert.rejects(() => loadRestapNetworkFileSigner({ filePath: null, openImpl }), /signer unavailable/i);
  await assert.rejects(() => fixture({ signerPatch: { async sign() { return Buffer.alloc(64); } } }).service.issue(payload()), /signing unavailable/i);
});

test('private-key sentinel cannot enter service state, grants, errors, SQLite/WAL, logs, model, worker, or metrics', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'restap-grant-leak-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = join(directory, 'network.sqlite');
  const f = fixture();
  const grant = await f.service.issue(payload());
  const store = createRestapNetworkDatabase({ filename });
  store.transaction('public_key_only', (tx) => tx.run('INSERT INTO restap_network_key_registry (key_id, algorithm, public_key, activates_at, not_before, not_after, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [KEY_ID, 'Ed25519', PUBLIC_DER, NOW - 100, NOW - 100, NOW + 10_000, 'signing', NOW]));
  const sinks = { api: grant, logs: [], errors: [], modelInput: { grantHash: hashRestapNetworkGrant(grant) }, workerPayload: { grant }, metrics: [{ status: 'verified' }], service: f.service };
  const serialized = JSON.stringify(sinks);
  for (const marker of [SEED_HEX, PRIVATE_DER.toString('base64'), PRIVATE_DER.toString('hex')]) assert.equal(serialized.includes(marker), false);
  const dbBytes = await readFile(filename);
  const walBytes = await readFile(filename + '-wal').catch(() => Buffer.alloc(0));
  for (const bytes of [dbBytes, walBytes]) {
    assert.equal(bytes.includes(Buffer.from(SEED_HEX)), false);
    assert.equal(bytes.includes(PRIVATE_DER), false);
  }
  store.close();
});
