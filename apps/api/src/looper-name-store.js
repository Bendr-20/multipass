import { DatabaseSync } from 'node:sqlite';

const BASE_CHAIN_ID = 8453;

export function createSqliteLooperNameStore({ databasePath = ':memory:', now = () => new Date().toISOString() } = {}) {
  const db = new DatabaseSync(databasePath);
  db.exec(`CREATE TABLE IF NOT EXISTS looper_names (
    chain_id INTEGER NOT NULL,
    contract TEXT NOT NULL,
    token_id TEXT NOT NULL,
    name TEXT NOT NULL,
    updated_by_wallet TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (chain_id, contract, token_id)
  ) STRICT`);

  return {
    get(identity) {
      const key = normalizeKey(identity);
      const row = db.prepare(`SELECT name, updated_by_wallet, updated_at
        FROM looper_names
        WHERE chain_id = ? AND contract = ? AND token_id = ?`).get(key.chainId, key.contract, key.tokenId);
      return row ? {
        ...key,
        name: row.name,
        updatedByWallet: row.updated_by_wallet,
        updatedAt: row.updated_at,
      } : null;
    },

    set({ identity, name, wallet } = {}) {
      const key = authorizeWrite(identity, wallet);
      const normalizedName = normalizeName(name);
      const updatedAt = String(now());
      db.prepare(`INSERT INTO looper_names (
        chain_id, contract, token_id, name, updated_by_wallet, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(chain_id, contract, token_id) DO UPDATE SET
        name = excluded.name,
        updated_by_wallet = excluded.updated_by_wallet,
        updated_at = excluded.updated_at`).run(key.chainId, key.contract, key.tokenId, normalizedName, key.owner, updatedAt);
      return this.get(identity);
    },

    reset({ identity, wallet } = {}) {
      const key = authorizeWrite(identity, wallet);
      db.prepare(`DELETE FROM looper_names
        WHERE chain_id = ? AND contract = ? AND token_id = ?`).run(key.chainId, key.contract, key.tokenId);
      return null;
    },

    close() {
      db.close();
    },
  };
}

function authorizeWrite(identity, wallet) {
  const key = normalizeKey(identity);
  if (identity?.controllerVerified !== true) throw new TypeError('Verified Looper controller authorization is required.');
  const owner = normalizeWallet(identity?.owner, 'identity owner');
  const authenticatedWallet = normalizeWallet(wallet, 'authenticated wallet');
  if (owner !== authenticatedWallet) throw new TypeError('Authenticated wallet does not match the verified Looper owner.');
  return { ...key, owner };
}

function normalizeKey(identity = {}) {
  const chainId = Number(identity.chainId);
  if (chainId !== BASE_CHAIN_ID) throw new TypeError('Looper name identity must use Base chain 8453.');
  const contract = String(identity.contract ?? '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/u.test(contract)) throw new TypeError('Looper name contract is invalid.');
  const tokenId = String(identity.tokenId ?? '').trim();
  if (!/^\d+$/u.test(tokenId) || BigInt(tokenId) <= 0n) throw new TypeError('Looper token ID is invalid.');
  return { chainId, contract, tokenId };
}

function normalizeWallet(value, label) {
  const wallet = String(value ?? '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/u.test(wallet)) throw new TypeError(label + ' is invalid.');
  return wallet;
}

function normalizeName(value) {
  const name = String(value ?? '').trim().replace(/\s+/gu, ' ');
  if (!name) throw new TypeError('Looper name is required.');
  if (name.length > 80) throw new TypeError('Looper name must be 80 characters or fewer.');
  return name;
}
