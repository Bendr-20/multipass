# Looper Name Persistence and Mobile Wallet Authentication Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make holder-selected Looper names durable across browsers and server restarts, and make mobile WalletConnect sign-in wait for a signable provider with stage-specific recovery errors.

**Architecture:** Add a focused SQLite Looper-name store keyed by Base chain, collection contract, and token ID. API writes remain protected by the existing signed Console session, CSRF token, and fresh onchain owner/controller authorization; owned-agent reads overlay the persisted name while retaining the metadata name as canonical. Separately, make the Privy bridge publish signable-wallet readiness to the wallet client and make Console authentication wait through mobile wallet handoff instead of racing the provider.

**Tech Stack:** Node.js 24 built-in SQLite, Fetch API, Privy React Auth, viem, Node test runner, jsdom.

---

## Chunk 1: Durable Looper names

### Task 1: Persistent name store

**Files:**
- Create: apps/api/src/looper-name-store.js
- Create: apps/api/test/looper-name-store.test.mjs

- [x] Write failing tests for persistence across reopen, token-keyed transfer behavior, reset, and validation.
- [x] Run node --test apps/api/test/looper-name-store.test.mjs and confirm failure.
- [x] Implement the minimal SQLite store.
- [x] Rerun the focused test and confirm pass.

### Task 2: Authenticated API and roster overlay

**Files:**
- Modify: apps/api/src/index.js
- Modify: apps/api/src/server.js
- Modify: apps/api/test/secure-looper-activation.test.mjs

- [x] Add failing route tests proving unauthenticated writes fail, CSRF is required, authorization is rechecked, names survive a new API/store instance, reset restores the canonical name, and owned reads return persisted names.
- [x] Add POST /api/multipass/console/agent/name using the existing Console session and fresh Looper authorizer.
- [x] Overlay persisted names onto /api/loopers/owned and activate runtimes with the persisted name.
- [x] Wire the SQLite store to MULTIPASS_DB_PATH and close it during shutdown.
- [x] Run focused API tests.

### Task 3: Web client server authority and local migration fallback

**Files:**
- Modify: apps/web/src/console-agent-api.js
- Modify: apps/web/src/loopers-console-agents.js
- Modify: apps/web/src/app.js
- Modify: apps/web/test/console-agent-api.test.mjs
- Modify: apps/web/test/app.test.mjs

- [x] Add failing tests for server name precedence, rename/reset requests, and cross-browser reload behavior.
- [x] Send rename/reset through the authenticated API and use returned server state.
- [x] Keep localStorage only as fallback for records lacking a server name; remove the migrated token override after successful server write.
- [x] Run focused web tests.

## Chunk 2: Mobile WalletConnect authentication

### Task 4: Signable-provider readiness

**Files:**
- Modify: apps/web/src/privy-wallet-client.js
- Modify: apps/web/test/privy-wallet-client.test.mjs

- [x] Add a failing test where WalletConnect returns an address before Privy publishes its signable wallet.
- [x] Add a bounded wait for the signable Privy wallet/provider and resolve it when useWallets catches up after mobile handoff.
- [x] Keep cancellation and timeout non-destructive.
- [x] Run the focused client tests.

### Task 5: Authentication stage errors

**Files:**
- Modify: apps/web/src/console-agent-api.js
- Modify: apps/web/src/app.js
- Modify: apps/web/test/console-agent-api.test.mjs
- Modify: apps/web/test/app.test.mjs

- [x] Add failing tests for wallet connection, provider readiness, signature, nonce, and session-verification stages.
- [x] Report progress stages from the API client and render a recoverable stage-specific message.
- [x] Run focused tests.

## Chunk 3: Verification and release readiness

- [x] Run API and web suites sequentially.
- [x] Run the production web build.
- [x] Run git diff --check and inspect the final diff for credential or permission regressions.
- [x] Commit the implementation without deploying; production deployment remains a separate reviewed action.
