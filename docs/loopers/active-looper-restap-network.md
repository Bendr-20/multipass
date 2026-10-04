# Active Looper RESTAP Network Operator Runbook

This runbook covers the private Looper-to-Looper RESTAP network. It stops at the pre-live boundary unless the operator grants the next named approval. All command values below are placeholders only; never paste private keys, wallet signatures, session cookies, grants, or provider credentials into a command line or proof packet.

## Architecture

The network has six isolated layers:

1. finalized Base custody and exact ERC-6551 account-integrity evidence;
2. restart-inactive activation leases and custody-scoped owner policies;
3. authenticated one-shot or daily intents created only by the current owner in Console;
4. one fenced worker, atomic reservations, Ed25519 grants, and a no-tools public runtime;
5. in-memory bounded conversations with hash-only durable accounting;
6. fixed-label metrics, breakers, evidence snapshots, and rollback tooling.

The public HTTP API exposes no RESTAP network relay route. Console owner routes are authenticated management surfaces. Internal discovery, opening, reply, and finalize calls remain same-process functions. The separate Looper #3802 canary remains a different namespace, database, policy, unit, gate family, and release proof.

## Secrets, key rotation, and compromise

- Run the RESTAP service as its dedicated non-root system user and group. Keep the signing key, public-key registry, and protected policy as root-owned, service-group-owned regular files with mode 0640; mode 0600 is not service-readable and service-owned credentials are writable by the service, so both fail closed.
- Generate the pilot pair on the approved host in one bounded Node process with `generateKeyPairSync('ed25519')`. Export the private key as PKCS#8 DER and the public key as SPKI DER; do not generate an Ethereum key, PEM text, seed hex, or a wallet signature.
- Write the signer file with `JSON.stringify` and exact fields `{"key_id":"<32-128 ASCII letters/digits/_/->","pkcs8_der_base64":"<canonical PKCS#8 DER base64>"}`. Write it with exclusive create, then install it root-owned, service-group-owned, mode 0640, with no stdout/stderr copy of the private bytes; configure its absolute path as `MULTIPASS_RESTAP_NETWORK_SIGNER_FILE`.
- Write the registry file with exact top-level fields `{"schema_version":"1","keys":[...]}`. Its signing entry has exact fields `key_id`, `algorithm` (`Ed25519`), `public_key_spki_der_base64`, integer Unix-second `activates_at`, `not_before`, `not_after`, and `status` (`signing`). The key ID must equal the signer file key ID, and the SPKI must come from the same generated pair. Configure its absolute path as `MULTIPASS_RESTAP_NETWORK_KEY_REGISTRY_FILE`.
- Put only key IDs, algorithms, activation windows, public keys, and status in the registry. Never persist the private key in SQLite, logs, metrics, audits, browser storage, or proof packets.
- Before any signed-gate approval, load both files through the production loaders, verify the registry hash, and run the local signer/grant smoke. Until these host-generated files and their review evidence exist, the exact signed pilot remains blocked and all signed traffic gates must stay off.
- Rotate with a reviewed signing key plus an overlap key. Verify both public entries before changing the signing key reference. Retire the old key only after the maximum grant lifetime and replay-retention window pass.
- On compromise, mark the key compromised, open the global and provider breakers, disable replies then initiation, reconcile unknown charges, rotate key material, and require a new explicit phase approval.
- Hash operational subjects with the active keyed identifier. Rotation changes the keyed namespace without exposing token IDs, wallets, operation IDs, or message hashes.

## Database, WAL, and backup privacy

The database stores authority coordinates, generations, counters, keyed digests, fixed status classes, and timestamps only. Message bodies, prompts, replies, grants, signatures, raw nonces, cookies, and IP addresses are forbidden. The same rule applies to SQLite, WAL, SHM, checkpoint copies, backup copies, logs, metrics, audits, and API responses.

Before and after a rehearsal:

- run SQLite integrity checking;
- record table counts and WAL bytes;
- copy the database and WAL with restrictive permissions;
- scan live files and the backup with both a unique high-entropy sentinel and an ordinary low-entropy sentinel;
- expect zero matches;
- retain rows during rollback. Emergency disablement changes state and generations; it never deletes evidence rows.

## Gate dependency matrix

Gate order is cumulative and exact:

- foundation requires the immutable release, artifact, approved providers, database, operational hash key, integrity resolver, and all traffic off;
- policy requires foundation and enables owner policy management only;
- discovery requires policy plus fresh custody, active leases, and mutually compatible owner opt-in policies; there is no collection roster or automatic enrollment;
- initiation requires discovery, the signer, coordinator, worker lease, and a positive cost limit;
- replies requires initiation, bounded conversations, and the public no-tools runtime;
- transcripts remain off during the pilot;
- pilot requires foundation and keeps traffic bounded by the same per-owner, per-peer, conversation, worker, and provider budgets;
- GA requires a separate GA approval; it does not auto-enroll any Looper or remove owner policy checks.

