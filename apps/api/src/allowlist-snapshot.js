import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { encodePacked, getAddress, isAddress, keccak256 } from 'viem';

const SNAPSHOT_SCHEMA_VERSION = '0.1.0';
const LEAF_ENCODING = 'keccak256(abi.encodePacked(address))';

export async function readAllowlistFile(filePath) {
  if (!filePath) throw new TypeError('readAllowlistFile requires filePath');
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export function createAllowlistSnapshot(input = {}, { generatedAt = new Date().toISOString() } = {}) {
  const entries = normalizeEntries(input.entries ?? []);
  const leaves = entries.map((entry) => hashAllowlistAddress(entry.address));
  const proofs = createMerkleProofs(leaves);
  return {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    generated_at: generatedAt,
    source_schema_version: input.schema_version ?? null,
    count: entries.length,
    merkle: {
      root: createMerkleRoot(leaves),
      leaf_encoding: LEAF_ENCODING,
      sorted_pairs: true,
    },
    entries: entries.map((entry, index) => ({
      position: index + 1,
      address: entry.address,
      registered_at: entry.registered_at ?? null,
      source: entry.source ?? 'direct',
      leaf: leaves[index],
      proof: proofs[index] ?? [],
    })),
  };
}

export async function writeAllowlistSnapshot(snapshot, outputPath) {
  if (!outputPath) throw new TypeError('writeAllowlistSnapshot requires outputPath');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
}

export function hashAllowlistAddress(address) {
  if (!isAddress(address)) throw new TypeError(`Invalid allowlist address: ${address}`);
  return keccak256(encodePacked(['address'], [getAddress(address)]));
}

export function verifyAllowlistProof(address, proof = [], root) {
  if (!root) return false;
  let computed = hashAllowlistAddress(address);
  for (const sibling of proof) {
    computed = hashPair(computed, sibling);
  }
  return computed.toLowerCase() === String(root).toLowerCase();
}

function normalizeEntries(entries) {
  const seen = new Set();
  const normalized = [];
  for (const entry of entries) {
    if (!entry?.address || !isAddress(entry.address)) continue;
    const address = getAddress(entry.address);
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      address,
      registered_at: typeof entry.registered_at === 'string' ? entry.registered_at : null,
      source: sanitizeSource(entry.source),
    });
  }
  return normalized;
}

function sanitizeSource(source) {
  const normalized = String(source ?? 'direct').trim().slice(0, 80);
  return normalized || 'direct';
}

function createMerkleRoot(leaves) {
  if (leaves.length === 0) return null;
  let level = [...leaves];
  while (level.length > 1) {
    level = nextLevel(level);
  }
  return level[0];
}

function createMerkleProofs(leaves) {
  const proofs = leaves.map(() => []);
  let level = leaves.map((leaf, index) => ({ hash: leaf, indexes: [index] }));
  while (level.length > 1) {
    const next = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1];
      if (!right) {
        next.push(left);
        continue;
      }
      for (const leafIndex of left.indexes) proofs[leafIndex].push(right.hash);
      for (const leafIndex of right.indexes) proofs[leafIndex].push(left.hash);
      next.push({
        hash: hashPair(left.hash, right.hash),
        indexes: [...left.indexes, ...right.indexes],
      });
    }
    level = next;
  }
  return proofs;
}

function nextLevel(level) {
  const next = [];
  for (let index = 0; index < level.length; index += 2) {
    const left = level[index];
    const right = level[index + 1];
    next.push(right ? hashPair(left, right) : left);
  }
  return next;
}

function hashPair(left, right) {
  const [first, second] = [left, right].sort(compareHex);
  return keccak256(`0x${first.slice(2)}${second.slice(2)}`);
}

function compareHex(a, b) {
  return a.toLowerCase().localeCompare(b.toLowerCase());
}
