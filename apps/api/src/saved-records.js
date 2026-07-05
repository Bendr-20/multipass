import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import {
  assertAgentCard,
  assertIdentityFragment,
  assertMultipassProfile,
  assertReceiptFragment,
  assertStandardsProfile,
  assertX402Manifest,
} from '@helixa/multipass-sdk';

import {
  assertManagerEditableFragment,
  normalizeManagerFragmentInput,
  normalizeManagerFragmentPatch,
  summarizePublicFragments,
} from './fragment-manager.js';
import { refreshToolFragment } from './tool-refresh.js';
import {
  deriveAgentCardServiceUpdates,
  deriveX402ManifestFromTools,
  normalizeBankrServiceTool,
  summarizeToolsResponse,
} from './tool-manifest.js';
import { createHelixaX401CompatibilityManifest, deriveX401ManifestFromFragments } from './x401-manifest.js';

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
  'fingerprint',
  'handle',
  'helixaId',
  'id',
  'image',
  'imageUrl',
  'memberSummaries',
  'metadataUrl',
  'mintOrigin',
  'name',
  'openseaUrl',
  'operator',
  'owner',
  'ownerAddress',
  'profileUrl',
  'sharedPolicyNote',
  'slug',
  'socials',
  'sourceType',
  'standards',
  'subjectType',
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