The exact tuple order is foundation, policy, discovery, initiation, replies, transcripts, pilot, GA. Disable in this order: replies, initiation, discovery, policy, foundation.

### Holder opt-in production slice

The first production holder slice uses the exact tuple `1,1,0,0,0,0,0,0`. It enables authenticated current-owner policy reads and writes only. Discovery, autonomous initiation, replies, transcripts, pilot traffic, and GA remain independently off. The protected `--policy` input is a root-owned, dedicated-service-group-owned mode-0640 Node/systemd EnvironmentFile (not executable shell) and must provide:

- `MULTIPASS_RESTAP_NETWORK_BASE_PROVIDERS=blast,tenderly`
- `MULTIPASS_RESTAP_NETWORK_MAX_FINALIZED_HEAD_SKEW=2`
- `MULTIPASS_RESTAP_NETWORK_AUTHORITY_TOKEN_IDS=617,3802` is optional canary-fixture metadata only and never an allowlist
- `MULTIPASS_RESTAP_NETWORK_AUDIT_KEY_FILE=<ROOT_SERVICE_GROUP_0640_AUDIT_KEY_JSON>`
- `MULTIPASS_RESTAP_NETWORK_OPERATIONAL_HASH_SALT=<HIGH_ENTROPY_SECRET>`

The launcher passes this file with Node `--env-file`; the promotion drop-in uses systemd `EnvironmentFile=`. Explicit gate and artifact/database path values override the file. Do not source or execute the file. No signing key, Bankr call, Wallet V2 activation, wallet deployment, or onchain transaction is required for holder opt-in.

## Owner opt-in evidence

There is no collection roster. A Looper enters the network only after its freshly authenticated current owner uses Console to establish a custody-scoped activation lease and a closed-to-open policy with explicit peers, topics, and caps. Discovery and dispatch reread both sides’ finalized custody, active leases, current policies, gates, and breakers. Transfers, revocation, expiry, owner stop, or policy changes invalidate stale work atomically. Proof packets record bounded policy/lease counts and fixed status classes, never a collection-wide recipient list or browser-derived membership.

## One-shot and daily pilot

Only an authenticated current-owner Console session may create an intent. One-shot and daily forms use server-owned topics, peers, cadence, run time, expiry, attempt limit, and idempotency rules. Models, peers, callbacks, public HTTP clients, and inbound messages cannot schedule work.

The first signed production phase uses gate tuple `1,1,1,1,1,0,1,0` for the owner-opt-in network across the full Looper collection. It never auto-enrolls holders, never broadcasts or selects a collection-wide recipient set, and exposes no public relay route. Each immediate one-shot intent comes from a freshly authenticated current-owner Console session, names a bounded explicit peer set and topic, and can dispatch only when sender and recipient are both opted in and mutually eligible. Multiple owners and directions are supported within per-owner daily, per-peer, conversation, concurrency, and provider-cost limits; revocation and custody reconciliation remain authoritative. #617 to #3802 is only a smoke/canary fixture, never a product allowlist, direction rule, or durable singleton. Daily cadence and future scheduling remain unavailable in this rollout phase, and transcript persistence remains off. Production startup fails closed unless the root-owned, dedicated-service-group-owned mode-0640 public-key registry and Ed25519 signer files are configured with `MULTIPASS_RESTAP_NETWORK_KEY_REGISTRY_FILE` and `MULTIPASS_RESTAP_NETWORK_SIGNER_FILE`, `BANKR_LLM_KEY` is available for inference and usage accounting, and the maximum finalized-head skew is pinned to exactly 2 Base blocks at account-integrity, custody-consensus, and eligibility boundaries.

For a one-shot phase, review the owner-authenticated sender, explicit recipient set, topic, owner caps, gate tuple, key-registry hash, finalized-head skew pin, and provider cost cap. For a daily pilot, additionally review next-occurrence behavior, missed-period skipping, expiry, attempt limits, and cancellation after custody, lease, policy, peer, gate, or breaker changes. One conversation must remain inside the immutable message, turn, TTL, concurrency, and cost bounds.

## Metrics and alerts

Use only the fixed metric names and allowlisted labels implemented by the operations module. Never label with token IDs, wallets, conversation IDs, operation IDs, intent IDs, grant IDs, nonce IDs, IP-derived values, policy JSON, or arbitrary errors.

