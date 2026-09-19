# Multipass Console Production Rollout - 2026-09-17

## Current production state

The secure integrated Console API and XMTP worker are live behind a blue/green cutover.

- Public Console UI: `https://helixa.xyz/multipass/console`
- Browser API base: `https://helixa.xyz/multipass-api`
- Public integrated XMTP service: `multipass-api-xmtp-holder-proof.service` on `127.0.0.1:8792`
- Immediate rollback services remain running on `127.0.0.1:8791`, `127.0.0.1:8790`, `127.0.0.1:8789`, and `127.0.0.1:8788`
- Nginx Multipass routes point to `127.0.0.1:8792`
- `MULTIPASS_XMTP_ENABLED=1`
- `MULTIPASS_AGENT_BANKR_LLM_ENABLED=1`
- `multipass-xmtp-worker.service` is stopped and disabled; the integrated API owns the only XMTP client/database and inbound stream.

The initial cutover made no onchain transaction, wallet write, Bankr inference call, or holder-authenticated production XMTP publish. The later gated proofs below added holder-authenticated XMTP and Bankr inference without any onchain transaction or wallet write.

## Live proof

Verified through the production public route:

- Console page returns `200` and serves the new production bundle.
- Signed wallet challenge creation returns `200`.
- A valid signed session receives an HttpOnly session cookie and can read only its own owned-Looper set.
- An unrelated authenticated wallet receives `403` when attempting to activate Looper #617.
- Read-only Base proof still resolves Looper #617 to holder `0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea`, ERC-8004 identity #87069, with Adapter8004 controller authorization.
- The integrated XMTP client/database and inbound stream start cleanly in the public process while Bankr remains forced off.
- No local adapter is presented as live XMTP.
- Production API/XMTP logs showed no new errors during the smoke pass.

The server does not hold the private key for Looper #617's holder, so holder-signed activation must be completed by that wallet through the live Console before the outbound/inbound message proof.

## Rollback

Rollback artifacts:

- Static UI archive: `/home/ubuntu/backups/multipass-web-pre-console-20260917T144052Z.tgz`
- Initial nginx backup: `/home/ubuntu/backups/helixa.xyz.nginx.pre-console-20260917T144052Z`
- Pre-integrated nginx backup: `/home/ubuntu/backups/helixa.xyz.nginx.pre-integrated-20260917T151142Z`
- Immediate pre-XMTP nginx backup: `/home/ubuntu/backups/helixa.xyz.nginx.pre-live-xmtp-20260917T153609Z`
- Rollback APIs remain live on ports `8790`, `8789`, and `8788`.

Immediate XMTP rollback:

```bash
sudo cp /home/ubuntu/backups/helixa.xyz.nginx.pre-live-xmtp-20260917T153609Z /etc/nginx/sites-enabled/helixa.xyz
sudo nginx -t
sudo systemctl reload nginx
```

Full initial API rollback:

```bash
sudo cp /home/ubuntu/backups/helixa.xyz.nginx.pre-console-20260917T144052Z /etc/nginx/sites-enabled/helixa.xyz
sudo nginx -t
sudo systemctl reload nginx
```

Static UI rollback:

```bash
sudo find /var/www/helixa.xyz/multipass -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
sudo tar -C /var/www/helixa.xyz -xzf /home/ubuntu/backups/multipass-web-pre-console-20260917T144052Z.tgz
```

Do not stop the old `multipass-api.service` until the live XMTP and Bankr gates pass.

## Integrated enablement architecture

The next code gate is implemented as a single-process bootstrap owned by `apps/api/src/server.js`:

1. Startup validates XMTP enablement before opening any resource. `MULTIPASS_XMTP_ENABLED=1` requires a 32-byte hex `MULTIPASS_XMTP_WALLET_KEY`, a non-empty `MULTIPASS_XMTP_DB_PATH`, and a 32-byte hex `MULTIPASS_XMTP_DB_ENCRYPTION_KEY`; missing or malformed configuration aborts startup.
2. The process creates one Base public-client set and one `authorizeLooperControl` closure, then shares them between owned-Looper loading, API authorization, and inbound reauthorization.
3. The process creates one canonical `createLooperRuntimeRegistry()` instance and injects the same registry into the HTTP API and inbound worker.
4. When XMTP is enabled, the process opens one XMTP Node SDK client/database, wraps that exact client in one publishing adapter, creates one Sibyl store and one Console runtime around that publisher, and passes the same Node client, publisher, runtime, registry, and authorizer to the worker. No second SDK client or database handle is created.
5. When XMTP is disabled, no Node SDK client or inbound worker is created; the API retains the fail-closed unavailable transport and never substitutes the local test adapter.
6. `MULTIPASS_AGENT_BANKR_LLM_ENABLED` remains an independent opt-in. XMTP enablement does not construct or call Bankr by itself, and the current production value remains `0`.
7. Graceful `SIGINT`/`SIGTERM` shutdown stops the worker stream, closes the HTTP server, closes the XMTP client when supported, and then closes the API database resource. Cleanup is idempotent.

The standalone `multipass-xmtp-worker.service` must remain stopped and disabled. Running it beside the integrated API would create a second in-memory registry and could open the same XMTP database twice.

