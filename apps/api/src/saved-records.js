import { DatabaseSync } from 'node:sqlite';

import {
  assertAgentCard,
  assertIdentityFragment,
  assertMultipassProfile,
  assertReceiptFragment,
  assertStandardsProfile,
  assertX402Manifest,
} from '@helixa/multipass-sdk';

const PUBLIC_SOURCE_SNAPSHOT_FIELDS = new Set([
  'apiUrl',
  'auraUrl',
  'canonicalId',
  'chain',
  'chainId',
  'collectionAddress',
  'contractAddress',
  'createdAt',
  'credScore',
  'credTier',
  'description',
  'displayName',
  'explorer',
  'framework',
  'handle',
  'helixaId',
  'id',
  'image',
  'imageUrl',
  'metadataUrl',
  'mintOrigin',
  'name',
  'openseaUrl',
  'operator',
  'owner',
  'ownerAddress',
  'profileUrl',
  'slug',
  'socials',
  'sourceType',
  'standards',
  'summary',
  'tags',
  'tier',
  'tokenId',
  'traits',
  'updatedAt',
  'verified',
  'verificationStatus',
  'website',
]);

export function createSqliteSavedRecords({ databasePath = ':memory:' } = {}) {
  const db = new DatabaseSync(databasePath);
  initialize(db);

  return {
    saveActivatedRecord(record) {
      const normalized = normalizeSavedRecord(record);
      const existing = readBundleBySource(db, normalized.source.sourceType, normalized.source.canonicalId);
      if (existing) return { ...existing, created: false };

      const now = new Date().toISOString();
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(`INSERT INTO saved_records (
          multipass_id, slug, source_type, source_canonical_id, source_token_id,
          profile_json, fragments_json, agent_card_json, standards_json, x402_json, receipts_json, source_context_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          normalized.profile.multipass_id,
          normalized.profile.slug,
          normalized.source.sourceType,
          normalized.source.canonicalId,
          normalized.source.tokenId,
          JSON.stringify(normalized.profile),
          JSON.stringify(normalized.fragments),
          JSON.stringify(normalized.agentCard),
          JSON.stringify(normalized.standardsProfile),
          JSON.stringify(normalized.x402Manifest),
          JSON.stringify(normalized.receipts),
          JSON.stringify(normalized.sourceContext),
          now,
          now,
        );

        db.prepare(`INSERT INTO change_log_entries (multipass_id, change_id, message, created_at)
          VALUES (?, ?, ?, ?)`).run(
          normalized.profile.multipass_id,
          normalized.change.change_id,
          normalized.change.message,
          normalized.change.created_at,
        );
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        if (isUniqueConstraintError(error)) {
          const existingAfterConflict = readBundleBySource(db, normalized.source.sourceType, normalized.source.canonicalId);
          if (existingAfterConflict) return { ...existingAfterConflict, created: false };
        }
        throw error;
      }

      return { ...readBundleById(db, normalized.profile.multipass_id), created: true };
    },

    resolveProfile(identifier) {
      return readProfile(db, identifier);
    },

    resolveBySource(sourceType, canonicalId) {
      return readBundleBySource(db, sourceType, canonicalId);
    },

    getPublicFragments(multipassId) {
      return readBundleById(db, multipassId)?.fragments.filter((fragment) => fragment.visibility === 'public') ?? [];
    },

    getAgentCard(multipassId) {
      return readBundleById(db, multipassId)?.agentCard ?? null;
    },

    getStandardsProfile(multipassId) {
      return readBundleById(db, multipassId)?.standardsProfile ?? null;
    },

    getX402Manifest(multipassId) {
      return readBundleById(db, multipassId)?.x402Manifest ?? null;
    },

    getReceiptFragment(multipassId, receiptId) {
      return readBundleById(db, multipassId)?.receipts.find((receipt) => receipt.receipt_id === receiptId) ?? null;
    },

    getChangeLog(multipassId) {
      const rows = db.prepare(`SELECT change_id, message, created_at FROM change_log_entries WHERE multipass_id = ? ORDER BY rowid ASC`).all(multipassId);
      return { schema_version: '0.1.0', multipass_id: multipassId, entries: rows };
    },

    getSourceContext(multipassId) {
      return readSourceContext(db, multipassId);
    },

    close() {
      db.close();
    },
  };
}

function initialize(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_records (
      multipass_id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      source_type TEXT NOT NULL,
      source_canonical_id TEXT NOT NULL,
      source_token_id TEXT,
      profile_json TEXT NOT NULL,
      fragments_json TEXT NOT NULL,
      agent_card_json TEXT NOT NULL,
      standards_json TEXT NOT NULL,
      x402_json TEXT NOT NULL,
      receipts_json TEXT NOT NULL,
      source_context_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(source_type, source_canonical_id)
    );
    CREATE TABLE IF NOT EXISTS change_log_entries (
      multipass_id TEXT NOT NULL,
      change_id TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function normalizeSavedRecord(record) {
  const sourceType = String(record?.source?.sourceType ?? '').trim();
  if (!sourceType) {
    throw new TypeError('saveActivatedRecord requires source.sourceType');
  }

  const canonicalId = String(record?.source?.canonicalId ?? '').trim();
  if (!canonicalId) {
    throw new TypeError('saveActivatedRecord requires source.canonicalId');
  }

  if (!isPlainObject(record?.sourceContext?.activation)) {
    throw new TypeError('saveActivatedRecord requires sourceContext.activation');
  }

  if (!isPlainObject(record?.sourceContext?.sourceSnapshot)) {
    throw new TypeError('saveActivatedRecord requires sourceContext.sourceSnapshot');
  }

  const change = normalizeChange(record?.change);
  const tokenId = record?.source?.tokenId ? String(record.source.tokenId) : null;
  const profile = assertMultipassProfile(record.profile);
  const fragments = (record.fragments ?? []).map(assertIdentityFragment);
  const agentCard = assertAgentCard(record.agentCard);
  const standardsProfile = assertStandardsProfile(record.standardsProfile);
  const x402Manifest = assertX402Manifest(record.x402Manifest);
  const receipts = (record.receipts ?? []).map(assertReceiptFragment);

  assertBundleMultipassIds({ profile, fragments, agentCard, standardsProfile, x402Manifest, receipts });

  return {
    source: {
      sourceType,
      canonicalId,
      tokenId,
    },
    sourceContext: {
      activation: sanitizeActivationContext(record.sourceContext.activation, { sourceType, canonicalId, tokenId }),
      sourceSnapshot: sanitizeSourceSnapshot(record.sourceContext.sourceSnapshot),
    },
    profile,
    fragments,
    agentCard,
    standardsProfile,
    x402Manifest,
    receipts,
    change,
  };
}

function assertBundleMultipassIds({ profile, fragments, agentCard, standardsProfile, x402Manifest, receipts }) {
  const multipassId = profile.multipass_id;
  assertDocumentMultipassId(agentCard, multipassId, 'agentCard');
  assertDocumentMultipassId(standardsProfile, multipassId, 'standardsProfile');
  assertDocumentMultipassId(x402Manifest, multipassId, 'x402Manifest');
  fragments.forEach((fragment, index) => assertDocumentMultipassId(fragment, multipassId, `fragments[${index}]`));
  receipts.forEach((receipt, index) => assertDocumentMultipassId(receipt, multipassId, `receipts[${index}]`));
}

function assertDocumentMultipassId(document, expectedMultipassId, label) {
  if (document.multipass_id !== expectedMultipassId) {
    throw new TypeError(`${label}.multipass_id must match profile.multipass_id`);
  }
}

function normalizeChange(change) {
  if (!isPlainObject(change)) {
    throw new TypeError('saveActivatedRecord requires change metadata');
  }

  const changeId = String(change.change_id ?? '').trim();
  if (!changeId) {
    throw new TypeError('saveActivatedRecord requires change.change_id');
  }

  const message = String(change.message ?? '').trim();
  if (!message) {
    throw new TypeError('saveActivatedRecord requires change.message');
  }

  const createdAt = String(change.created_at ?? '').trim();
  if (!createdAt) {
    throw new TypeError('saveActivatedRecord requires change.created_at');
  }

  return { change_id: changeId, message, created_at: createdAt };
}

function sanitizeActivationContext(activation, source) {
  return pruneUndefined({
    state: copyStringOrNull(activation.state),
    origin: copyStringOrNull(activation.origin),
    originSource: copyStringOrNull(activation.originSource),
    sourceType: source.sourceType,
    canonicalId: source.canonicalId,
    tokenId: source.tokenId ?? copyStringOrNull(activation.tokenId),
    savedAt: copyStringOrNull(activation.savedAt),
  });
}

function sanitizeSourceSnapshot(snapshot) {
  const sanitized = {};
  for (const [field, value] of Object.entries(snapshot)) {
    if (!PUBLIC_SOURCE_SNAPSHOT_FIELDS.has(field) || isSensitiveSourceField(field)) {
      continue;
    }

    const sanitizedValue = sanitizeJsonValue(value);
    if (sanitizedValue !== undefined) {
      sanitized[field] = sanitizedValue;
    }
  }
  return sanitized;
}

function sanitizeJsonValue(value) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeJsonValue).filter((item) => item !== undefined);
  }

  if (isPlainObject(value)) {
    const sanitized = {};
    for (const [field, nestedValue] of Object.entries(value)) {
      if (isSensitiveSourceField(field)) {
        continue;
      }
      const sanitizedValue = sanitizeJsonValue(nestedValue);
      if (sanitizedValue !== undefined) {
        sanitized[field] = sanitizedValue;
      }
    }
    return sanitized;
  }

  return undefined;
}

function isSensitiveSourceField(field) {
  const normalized = String(field).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized === 'tokenid') {
    return false;
  }

  return normalized.includes('privatekey')
    || normalized.includes('secret')
    || normalized.includes('token')
    || normalized.includes('password')
    || normalized.includes('credential')
    || normalized.includes('auth')
    || normalized.includes('bearer');
}


function isUniqueConstraintError(error) {
  return String(error?.message ?? '').includes('UNIQUE constraint failed');
}

function readProfile(db, identifier) {
  const row = db.prepare(`SELECT profile_json FROM saved_records WHERE multipass_id = ? OR slug = ?`).get(identifier, identifier);
  return row ? JSON.parse(row.profile_json) : null;
}

function readBundleBySource(db, sourceType, canonicalId) {
  const row = db.prepare(`SELECT multipass_id FROM saved_records WHERE source_type = ? AND source_canonical_id = ?`).get(sourceType, canonicalId);
  return row ? readBundleById(db, row.multipass_id) : null;
}

function readBundleById(db, multipassId) {
  const row = db.prepare(`SELECT * FROM saved_records WHERE multipass_id = ?`).get(multipassId);
  if (!row) return null;
  return {
    profile: JSON.parse(row.profile_json),
    fragments: JSON.parse(row.fragments_json),
    agentCard: JSON.parse(row.agent_card_json),
    standardsProfile: JSON.parse(row.standards_json),
    x402Manifest: JSON.parse(row.x402_json),
    receipts: JSON.parse(row.receipts_json),
    sourceContext: JSON.parse(row.source_context_json),
  };
}

function readSourceContext(db, multipassId) {
  const row = db.prepare(`SELECT source_context_json FROM saved_records WHERE multipass_id = ?`).get(multipassId);
  return row ? JSON.parse(row.source_context_json) : null;
}

function copyStringOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
}

function pruneUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
