import { createAllowlistSnapshot } from './allowlist-snapshot.js';
import { normalizeAllowlistAddress } from './allowlist-store.js';

export class AllowlistBatchError extends Error {
  constructor(issues = []) {
    super(formatBatchErrorMessage(issues));
    this.name = 'AllowlistBatchError';
    this.issues = issues;
  }
}

export function parseAllowlistBatchText(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return [];
  if (raw.startsWith('{') || raw.startsWith('[')) {
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed : parsed.entries;
    if (!Array.isArray(entries)) {
      throw new AllowlistBatchError([{ type: 'schema', message: 'Batch JSON must be an array or an object with entries array.' }]);
    }
    return entries.map((entry, index) => normalizeBatchEntry(entry, index + 1));
  }

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line, index) => {
      const [address, source] = line.split(',').map((part) => part.trim());
      return normalizeBatchEntry({ address, source: source || null }, index + 1);
    });
}

export function buildAllowlistBatchPlan({
  existingEntries = [],
  batchEntries = [],
  defaultSource = 'manual-import',
  generatedAt = new Date().toISOString(),
} = {}) {
  const issues = [];
  const normalizedExisting = [];
  const existingKeys = new Set();
  for (const [index, entry] of existingEntries.entries()) {
    try {
      const normalized = normalizeEntryForMerge(entry, {
        row: index + 1,
        sourceFallback: 'direct',
        generatedAt,
      });
      const key = normalized.address.toLowerCase();
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      normalizedExisting.push(normalized);
    } catch (error) {
      issues.push({ type: 'invalid_existing', row: index + 1, message: error.message });
    }
  }

  const normalizedBatch = [];
  const batchKeys = new Set();
  for (const [index, entry] of batchEntries.entries()) {
    try {
      const normalized = normalizeEntryForMerge(entry, {
        row: index + 1,
        sourceFallback: defaultSource,
        generatedAt,
      });
      const key = normalized.address.toLowerCase();
      if (batchKeys.has(key)) {
        issues.push({ type: 'duplicate_batch', row: index + 1, address: normalized.address, message: `Duplicate address in batch: ${normalized.address}` });
      } else {
        batchKeys.add(key);
        normalizedBatch.push(normalized);
      }
    } catch (error) {
      issues.push({ type: 'invalid_batch', row: index + 1, message: error.message });
    }
  }

  if (issues.length) throw new AllowlistBatchError(issues);

  const added = [];
  const skippedExisting = [];
  for (const entry of normalizedBatch) {
    const key = entry.address.toLowerCase();
    if (existingKeys.has(key)) {
      skippedExisting.push(entry);
      continue;
    }
    existingKeys.add(key);
    added.push(entry);
  }

  const mergedEntries = [...normalizedExisting, ...added];
  const snapshot = createAllowlistSnapshot({
    schema_version: '0.1.0',
    generated_at: generatedAt,
    entries: mergedEntries,
  }, { generatedAt });

  return {
    schema_version: '0.1.0',
    generated_at: generatedAt,
    old_count: normalizedExisting.length,
    batch_count: normalizedBatch.length,
    added_count: added.length,
    skipped_existing_count: skippedExisting.length,
    new_count: mergedEntries.length,
    added,
    skipped_existing: skippedExisting,
    mergedEntries,
    snapshot: {
      count: snapshot.count,
      merkle: snapshot.merkle,
    },
  };
}

export function createMergedAllowlistFile({ existing = {}, mergedEntries = [], generatedAt = new Date().toISOString() } = {}) {
  return {
    schema_version: existing.schema_version ?? '0.1.0',
    generated_at: generatedAt,
    entries: mergedEntries,
  };
}

function normalizeBatchEntry(entry, row) {
  try {
    return {
      address: normalizeAllowlistAddress(entry?.address),
      source: normalizeOptionalString(entry?.source),
      registered_at: normalizeOptionalString(entry?.registered_at),
    };
  } catch (error) {
    throw new AllowlistBatchError([{ type: 'invalid_batch', row, message: error.message }]);
  }
}

function normalizeEntryForMerge(entry, { sourceFallback, generatedAt }) {
  return {
    address: normalizeAllowlistAddress(entry?.address),
    registered_at: normalizeOptionalString(entry?.registered_at) ?? generatedAt,
    source: sanitizeSource(entry?.source ?? sourceFallback),
  };
}

function normalizeOptionalString(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function sanitizeSource(value) {
  return String(value ?? 'direct').trim().slice(0, 80) || 'direct';
}

function formatBatchErrorMessage(issues) {
  if (!issues.length) return 'Allowlist batch is invalid.';
  return `Allowlist batch is invalid: ${issues.map((issue) => issue.message).join('; ')}`;
}
