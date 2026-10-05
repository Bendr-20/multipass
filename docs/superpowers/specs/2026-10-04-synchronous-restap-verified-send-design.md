# Synchronous RESTAP Verified Send Design

**Date:** 2026-10-04  
**Status:** Approved simplification; supersedes the 2026-10-02 active-network design for all new implementation  
**Canonical RESTAP surface:** `GET /.well-known/restap.json`, `POST /talk`, optional passive `/news`; authentication is application-defined

## Decision

Helixa's first private Looper-to-Looper path is one owner-initiated, synchronous, verified send. It is not a scheduler, conversation engine, or private RESTAP dialect.

The owner-facing route is:

`POST /api/multipass/console/restap-network/:sender/talk`

The exact JSON body is:

`{ "recipient_token_id": "…", "topic": "…", "idempotency_key": "…" }`

The Console Network workspace exposes this as one **Send verified introduction** form. It has only recipient and closed-topic inputs. The prior cadence, run-time, scheduled-intent list, cancellation controls, and autonomous-initiation switch are removed. An unchanged failed draft reuses its idempotency key; a changed draft or committed send rotates it.

The route reuses the existing Console session, Origin, CSRF, and current-owner/controller authorization. It does not introduce another auth scheme. RESTAP peer delivery uses the recipient's ordinary `/talk` runtime contract. A same-process transport calls that runtime directly; the transport boundary can later support canonical HTTP peers without changing the send core.

## Synchronous flow

1. Authenticate the current Console owner and authorize control of the sender Looper.
2. Reconcile current custody exactly once for sender and recipient; require ready snapshots in the same collection and bind the sender snapshot to the authenticated owner.
3. Read both custody-generation-scoped policies. Fail closed unless both enable the network, both allow the topic and the other peer explicitly, neither blocks the peer, the recipient enables inbound talk, no mute is active, and all applicable quotas are positive.
4. Read each Looper's pinned public Codex projection locally.
5. In one SQLite transaction, recheck both custody rows, detect idempotency replay/conflict, enforce sender/recipient/pair daily quotas, and insert one `restap_network_verified_sends` row.
6. Mark sender dispatch, make at most one bounded opening-provider request, and retain opening text only in memory.
7. Hash the opening, mark recipient dispatch, and invoke the recipient's generic RESTAP `talk` handler through the transport abstraction at most once in stateless mode. The recipient runtime must not create or append a RESTAP session for this path.
8. Perform one final non-provider custody snapshot and policy-generation revocation check, including the emergency stop, inside the same local transaction that writes the terminal state.
9. Commit only status, topic/token metadata, custody/policy generations, SHA-256 content hashes, bounded usage counters, and timestamps. Return the initial bounded reply to the owner without persisting it.

A completed idempotent replay returns the stored metadata and hashes only; it never regenerates or stores a plaintext reply. A durable `reserved` row is safe to resume because it precedes every provider boundary. Any replay after `sender_dispatched` or `recipient_dispatched` becomes `charged_unknown` and is never retried.

## Failure semantics

- Custody, mutual policy, allowlist, mute, or quota failure occurs before provider dispatch.
- Reusing an idempotency key with a different sender/recipient/topic digest is a conflict.
- Once a provider boundary is marked dispatched, an exception, timeout, malformed result, or otherwise ambiguous outcome becomes `charged_unknown`; it is never automatically retried.
- Final custody or policy-generation change becomes `cancelled_charged`.
- One emergency-stop predicate gates both reservation entry and final commit.
- Message and reply limits are 2,000 and 4,096 UTF-8 bytes respectively.

## Persisted boundary

The verified-send table intentionally has no message, prompt, reply-text, transcript, body-JSON, session, grant, or signature columns. It stores digests, policy/custody generations, status/reason, provider usage, and timestamps. Plaintext exists only in the bounded synchronous call stack and HTTP response.

## Explicit non-goals

The new path and Console action do not call or depend on activation leases, worker polling, signed same-process grants, conversation tables, intent scheduling, multi-scope breakers, provider-total reconciliation, autonomous loops, or transcript persistence. Existing modules and tables remain for migration compatibility but are unreachable from the new `/talk` route.

The 2026-10-02 design and plan remain historical records of the prior architecture; their implementation is not the base for new RESTAP networking work.