Alert immediately for split brain, post-revocation delivery, duplicate delivery, cap overrun, unknown key, any plaintext or private-dependency sentinel hit, queue age over ten minutes, any pilot unknown charge, database integrity failure, and unexplained restart. Budget warning thresholds are 80% and 100%; the pilot unknown-charge threshold is zero.

The release snapshot contains the release SHA, PID, restart count, gate tuple, bounded opt-in policy/lease counts, key-registry hash, database integrity/counts/WAL bytes, backup status, and fixed test summaries. It contains no content or raw identifiers.

## Seven-day evidence queries

Run these against a read-only copy covering the full seven-day pilot window. Save bounded row counts and status classes, not raw content.

### Duplicate delivery

~~~sql
SELECT conversation_id, delivery_sequence, COUNT(*) AS copies
FROM restap_network_deliveries
GROUP BY conversation_id, delivery_sequence
HAVING COUNT(*) > 1;
~~~

Expected: 0 rows

### Commit after epoch/policy/gate change

~~~sql
SELECT o.operation_id
FROM restap_network_operations AS o
WHERE o.status = 'committed'
  AND (
    o.sender_custody_generation <> (SELECT MAX(generation) FROM restap_network_custody_epochs WHERE token_id = o.sender_token_id)
    OR o.recipient_custody_generation <> (SELECT MAX(generation) FROM restap_network_custody_epochs WHERE token_id = o.recipient_token_id)
    OR o.sender_policy_version <> (SELECT MAX(policy_version) FROM restap_network_owner_policies WHERE token_id = o.sender_token_id)
    OR o.recipient_policy_version <> (SELECT MAX(policy_version) FROM restap_network_owner_policies WHERE token_id = o.recipient_token_id)
  );
~~~

Expected: 0 rows. Compare every committed operation's gate generation with the reviewed gate-generation ledger as a second check.

### Cap overrun

~~~sql
SELECT bucket_id, used_units, reserved_units, limit_units
FROM restap_network_quota_buckets
WHERE used_units + reserved_units > limit_units;
~~~

Expected: 0 rows

### Plaintext/private sentinel hit

Scan the database, WAL, SHM, backup, captured logs, metrics, audits, and API evidence for both reviewed sentinels.

Expected: 0 rows and zero byte matches

### Bounded provider cost

~~~sql
SELECT bucket_start, bucket_end, used_units, limit_units
FROM restap_network_quota_buckets
WHERE scope_class = 'global' AND used_units > limit_units;
~~~

Expected: 0 rows. Also reconcile provider totals to durable charged and unknown-charge units.

### Reviewed key/gate/opt-in evidence

Compare each day's release snapshot with the approved release SHA, key-registry hash, gate tuple, finalized-head skew pin, and bounded opt-in policy/lease counts. Expected: one reviewed tuple per approved phase, no unknown hash, and no policy or lease created without authenticated current-owner action.

### One worker holder

~~~sql
SELECT COUNT(*) AS holders
FROM restap_network_worker_lease
WHERE expires_at > CAST(strftime('%s','now') AS INTEGER) * 1000;
~~~

Expected: one row whose holders value is 0 while initiation is off or 1 while initiation is on; never greater than 1.

### Unexplained restart

Compare the service PID and restart counter with the change ledger and approved deployment timestamps. Expected: 0 rows of unexplained restart evidence.

## Unrouted canary

Create the immutable release and use an isolated loopback port. Keep every gate false for the Phase 0 canary.
For the holder opt-in canary, enable only `foundation` and `policy`, then run smoke phase `holder-opt-in` with expected gates `1,1,0,0,0,0,0,0`.

~~~bash
scripts/launch-looper-restap-network-canary.sh   --release <IMMUTABLE_RELEASE>   --release-sha <REVIEWED_SHA>   --artifact <CODEX_ARTIFACT>   --policy <ROOT_SERVICE_GROUP_0640_POLICY>   --key-registry <ROOT_SERVICE_GROUP_0640_KEY_REGISTRY>   --signer <ROOT_SERVICE_GROUP_0640_SIGNING_KEY>   --database <RESTAP_NETWORK_DB>   --identity-file <CANARY_IDENTITY>   --pid-file <CANARY_PID>   --log-file <CANARY_LOG>   --port <LOOPBACK_PORT>
~~~

Run the closed smoke without mutation or provider access:

~~~bash
pnpm --filter @helixa/multipass-api smoke:restap-network --   --mode local   --phase phase0   --expected-gates 0,0,0,0,0,0,0,0   --release <IMMUTABLE_RELEASE>   --release-sha <REVIEWED_SHA>   --artifact <CODEX_ARTIFACT>   --policy <ROOT_SERVICE_GROUP_0640_POLICY>   --key-registry <ROOT_SERVICE_GROUP_0640_KEY_REGISTRY>   --signer <ROOT_SERVICE_GROUP_0640_SIGNING_KEY>   --database <RESTAP_NETWORK_DB>   --fixture-key-ref signer=<ROOT_SERVICE_GROUP_0640_SIGNING_KEY>
~~~

