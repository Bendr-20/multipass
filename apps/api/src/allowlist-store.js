import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { getAddress, isAddress } from 'viem';

const SCHEMA_VERSION = '0.1.0';

export class AllowlistInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AllowlistInputError';
    this.code = code;
  }
}

export function normalizeAllowlistAddress(address) {
  const raw = String(address ?? '').trim();
  if (!isAddress(raw)) {
    throw new AllowlistInputError('invalid_address', 'Provide a valid Ethereum address.');
  }
  return getAddress(raw);
}

export function createMemoryAllowlistStore({ now = () => new Date() } = {}) {
  const entries = new Map();

  return {
    register(input = {}) {
      const address = normalizeAllowlistAddress(input.address);
      const key = address.toLowerCase();
      const existing = entries.get(key);
      if (existing) return { entry: { ...existing }, created: false };

      const entry = createAllowlistEntry(address, input, now);
      entries.set(key, entry);
      return { entry: { ...entry }, created: true };
    },

    status(address) {
      const normalized = normalizeAllowlistAddress(address);
      const entry = entries.get(normalized.toLowerCase());
      return {
        registered: Boolean(entry),
        address: normalized,
        entry: entry ? { ...entry } : null,
      };
    },

    list() {
      return [...entries.values()].map((entry) => ({ ...entry }));
    },

    count() {
      return entries.size;
    },
  };
}

export async function createJsonAllowlistStore({ filePath, now = () => new Date() } = {}) {
  if (!filePath) throw new TypeError('createJsonAllowlistStore requires filePath');
  const memory = createMemoryAllowlistStore({ now });
  await hydrateFromFile(memory, filePath);

  async function persist() {
    await mkdir(dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify({
      schema_version: SCHEMA_VERSION,
      generated_at: now().toISOString(),
      entries: memory.list(),
    }, null, 2)}\n`);
    await rename(temporaryPath, filePath);
  }

  return {
    async register(input) {
      const result = memory.register(input);
      if (result.created) await persist();
      return result;
    },

    async status(address) {
      return memory.status(address);
    },

    async list() {
      return memory.list();
    },

    async count() {
      return memory.count();
    },
  };
}

function createAllowlistEntry(address, input, now) {
  const source = String(input.source ?? '').trim();
  return {
    address,
    registered_at: input.registered_at || now().toISOString(),
    source: source ? source.slice(0, 80) : 'direct',
  };
}

async function hydrateFromFile(store, filePath) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  for (const entry of parsed.entries ?? []) {
    store.register({
      address: entry.address,
      source: entry.source,
      registered_at: entry.registered_at,
    });
  }
}