const DEFAULT_CLAIM_NONCE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MANAGER_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const EDITABLE_PROFILE_FIELDS = new Set(['display_name', 'summary', 'avatar_url', 'tags', 'visibility']);
const EDITABLE_PROFILE_VISIBILITY = new Set(['public', 'gated', 'private', 'hidden']);
const PUBLIC_PROFILE_FIELD_LABELS = new Map([
  ['display_name', 'display name'],
  ['summary', 'summary'],
  ['avatar_url', 'profile image'],
  ['tags', 'tags'],
  ['visibility', 'visibility'],
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

    getTools(multipassId) {
      return summarizeToolsResponse(multipassId, readBundleById(db, multipassId)?.fragments ?? []);
    },

    getAgentCard(multipassId, options = {}) {
      const bundle = readBundleById(db, multipassId);
      if (!bundle) return null;
      return deriveAgentCardServiceUpdates(bundle.agentCard, bundle.fragments, options.baseUrl ?? '');
    },

    getStandardsProfile(multipassId) {
      return readBundleById(db, multipassId)?.standardsProfile ?? null;
    },

    getX402Manifest(multipassId) {
      const bundle = readBundleById(db, multipassId);
      if (!bundle) return null;
      const derived = deriveX402ManifestFromTools(multipassId, bundle.fragments);
      if (derived.endpoints.length > 0) return derived;
      return bundle.x402Manifest;
    },

    getX401Manifest(multipassId) {
      const bundle = readBundleById(db, multipassId);
      if (!bundle) return null;
      const derived = deriveX401ManifestFromFragments(multipassId, bundle.fragments);
      if (derived.x401_supported) return derived;
      if (isHelixaAgentSavedRecord(bundle)) {
        return createHelixaX401CompatibilityManifest(multipassId, { displayName: bundle.profile.display_name });
      }
      return derived;
    },

    getReceiptFragments(multipassId) {
      return readBundleById(db, multipassId)?.receipts ?? [];
    },

    getReceiptFragment(multipassId, receiptId) {
      return readBundleById(db, multipassId)?.receipts.find((receipt) => receipt.receipt_id === receiptId) ?? null;
    },

    searchProfiles(query, options = {}) {
      const rows = db.prepare(`SELECT profile_json FROM saved_records ORDER BY created_at DESC, rowid DESC LIMIT 250`).all();
      return searchProfileList(rows.map((row) => JSON.parse(row.profile_json)), query, options);
    },

    getChangeLog(multipassId) {
      const rows = db.prepare(`SELECT change_id, message, created_at FROM change_log_entries WHERE multipass_id = ? ORDER BY rowid ASC`).all(multipassId);
      return { schema_version: '0.1.0', multipass_id: multipassId, entries: rows };
    },

    getSourceContext(multipassId) {
      return readSourceContext(db, multipassId);
    },

    createClaimNonce(identifier, options = {}) {
      const profile = requireSavedProfile(db, identifier);
      const sourceContext = readSourceContext(db, profile.multipass_id);
      const issuedAt = dateFrom(options.now);
      const expiresAt = new Date(issuedAt.getTime() + (options.ttlMs ?? DEFAULT_CLAIM_NONCE_TTL_MS));
      const nonce = randomHex(16);
      const sourceCanonicalId = sourceContext?.activation?.canonicalId ?? 'unknown';
      const domain = normalizeDomain(options.domain ?? 'helixa.xyz');
      const message = createClaimMessage({
        multipassId: profile.multipass_id,
        sourceCanonicalId,
        domain,
        nonce,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      });

      db.prepare(`INSERT INTO claim_nonces (
        nonce_hash, multipass_id, source_canonical_id, domain, purpose, message, issued_at, expires_at, used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`).run(
        hashSecret(nonce),
        profile.multipass_id,
        sourceCanonicalId,
        domain,
        options.purpose ?? 'claim_management',
        message,
        issuedAt.toISOString(),
        expiresAt.toISOString(),
      );

      return {
        schema_version: '0.1.0',
        multipass_id: profile.multipass_id,
        source_canonical_id: sourceCanonicalId,
        nonce,
        message,
        issued_at: issuedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      };
    },

    consumeClaimNonce(nonce, options = {}) {
      const now = dateFrom(options.now).toISOString();
      const row = db.prepare(`SELECT * FROM claim_nonces WHERE nonce_hash = ?`).get(hashSecret(nonce));
      if (!row) throw new Error('Claim nonce not found.');
      if (options.multipassId && row.multipass_id !== options.multipassId) {
        throw new Error('Claim nonce is scoped to another Multipass.');
      }
      if (row.used_at) throw new Error('Claim nonce was already used.');
      if (Date.parse(row.expires_at) <= Date.parse(now)) throw new Error('Claim nonce expired.');

      db.prepare(`UPDATE claim_nonces SET used_at = ? WHERE nonce_hash = ?`).run(now, row.nonce_hash);
      return row;
    },

    createManualReviewRequest(identifier, input = {}) {
      const profile = requireSavedProfile(db, identifier);
      const now = dateFrom(input.now).toISOString();
      const wallet = normalizeWallet(input.proposedManagerWallet, 'proposedManagerWallet');
      const contactRoute = normalizeBoundedString(input.contactRoute, 'contactRoute', 240);
      const note = normalizeBoundedString(input.note, 'note', 1000);
      const claimId = `claim_${randomHex(12)}`;

      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(`INSERT INTO claim_requests (
          claim_id, multipass_id, proof_type, proposed_manager_wallet, contact_route, note, status, created_at, updated_at, approved_at, approved_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`).run(
          claimId,
          profile.multipass_id,
          'manual_review',
          wallet,
          contactRoute,
          note,
          'pending_review',
          now,
          now,
        );
        updateProfileOwnerSummary(db, profile.multipass_id, {
          owner_state: 'claimed',
          verification_status: 'pending',
          verified_at: null,
          summary: 'Management claim pending manual review. This does not transfer custody, tools, credentials, or ownership.',
        }, now);
        appendChangeLog(db, profile.multipass_id, 'Management claim requested for manual review.', now);
        appendAuditEvent(db, profile.multipass_id, 'manual_review_requested', { claimId, proposedManagerWallet: wallet }, now);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      return readClaimRequest(db, claimId);
    },

    approveManualReviewClaim(identifier, claimId, input = {}) {
      const profile = requireSavedProfile(db, identifier);
      const now = dateFrom(input.now).toISOString();
      const admin = normalizeBoundedString(input.admin ?? 'admin', 'admin', 120);
      const row = db.prepare(`SELECT * FROM claim_requests WHERE multipass_id = ? AND claim_id = ?`).get(profile.multipass_id, claimId);
      if (!row) throw new Error('Claim request not found.');
      if (row.proof_type !== 'manual_review') throw new Error('Only manual review claims can be approved here.');
      if (row.status !== 'pending_review') throw new Error('Claim request is not pending review.');

      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(`UPDATE claim_requests SET status = ?, approved_at = ?, approved_by = ?, updated_at = ? WHERE claim_id = ?`).run(
          'approved',
          now,
          admin,
          now,
          claimId,
        );
        const currentProfile = readProfile(db, profile.multipass_id);
        if (currentProfile?.owner_summary?.owner_state !== 'verified') {
          updateProfileOwnerSummary(db, profile.multipass_id, {
            owner_state: 'claimed',
            verification_status: 'verified',
            verified_at: now,
            summary: 'Management claim review-approved for public profile edits. Source-owner wallet proof was not completed; this does not transfer custody, tools, credentials, or ownership.',
          }, now);
        }
        appendChangeLog(db, profile.multipass_id, 'Management claim approved after manual review.', now);
        appendAuditEvent(db, profile.multipass_id, 'manual_review_approved', { claimId, admin }, now);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      return readClaimRequest(db, claimId);
    },

    markOwnerWalletVerified(identifier, input = {}) {
      const profile = requireSavedProfile(db, identifier);
      const now = dateFrom(input.now).toISOString();
      const wallet = normalizeWallet(input.managerWallet, 'managerWallet');
      updateProfileOwnerSummary(db, profile.multipass_id, {
        owner_state: 'verified',
        verification_status: 'verified',
        verified_at: now,
        summary: 'Management claim owner-wallet verified for public profile edits. This does not transfer custody, tools, credentials, or ownership.',
      }, now);
      appendChangeLog(db, profile.multipass_id, 'Management claim owner-wallet verified.', now);
      appendAuditEvent(db, profile.multipass_id, 'owner_wallet_verified', { managerWallet: wallet }, now);
      return readProfile(db, profile.multipass_id);
    },

    getClaimState(multipassId) {
      const profile = readProfile(db, multipassId);
      if (profile?.owner_summary?.owner_state === 'verified') {
        return { schema_version: '0.1.0', multipass_id: multipassId, status: 'claimed_verified_owner' };
      }

      const approved = db.prepare(`SELECT * FROM claim_requests WHERE multipass_id = ? AND status = ? ORDER BY rowid DESC LIMIT 1`).get(multipassId, 'approved');
      if (approved) {
        return {
          schema_version: '0.1.0',
          multipass_id: multipassId,
          status: 'claimed_review_approved',
          manager_wallet: approved.proposed_manager_wallet,
          claim_id: approved.claim_id,
        };
      }

      const pending = db.prepare(`SELECT * FROM claim_requests WHERE multipass_id = ? AND status = ? ORDER BY rowid DESC LIMIT 1`).get(multipassId, 'pending_review');
      if (pending) {
        return {
          schema_version: '0.1.0',
          multipass_id: multipassId,
          status: 'claim_pending',
          proposed_manager_wallet: pending.proposed_manager_wallet,
          claim_id: pending.claim_id,
        };
      }

      return { schema_version: '0.1.0', multipass_id: multipassId, status: 'saved_unclaimed' };
    },

    findApprovedManagerClaim(multipassId, wallet) {
      return db.prepare(`SELECT * FROM claim_requests
        WHERE multipass_id = ? AND proposed_manager_wallet = ? AND proof_type = ? AND status = ?
        ORDER BY rowid DESC LIMIT 1`).get(multipassId, normalizeWallet(wallet, 'wallet'), 'manual_review', 'approved') ?? null;
    },

    createManagerSession(identifier, input = {}) {
      const profile = requireSavedProfile(db, identifier);
      const nowDate = dateFrom(input.now);
      const expiresAt = new Date(nowDate.getTime() + (input.ttlMs ?? DEFAULT_MANAGER_SESSION_TTL_MS));
      const sessionId = randomHex(32);
      const csrfToken = randomHex(32);
      const wallet = normalizeWallet(input.managerWallet, 'managerWallet');
      const claimStatus = normalizeClaimStatus(input.claimStatus);

      db.prepare(`INSERT INTO manager_sessions (
        session_hash, multipass_id, manager_wallet, claim_status, csrf_hash, issued_at, expires_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`).run(
        hashSecret(sessionId),
        profile.multipass_id,
        wallet,
        claimStatus,
        hashSecret(csrfToken),
        nowDate.toISOString(),
        expiresAt.toISOString(),
      );

      appendAuditEvent(db, profile.multipass_id, 'manager_session_created', { managerWallet: wallet, claimStatus }, nowDate.toISOString());
      return { sessionId, csrfToken, expires_at: expiresAt.toISOString(), multipass_id: profile.multipass_id };
    },

    validateManagerSession(input = {}) {
      const row = db.prepare(`SELECT * FROM manager_sessions WHERE session_hash = ?`).get(hashSecret(input.sessionId ?? ''));
      if (!row) throw new Error('Manager session not found.');
      if (row.revoked_at) throw new Error('Manager session revoked.');
      if (input.multipassId && row.multipass_id !== input.multipassId) {
        throw new Error('Manager session is scoped to another Multipass.');
      }
      if (Date.parse(row.expires_at) <= dateFrom(input.now).getTime()) {
        throw new Error('Manager session expired.');
      }
      if (!constantTimeEqual(row.csrf_hash, hashSecret(input.csrfToken ?? ''))) {
        throw new Error('Manager session CSRF token is invalid.');
      }
      return row;
    },

    revokeManagerSession(sessionId, input = {}) {
      const now = dateFrom(input.now).toISOString();
      db.prepare(`UPDATE manager_sessions SET revoked_at = ? WHERE session_hash = ? AND revoked_at IS NULL`).run(now, hashSecret(sessionId ?? ''));
    },

    getFragment(identifier, fragmentId) {
      const profile = requireSavedProfile(db, identifier);
      return readBundleById(db, profile.multipass_id)?.fragments.find((fragment) => fragment.fragment_id === fragmentId) ?? null;
    },

    getAuditEvents(multipassId) {
      return db.prepare(`SELECT audit_id, multipass_id, event_type, event_json, created_at FROM audit_events WHERE multipass_id = ? ORDER BY rowid ASC`).all(multipassId)
        .map((row) => ({ ...row, event: JSON.parse(row.event_json) }));
    },

    createPublicFragment(identifier, input = {}, context = {}) {
      const profile = requireSavedProfile(db, identifier);
      const now = dateFrom(context.now).toISOString();
      const actorWallet = normalizeWallet(context.actorWallet, 'actorWallet');
      const bundle = readBundleById(db, profile.multipass_id);
      if (!bundle) throw new Error('Saved record bundle not found.');
      const fragment = prepareEndpointRouteFragment(
        normalizeManagerFragmentInput(input, { multipassId: profile.multipass_id, now, randomHex }),
      );
      assertUniqueEndpointId(bundle.fragments, fragment);
      const fragments = [fragment, ...bundle.fragments];
      writeFragmentMutation(db, bundle, fragments, {
        now,
        message: fragmentChangeMessage('added', fragment),
        auditType: 'public_fragment_created',
        auditPayload: { actorWallet, fragmentId: fragment.fragment_id, fragmentType: fragment.fragment_type },
      });
      return readFragmentMutationResult(db, profile.multipass_id, fragment.fragment_id);
    },

    updatePublicFragment(identifier, fragmentId, patch = {}, context = {}) {
      const profile = requireSavedProfile(db, identifier);
      const now = dateFrom(context.now).toISOString();
      const actorWallet = normalizeWallet(context.actorWallet, 'actorWallet');
      const bundle = readBundleById(db, profile.multipass_id);
      if (!bundle) throw new Error('Saved record bundle not found.');
      const index = bundle.fragments.findIndex((fragment) => fragment.fragment_id === fragmentId);
      if (index === -1) throw new Error('Fragment not found.');
      assertManagerEditableFragment(bundle.fragments[index]);
      const nextFragment = prepareEndpointRouteFragment(normalizeManagerFragmentPatch(bundle.fragments[index], patch, { now }));
      assertUniqueEndpointId(bundle.fragments, nextFragment, fragmentId);
      const fragments = bundle.fragments.with(index, nextFragment);
      writeFragmentMutation(db, bundle, fragments, {
        now,
        message: fragmentChangeMessage('updated', nextFragment),
        auditType: 'public_fragment_updated',
        auditPayload: { actorWallet, fragmentId, fragmentType: nextFragment.fragment_type },
      });
      return readFragmentMutationResult(db, profile.multipass_id, fragmentId);
    },

    revokePublicFragment(identifier, fragmentId, context = {}) {
      const profile = requireSavedProfile(db, identifier);
      const now = dateFrom(context.now).toISOString();
      const actorWallet = normalizeWallet(context.actorWallet, 'actorWallet');
      const bundle = readBundleById(db, profile.multipass_id);
      if (!bundle) throw new Error('Saved record bundle not found.');
      const index = bundle.fragments.findIndex((fragment) => fragment.fragment_id === fragmentId);
      if (index === -1) throw new Error('Fragment not found.');
      assertManagerEditableFragment(bundle.fragments[index]);
      const nextFragment = prepareEndpointRouteFragment(assertIdentityFragment({ ...bundle.fragments[index], status: 'revoked', revoked_at: now, updated_at: now }));
      const fragments = bundle.fragments.with(index, nextFragment);
      writeFragmentMutation(db, bundle, fragments, {
        now,
        message: fragmentChangeMessage('revoked', nextFragment),
        auditType: 'public_fragment_revoked',
        auditPayload: { actorWallet, fragmentId, fragmentType: nextFragment.fragment_type },
      });
      return readFragmentMutationResult(db, profile.multipass_id, fragmentId);
    },

    importBankrTool(identifier, input = {}, context = {}) {
      const profile = requireSavedProfile(db, identifier);
      const now = dateFrom(context.now).toISOString();
      const actorWallet = normalizeWallet(context.actorWallet, 'actorWallet');
      if (String(input.source ?? '').trim() !== 'bankr_x402_cloud') {
        throw new TypeError('source must be bankr_x402_cloud for tool imports.');
      }
      const bundle = readBundleById(db, profile.multipass_id);
      if (!bundle) throw new Error('Saved record bundle not found.');
      const fragment = normalizeBankrServiceTool({
        multipassId: profile.multipass_id,
        serviceName: input.serviceName,
        service: input.service,
        network: input.network,
        currency: input.currency,
        endpointUrl: input.endpointUrl,
        now,
      });
      assertUniqueActiveToolId(bundle.fragments, fragment);
      const fragments = [...bundle.fragments, fragment];
      writeFragmentMutation(db, bundle, fragments, {
        now,
        message: `Tool service imported: ${fragment.tool_manifest_ref.name}.`,
        auditType: 'tool_imported',
        auditPayload: {
          actorWallet,
          fragmentId: fragment.fragment_id,
          toolId: fragment.tool_manifest_ref.tool_id,
          registry: fragment.tool_manifest_ref.registry,
        },
      });
      return readToolImportResult(db, profile.multipass_id, fragment.fragment_id);
    },

    async refreshTool(identifier, fragmentId, context = {}) {
      const profile = requireSavedProfile(db, identifier);
      const now = dateFrom(context.now).toISOString();
      const actorWallet = normalizeWallet(context.actorWallet, 'actorWallet');
      const bundle = readBundleById(db, profile.multipass_id);
      if (!bundle) throw new Error('Saved record bundle not found.');
      const index = bundle.fragments.findIndex((fragment) => fragment.fragment_id === fragmentId);
      if (index === -1 || bundle.fragments[index]?.fragment_type !== 'tool_manifest') {
        throw new Error('Tool fragment not found.');
      }
      const current = bundle.fragments[index];
      if (['revoked', 'historical'].includes(current.status)) {
        throw new Error('Tool fragment is not refreshable.');
      }
      const { fragment, refresh } = await refreshToolFragment(current, {
        fetchImpl: context.fetchImpl,
        now,
        timeoutMs: context.timeoutMs,
      });
      const fragments = bundle.fragments.with(index, fragment);
      writeFragmentMutation(db, bundle, fragments, {
        now,
        message: `Tool service refreshed: ${fragment.tool_manifest_ref.name}.`,
        auditType: 'tool_refreshed',
        auditPayload: {
          actorWallet,
          fragmentId: fragment.fragment_id,
          toolId: fragment.tool_manifest_ref.tool_id,
          registry: fragment.tool_manifest_ref.registry,
          status: fragment.status,
        },
      });
      return {
        ...readToolImportResult(db, profile.multipass_id, fragment.fragment_id),
        refresh,
      };
    },

    updatePublicProfile(identifier, edits = {}, input = {}) {
      const profile = requireSavedProfile(db, identifier);
      const agentCard = readBundleById(db, profile.multipass_id)?.agentCard;
      if (!agentCard) throw new Error('Agent card not found.');
      const now = dateFrom(input.now).toISOString();
      const actorWallet = normalizeWallet(input.actorWallet, 'actorWallet');
      const normalized = normalizePublicProfileEdits(edits);
      const changedFields = [];
      const nextProfile = structuredClone(profile);
      const nextAgentCard = structuredClone(agentCard);

      if ('display_name' in normalized && normalized.display_name !== profile.display_name) {
        nextProfile.display_name = normalized.display_name;
        nextAgentCard.name = normalized.display_name;
        changedFields.push('display_name');
      }
      if ('summary' in normalized && normalized.summary !== profile.discovery_profile.summary) {
        nextProfile.discovery_profile.summary = normalized.summary;
        changedFields.push('summary');
      }
      if ('avatar_url' in normalized && normalized.avatar_url !== (profile.discovery_profile.avatar_url ?? null)) {
        nextProfile.discovery_profile.avatar_url = normalized.avatar_url;
        changedFields.push('avatar_url');
      }
      if ('tags' in normalized && JSON.stringify(normalized.tags) !== JSON.stringify(profile.discovery_profile.tags)) {
        nextProfile.discovery_profile.tags = normalized.tags;
        changedFields.push('tags');
      }
      if ('visibility' in normalized && normalized.visibility !== profile.owner_summary.visibility) {
        nextProfile.owner_summary = {
          ...nextProfile.owner_summary,
          visibility: normalized.visibility,
        };
        changedFields.push('visibility');
      }

      if (changedFields.length === 0) {
        return { profile, changedFields: [] };
      }

      nextProfile.updated_at = now;
      assertMultipassProfile(nextProfile);
      assertAgentCard(nextAgentCard);

      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(`UPDATE saved_records SET profile_json = ?, agent_card_json = ?, updated_at = ? WHERE multipass_id = ?`).run(
          JSON.stringify(nextProfile),
          JSON.stringify(nextAgentCard),
          now,
          profile.multipass_id,
        );
        appendChangeLog(db, profile.multipass_id, `Public profile updated: ${formatPublicProfileFieldList(changedFields)}.`, now);
        appendAuditEvent(db, profile.multipass_id, 'public_profile_updated', { actorWallet, changedFields }, now);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      return { profile: readProfile(db, profile.multipass_id), changedFields };
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
    CREATE TABLE IF NOT EXISTS claim_nonces (
      nonce_hash TEXT PRIMARY KEY,
      multipass_id TEXT NOT NULL,
      source_canonical_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      purpose TEXT NOT NULL,
      message TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS claim_requests (
      claim_id TEXT PRIMARY KEY,
      multipass_id TEXT NOT NULL,
      proof_type TEXT NOT NULL,
      proposed_manager_wallet TEXT NOT NULL,
      contact_route TEXT NOT NULL,
      note TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      approved_at TEXT,
      approved_by TEXT
    );
    CREATE TABLE IF NOT EXISTS manager_sessions (
      session_hash TEXT PRIMARY KEY,
      multipass_id TEXT NOT NULL,
      manager_wallet TEXT NOT NULL,
      claim_status TEXT NOT NULL,
      csrf_hash TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      audit_id TEXT PRIMARY KEY,
      multipass_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_json TEXT NOT NULL,
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

function isHelixaAgentSavedRecord(bundle) {
  const activationSource = String(bundle?.sourceContext?.activation?.sourceType ?? '').trim();
  const snapshotSource = String(bundle?.sourceContext?.sourceSnapshot?.sourceType ?? '').trim();
  return activationSource === 'helixa_agent' || snapshotSource === 'helixa_agent';
}

function assertBundleMultipassIds({ profile, fragments, agentCard, standardsProfile, x402Manifest, receipts }) {
  const multipassId = profile.multipass_id;
  assertDocumentMultipassId(agentCard, multipassId, 'agentCard');
  assertDocumentMultipassId(standardsProfile, multipassId, 'standardsProfile');
  assertDocumentMultipassId(x402Manifest, multipassId, 'x402Manifest');
  fragments.forEach((fragment, index) => assertDocumentMultipassId(fragment, multipassId, `fragments[${index}]`));
  receipts.forEach((receipt, index) => assertDocumentMultipassId(receipt, multipassId, `receipts[${index}]`));
}

function searchProfileList(profiles, query, options = {}) {
  const needle = String(query ?? '').toLowerCase();
  const limit = options.limit ?? 10;
  return profiles
    .filter((profile) => {
      if ((profile.owner_summary?.visibility ?? 'public') !== 'public') return false;
      const fields = [profile.slug, profile.multipass_id, profile.display_name, ...(profile.discovery_profile?.tags ?? [])]
        .map((field) => String(field ?? '').toLowerCase());
      return fields.some((field) => field === needle || field.startsWith(needle));
    })
    .slice(0, limit);
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



function requireSavedProfile(db, identifier) {
  const profile = readProfile(db, identifier);
  if (!profile) throw new Error(`Multipass not found: ${identifier}`);
  return profile;
}

function createClaimMessage({ multipassId, sourceCanonicalId, domain, nonce, issuedAt, expiresAt }) {
  return [
    'Helixa Multipass claim management',
    '',
    `Multipass ID: ${multipassId}`,
    `Source canonical ID: ${sourceCanonicalId}`,
    `Domain: ${domain}`,
    `Nonce: ${nonce}`,
    `Issued at: ${issuedAt}`,
    `Expires at: ${expiresAt}`,
    '',
    'Signing this message verifies control for public Multipass metadata management only.',
    'It does not transfer funds, assets, tools, credentials, or ownership.',
  ].join('\n');
}

function writeFragmentMutation(db, bundle, fragments, { now, message, auditType, auditPayload }) {
  const nextFragments = fragments.map(assertIdentityFragment);
  const nextProfile = {
    ...bundle.profile,
    public_fragments: summarizePublicFragments(nextFragments),
    updated_at: now,
  };
  assertMultipassProfile(nextProfile);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`UPDATE saved_records SET profile_json = ?, fragments_json = ?, updated_at = ? WHERE multipass_id = ?`).run(
      JSON.stringify(nextProfile),
      JSON.stringify(nextFragments),
      now,
      bundle.profile.multipass_id,
    );
    appendChangeLog(db, bundle.profile.multipass_id, message, now);
    appendAuditEvent(db, bundle.profile.multipass_id, auditType, auditPayload, now);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function readFragmentMutationResult(db, multipassId, fragmentId) {
  const bundle = readBundleById(db, multipassId);
  const fragment = bundle?.fragments.find((entry) => entry.fragment_id === fragmentId);
  if (!bundle || !fragment) throw new Error('Fragment mutation result not found.');
  return {
    fragment,
    fragments: {
      schema_version: bundle.profile.schema_version,
      multipass_id: bundle.profile.multipass_id,
      fragments: bundle.fragments.filter((entry) => entry.visibility === 'public'),
    },
    profile: bundle.profile,
  };
}

function readToolImportResult(db, multipassId, fragmentId) {
  const result = readFragmentMutationResult(db, multipassId, fragmentId);
  return {
    ...result,
    tools: summarizeToolsResponse(multipassId, readBundleById(db, multipassId)?.fragments ?? []),
  };
}

function updateProfileOwnerSummary(db, multipassId, ownerSummary, updatedAt) {
  const profile = requireSavedProfile(db, multipassId);
  const nextProfile = {
    ...profile,
    owner_summary: {
      ...profile.owner_summary,
      ...ownerSummary,
      visibility: profile.owner_summary.visibility ?? 'public',
    },
    updated_at: updatedAt,
  };
  if (nextProfile.owner_summary.verified_at === null) {
    delete nextProfile.owner_summary.verified_at;
  }
  assertMultipassProfile(nextProfile);
  db.prepare(`UPDATE saved_records SET profile_json = ?, updated_at = ? WHERE multipass_id = ?`).run(
    JSON.stringify(nextProfile),
    updatedAt,
    multipassId,
  );
}

function appendChangeLog(db, multipassId, message, createdAt) {
  db.prepare(`INSERT INTO change_log_entries (multipass_id, change_id, message, created_at) VALUES (?, ?, ?, ?)`).run(
    multipassId,
    `change_${randomHex(12)}`,
    message,
    createdAt,
  );
}

function appendAuditEvent(db, multipassId, eventType, event, createdAt) {
  db.prepare(`INSERT INTO audit_events (audit_id, multipass_id, event_type, event_json, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    `audit_${randomHex(12)}`,
    multipassId,
    eventType,
    JSON.stringify(event ?? {}),
    createdAt,
  );
}

function formatPublicProfileFieldList(fields) {
  return fields.map((field) => PUBLIC_PROFILE_FIELD_LABELS.get(field) ?? field).join(', ');
}

function isEndpointFragment(fragment) {
  return fragment?.fragment_type === 'endpoint';
}

function prepareEndpointRouteFragment(fragment) {
  if (!isEndpointFragment(fragment)) return fragment;
  assertEndpointRouteRef(fragment);
  return assertIdentityFragment({
    ...fragment,
    endpoint_ref: {
      ...fragment.endpoint_ref,
      url: parseHttpsUrl(fragment.endpoint_ref.url, 'endpoint_ref.url'),
    },
    source: {
      ...fragment.source,
      reference_url: parseHttpsUrl(fragment.endpoint_ref.url, 'endpoint_ref.url'),
    },
  });
}

function assertEndpointRouteRef(fragment) {
  if (!isEndpointFragment(fragment)) return;
  if (!fragment.endpoint_ref?.endpoint_id) throw new TypeError('endpoint_ref.endpoint_id is required for endpoint routes.');
  if (!fragment.endpoint_ref?.url) throw new TypeError('endpoint_ref.url is required for endpoint routes.');
  parseHttpsUrl(fragment.endpoint_ref.url, 'endpoint_ref.url');
}

function assertUniqueEndpointId(fragments, candidate, currentFragmentId = null) {
  if (!isEndpointFragment(candidate)) return;
  assertEndpointRouteRef(candidate);
  const candidateId = candidate.endpoint_ref.endpoint_id;
  const collision = fragments.find((fragment) => (
    fragment.fragment_id !== currentFragmentId
    && fragment.fragment_type === 'endpoint'
    && fragment.endpoint_ref?.endpoint_id === candidateId
  ));
  if (collision) throw new TypeError(`endpoint_ref.endpoint_id duplicates an existing endpoint route: ${candidateId}`);
}

function assertUniqueActiveToolId(fragments, candidate) {
  if (candidate?.fragment_type !== 'tool_manifest') return;
  const candidateId = candidate.tool_manifest_ref?.tool_id;
  const collision = fragments.find((fragment) => (
    fragment.fragment_type === 'tool_manifest'
    && fragment.tool_manifest_ref?.tool_id === candidateId
    && ['pending', 'verified', 'stale', 'disputed'].includes(fragment.status)
  ));
  if (collision) throw new TypeError(`tool_id already exists for an active tool: ${candidateId}`);
}

function routeChangeLabel(fragment) {
  if (fragment?.fragment_type !== 'endpoint') return fragment?.fragment_type ?? 'fragment';
  return fragment.public_value ?? fragment.endpoint_ref?.endpoint_id ?? 'route';
}

function fragmentChangeMessage(action, fragment) {
  if (fragment?.fragment_type === 'endpoint') return `Public route ${action}: ${routeChangeLabel(fragment)}.`;
  return `Public fragment ${action}: ${fragment.fragment_type}.`;
}

function readClaimRequest(db, claimId) {
  return db.prepare(`SELECT * FROM claim_requests WHERE claim_id = ?`).get(claimId) ?? null;
}

function normalizePublicProfileEdits(edits) {
  if (!isPlainObject(edits)) throw new TypeError('Profile edits must be an object.');
  for (const key of Object.keys(edits)) {
    if (!EDITABLE_PROFILE_FIELDS.has(key)) {
      throw new TypeError(`${key} is not editable through Multipass management.`);
    }
  }

  const normalized = {};
  if ('display_name' in edits) {
    normalized.display_name = normalizeBoundedString(edits.display_name, 'display_name', 120);
  }
  if ('summary' in edits) {
    normalized.summary = normalizeBoundedString(edits.summary, 'summary', 1000);
  }
  if ('avatar_url' in edits) {
    normalized.avatar_url = normalizeOptionalUrl(edits.avatar_url, 'avatar_url');
  }
  if ('tags' in edits) {
    if (!Array.isArray(edits.tags)) throw new TypeError('tags must be an array.');
    normalized.tags = [...new Set(edits.tags.map((tag) => normalizeTag(tag)))].slice(0, 12);
  }
  if ('visibility' in edits) {
    normalized.visibility = normalizeEditableVisibility(edits.visibility);
  }
  return normalized;
}

function normalizeEditableVisibility(value) {
  const visibility = String(value ?? '').trim().toLowerCase();
  if (!EDITABLE_PROFILE_VISIBILITY.has(visibility)) {
    throw new TypeError('visibility must be public, gated, private, or hidden.');
  }
  return visibility;
}

function normalizeTag(value) {
  const tag = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!tag) throw new TypeError('tags cannot include empty values.');
  if (tag.length > 40) throw new TypeError('tags values must be 40 characters or fewer.');
  return tag;
}

function normalizeOptionalUrl(value, field) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return parseHttpsUrl(String(value).trim(), field);
}

function parseHttpsUrl(value, field) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new TypeError(`${field} is required.`);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new TypeError(`${field} must be a valid URL.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new TypeError(`${field} must use https.`);
  }
  return parsed.toString();
}

function normalizeBoundedString(value, field, maxLength) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${field} is required.`);
  if (normalized.length > maxLength) throw new TypeError(`${field} must be ${maxLength} characters or fewer.`);
  return normalized;
}

function normalizeWallet(value, field) {
  const wallet = String(value ?? '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) throw new TypeError(`${field} must be an EVM wallet address.`);
  return wallet;
}

function normalizeDomain(value) {
  const domain = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}$/.test(domain)) throw new TypeError('domain is invalid.');
  return domain;
}

function normalizeClaimStatus(value) {
  const status = String(value ?? '').trim();
  if (!['claimed_verified_owner', 'claimed_review_approved', 'claimed_admin_seeded'].includes(status)) {
    throw new TypeError('claimStatus is invalid.');
  }
  return status;
}

function dateFrom(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError('Invalid date.');
    return value;
  }
  if (value === undefined || value === null || value === '') return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid date: ${value}`);
  return date;
}

function randomHex(bytes) {
  return randomBytes(bytes).toString('hex');
}

function hashSecret(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
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