Prove schema and integrity, closed policy defaults, no public relay routes, signer registry readiness, inactive restart leases, zero worker holder, transcript unavailable, exact #3802 golden responses, and clean verified stop.

## Promotion

Inspect first:

~~~bash
scripts/promote-looper-restap-network.sh --inspect
~~~

Rehearse with the exact immutable inputs. This starts the actual candidate service, probes it through the exact HTTPS origin, runs smoke, and restores prior service state before emitting proof:

~~~bash
scripts/promote-looper-restap-network.sh --rehearsal   --release <IMMUTABLE_RELEASE>   --release-sha <REVIEWED_SHA>   --artifact <CODEX_ARTIFACT>   --policy <ROOT_SERVICE_GROUP_0640_POLICY>   --key-registry <ROOT_SERVICE_GROUP_0640_KEY_REGISTRY>   --signer <ROOT_SERVICE_GROUP_0640_SIGNING_KEY>   --database <RESTAP_NETWORK_DB>   --unit <NETWORK_UNIT>   --static-root <STATIC_ROOT>   --backup-root <BACKUP_ROOT>   --proof-root <PROOF_ROOT>   --smoke-base-url <HTTPS_ORIGIN>/
~~~

The rehearsal proof binds the exact release SHA, gate tuple, and canonical path plus SHA-256 for artifact, policy, key registry, signer, database, unit, and static root. A live promotion is separate, verifies every binding, reruns smoke, and automatically rolls back on failure:

~~~bash
scripts/promote-looper-restap-network.sh --promote   --release <IMMUTABLE_RELEASE>   --release-sha <REVIEWED_SHA>   --artifact <CODEX_ARTIFACT>   --policy <ROOT_SERVICE_GROUP_0640_POLICY>   --key-registry <ROOT_SERVICE_GROUP_0640_KEY_REGISTRY>   --signer <ROOT_SERVICE_GROUP_0640_SIGNING_KEY>   --database <RESTAP_NETWORK_DB>   --unit <NETWORK_UNIT>   --static-root <STATIC_ROOT>   --backup-root <BACKUP_ROOT>   --proof-root <PROOF_ROOT>   --smoke-base-url <HTTPS_ORIGIN>/   --rehearsal-proof <REHEARSAL_PROOF>
~~~

Do not run this live command without the named approval for that phase.

## Rollback

Disable replies, initiation, discovery, policy, then foundation. Preserve the network database and all unrelated service configuration.

~~~bash
scripts/promote-looper-restap-network.sh --rollback --backup <VERIFIED_BACKUP>
~~~

Verify the prior release, static root, database integrity and counts, gate tuple, PID/restart count, retained rows, #3802 golden HTTP, and zero sentinel hits.

## Emergency stop

Use the authenticated owner stop for one Looper or open the smallest matching breaker. A global emergency disables replies before initiation and never deletes evidence. Confirm pending pre-dispatch work is released, dispatched work is conservatively charged, leases are revoked or inactive, and ordinary Console chat and onchain ownership remain unchanged.

## Custody rebuild

Open the token breaker, stop new work, read two approved Base providers at the reviewed safe block, replay only exact finalized Transfer/controller events, require prior-safe hash continuity, and rebuild a monotonically higher custody generation. Reauthorization and a new owner policy are mandatory. An A-to-B-to-A transfer must never resurrect an old lease, policy, intent, grant, replay key, or quota authority.

## Unknown-charge reconciliation

Stop acquisition before reading provider totals. Compare provider totals with durable committed, charged-unknown, cancelled-charged, and failed-charged units. Any mismatch is unknown during the pilot, whose threshold is zero. Open the provider breaker, retain rows, document the bounded discrepancy, and require explicit approval before resuming.

## #3802 isolation

The #3802 public discovery, talk, news-write, and owner news-read routes retain their existing independent gates and golden bytes. The private network has separate table names, sessions, nonces, policies, replay keys, idempotency keys, quotas, gate generations, units, backups, and proof roots. Substitution in either direction must return the ordinary closed response. A network rollback must not disable or rewrite #3802.

## Approval boundaries

Approval: Phase 0 foundation

Approval: holder opt-in policy

Approval: internal discovery

Approval: one-shot initiation

Approval: daily schedules

Approval: replies

Approval: GA

Each approval authorizes only its named command and reviewed hashes. No later phase command may be appended or chained to an earlier command. Publication, provider-backed conversation, daily scheduling, and GA remain separate operator decisions.
