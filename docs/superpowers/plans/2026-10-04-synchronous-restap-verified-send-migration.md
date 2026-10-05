# Synchronous RESTAP Verified Send Migration Plan

**Date:** 2026-10-04  
**Status:** Executable replacement plan; supersedes the 2026-10-02 active-network implementation plan for new work

**Goal:** Replace the private-network product path with the smallest canonical RESTAP relay: current-owner Console request → verified synchronous opening → recipient generic `/talk` → redacted terminal metadata.

## Phase A — first slice (this change)

- [x] Mark the 2026-10-02 active-network design and plan as superseded while preserving their historical contents.
- [x] Add TDD coverage that fails before implementation for success, mutual-policy denial, custody failure, idempotent replay, conflicting key reuse, final revocation, charged-unknown provider ambiguity, plaintext exclusion, and legacy-path non-use.
- [x] Add an additive STRICT `restap_network_verified_sends` table containing hashes/metadata/status/usage only.
- [x] Add a dependency-injected synchronous send core with exact inputs, mutual opt-in/allowlists, one reconciliation per Looper, atomic idempotency/quota reservation, one provider request per side, final revocation check, and conservative ambiguity handling.
- [x] Add a same-process transport adapter that invokes a generic RESTAP `talk` runtime directly.
- [x] Add `POST /api/multipass/console/restap-network/:sender/talk` behind existing Console Origin/session/CSRF/current-owner controls, independent of legacy network gates.
- [x] Export the new service/transport API and update TypeScript declarations.
- [x] Run the focused test, database/Console/public-talk adjacent suites, and the complete API suite; record exact results before handoff.

## Phase B — composition rehearsal (separate approved change)

- [x] Compose the verified-send service from the production store, policy reader, custody reconciler, pinned Codex runtime, one bounded opening inference adapter, and the existing recipient RESTAP runtime.
- [x] Configure only the exact same-process recipient roster (MULTIPASS_RESTAP_VERIFIED_SEND_RECIPIENT_TOKEN_IDS=3802) initially; no peer HTTP transport exists.
- [x] Add exact MULTIPASS_RESTAP_VERIFIED_SEND_ENABLED and MULTIPASS_RESTAP_VERIFIED_SEND_EMERGENCY_STOP parsing, with the emergency stop defaulting to stopped.
- [x] Add the rehearse:restap-verified-send API package command, which uses a read-only online SQLite backup in a temporary directory and deterministic in-process providers, leaving live routing and the source database unchanged.
- [x] Prove exact idempotent replay after reopen and prove no opening/reply plaintext in SQLite or WAL; the rehearsal emits metadata only, creates no network client, and deletes its temporary backup.
- [x] Replace the Console cadence/scheduler/intent UI with one strict synchronous Send verified introduction form; preserve the five-workspace layout and responsive behavior.

## Phase C — migration gate (requires explicit live approval)

- [ ] Leave legacy worker/initiation/reply gates off and ensure the new route does not consult them.
- [ ] Back up the database and deploy additive schema/code with the verified-send emergency stop on.
- [ ] Treat rollback as forward-compatible code/config rollback: the prior binary rejects the additive table through exact-schema enforcement, so preserve the database backup and do not restart the old binary against the migrated file.
- [ ] Enable one owner/peer/topic tuple and execute one bounded proof.
- [ ] Verify request count (maximum one provider call per side), terminal row, custody/policy generations, and content hashes.
- [ ] Roll back by opening the single emergency stop; do not reactivate scheduler/worker paths.

## Phase D — retirement after observation

- [x] Remove Console intent/scheduler affordances from the product UI; retain historical backend modules only for migration compatibility.
- [ ] Archive legacy lease/grant/conversation/worker modules and migrations only after confirming no supported route imports or calls them.
- [ ] Keep historical database tables read-only until retention/backup requirements permit a separate approved cleanup.

## Stop conditions

Stop and fail closed on custody disagreement/unavailability, policy mismatch, missing explicit peer/topic opt-in, exhausted quota, emergency stop, malformed provider output, ambiguous transport outcome, final generation change, schema drift, or any plaintext persistence signal.