The secure boundaries are unchanged: signed session and CSRF checks, fresh `ownerOf` and Adapter8004 `isController` authorization, active-runtime checks, server-derived canonical conversation binding, Sibyl namespace/recovery, inbound sender and replay checks, and review-only output.

## Exact remaining live proof

The signer/database configuration and integrated XMTP process are now live with Bankr disabled. The remaining proof is:

1. Have the holder wallet complete signed activation for Looper #617 in the live Console.
2. Send one holder-authenticated outbound Console message and verify its canonical XMTP conversation binding.
3. Deliver one inbound holder XMTP message and verify one review-only runtime response, Sibyl persistence/recall after a fresh signed session, unrelated-wallet `403`, duplicate-message rejection, and no response loop.
4. Verify graceful shutdown closes the stream, HTTP listener, and XMTP client without a second database opener.
5. Only after those checks, separately approve `MULTIPASS_AGENT_BANKR_LLM_ENABLED=1` and prove one clearly labeled authenticated Bankr response; do not combine that approval with the XMTP gate.

RESTAP remains deferred until the authenticated XMTP path is live-proven.

## Two-signer live XMTP proof and promotion (20:50–21:15 UTC)

The first public XMTP client used the same EOA as the authenticated Looper holder. That made API publishing work, but it could not prove the inbound worker path because holder messages shared the worker's own XMTP inbox and were correctly classified as `own_message`.

The corrected production topology separates roles:

- Looper #2431 holder/operator: `0xD31fCdb0432D3C9BF9d98643F69C7edd690E48E8`
- dedicated XMTP agent signer: `0x31442ee2dC53575769E618a9437C25C336241193`
- canonical ERC-8004 identity: `89144`
- canonical conversation: `9a7a29218ecea5706a4f5e4e2aecacb4`
- integrated service: `multipass-api-xmtp-holder-proof.service` on `127.0.0.1:8792`
- XMTP database: `/var/lib/helixa/multipass-xmtp-agent-proof.db3`
- effective flags: XMTP enabled; Bankr LLM disabled

Proof completed before promotion:

- holder-signed Console authentication and owned-agent loading
- canonical owner/controller checks for Looper #2431 and ERC-8004 #89144
- two distinct XMTP group members (holder and agent signer)
- holder-authored inbound message `828c10d649c1fe3278011a0ce32d5afe46dabb5bb810166bbe031129d2d0a9e3`
- runtime response `23a3fcbd78b21e3b34bb85198d4c6453d0acd9ec35f11a0c046248a3894f5bb1`
- fresh-session recovery against the same canonical conversation
- Sibyl recall of the canonical identity and review-only constraint
- replayed idempotency key returned the same XMTP message id and did not append another runtime response
- API-originated agent messages produced no own-message response loop
- unrelated authenticated wallet activation returned `403`
- one process held the XMTP database and service logs contained no runtime errors

Nginx was backed up to `/home/ubuntu/backups/helixa.xyz.nginx.pre-two-signer-xmtp-20260917T205505Z`, then all Multipass API upstreams were moved from port `8791` to `8792`. Ports `8791`, `8790`, `8789`, and `8788` remain available for rollback.

The Sibyl bridge was corrected test-first to preserve `senderLabel`, `participantId`, `conversationId`, and `xmtpMessageId` in thread records. The Console participant copy now labels the room as Looper + authenticated holder rather than two wallet-owned agents. A broken Privy logo URL was also corrected to the deployed Multipass PNG. Full tests and the production web build passed; desktop/mobile signed-out browser checks and the public demo check passed without broken images, overflow, or page errors.

## Bankr live inference proof and promotion (2026-09-18 02:03–02:15 UTC)

Quigley separately approved the Bankr gate after the two-signer XMTP proof. A private adapter smoke reached the live Bankr LLM Gateway with positive credits. The first holder-authenticated production attempt then exposed a real configuration edge: the server passed `null` as the model when `MULTIPASS_AGENT_LLM_MODEL` was unset, and Bankr rejected the request with `Missing required fields: model, messages`. Bankr was immediately disabled while the issue was fixed test-first. `createBankrLlmClient` now normalizes null or blank model values to `claude-haiku-4.5`; the focused Bankr, bootstrap, auth, server, and XMTP suite passed 59/59.

Bankr was then re-enabled on the existing public 8792 process. The live process was verified with XMTP enabled, Bankr enabled, and the Bankr credential present without printing it. A holder-signed activation and message for Looper #2431 / ERC-8004 #89144 returned `200`, used inference provider `bankr_llm_gateway`, published through `xmtp_group`, and kept execution and generated proposals `review_only`. The active recovered conversation is `dad60ee3e0489c35efb72ba34ba1aaa3`; the Bankr-backed XMTP response ID is `6a5cca9f9b53d961e9c5e9fa8af9adc1c49590ce10adcdd5bbdef5bddbcb81e8`. Public-route holder activation returned `200`, an unrelated signed wallet remained `403`, unauthenticated owned-agent loading remained `401`, the Console remained `200`, Bankr credits remained positive, service logs contained no new warnings, and the full workspace suite passed 772/772.

Rollback copies created before Bankr enablement:

- `/home/ubuntu/backups/multipass-api-xmtp-holder-proof.service.pre-bankr-20260918T020304Z`
- `/home/ubuntu/backups/multipass-api-xmtp-holder-proof.env.pre-bankr-20260918T020304Z`
