# Multipass Privy Wallet Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Privy-powered wallet connection to Multipass so Telegram/mobile users can claim profiles through Privy/WalletConnect while the Multipass API remains the owner-proof and manager-auth authority.

**Architecture:** Keep the existing vanilla Multipass renderer. Add a small wallet-client boundary consumed by `createApp`, then mount a tiny React/Privy bridge beside the app root that supplies wallet connection and signing through that boundary. The API claim/session model stays unchanged: server nonce, wallet signature, server verification, HTTP-only manager session, CSRF writes.

**Tech Stack:** Vite, vanilla ESM, Node test runner, JSDOM, React, ReactDOM, `@privy-io/react-auth`, `viem/chains`, existing Multipass API helpers.

---

## References

- Spec: `docs/superpowers/specs/2026-06-27-multipass-privy-wallet-integration-design.md`
- Worktree: `/home/ubuntu/.config/superpowers/worktrees/multipass/multipass-privy-wallet-integration`
- Current live main baseline: `7888a35 Design Privy wallet integration`
- Required skills for execution: @superpowers:subagent-driven-development, @superpowers:test-driven-development, @superpowers:verification-before-completion

## Baseline Evidence

Clean worktree baseline has already been verified:

```bash
cd /home/ubuntu/.config/superpowers/worktrees/multipass/multipass-privy-wallet-integration
pnpm install
pnpm test
```

Expected baseline: `# pass 190`, `# fail 0`.

## File Structure

### Create

- `apps/web/src/wallet-client.js`
  - Owns the framework-free wallet client interface used by the vanilla app.
  - Exports injected-wallet fallback, legacy signer adapter, address formatting, and wallet-error normalization.
  - Does not import Privy or React.

- `apps/web/src/privy-wallet-client.js`
  - Owns the React/Privy bridge.
  - Exports `createPrivyWalletClient`, `PrivyWalletBridge`, and small pure helpers for wallet selection.
  - Imports Privy and React only here.

- `apps/web/test/wallet-client.test.mjs`
  - Unit tests for injected fallback, legacy adapter, address formatting, wallet-error normalization.

- `apps/web/test/privy-wallet-client.test.mjs`
  - Unit tests for Privy bridge pure helpers and client state/action behavior that can run without opening Privy's modal.

### Modify

- `apps/web/package.json`
  - Add runtime dependencies: `@privy-io/react-auth`, `react`, `react-dom`, `viem`.

- `pnpm-lock.yaml`
  - Updated by `pnpm --filter @helixa/multipass-web add ...`.

- `apps/web/index.html`
  - Add a dedicated hidden wallet bridge root, for example `<div id="wallet-root"></div>`, while preserving `<div id="app"></div>` for vanilla rendering.

- `apps/web/src/main.js`
  - Mount `PrivyProvider` and `PrivyWalletBridge` into `#wallet-root`.
  - Start the existing `createApp` against `#app` with the Privy wallet client.
  - Keep a safe fallback if `#wallet-root` is missing.

- `apps/web/src/app.js`
  - Consume `walletClient` instead of only `walletSigner`.
  - Preserve `walletSigner` compatibility for existing tests and simple injected fallback.
  - Render wallet-aware claim button copy.
  - Connect wallet before creating a claim nonce.
  - Normalize wallet cancellation and provider errors.

- `apps/web/test/app.test.mjs`
  - Update the existing claim button expectation.
  - Add DOM tests for connected wallet copy, connect-before-nonce, modal cancel, missing config, no EVM wallet, missing `personal_sign`, and API unauthorized guidance.

---

## Chunk 1: Wallet Client Boundary and Vanilla Claim Flow

### Task 1: Add framework-free wallet client tests

**Files:**
- Create: `apps/web/test/wallet-client.test.mjs`
- Create later in Task 2: `apps/web/src/wallet-client.js`

- [ ] **Step 1: Write failing wallet-client unit tests**

Create `apps/web/test/wallet-client.test.mjs` with tests like:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInjectedWalletClient,
  createLegacyWalletClient,
  getWalletErrorMessage,
  shortenAddress,
} from '../src/wallet-client.js';

test('shortenAddress formats EVM addresses for claim UI', () => {
  assert.equal(shortenAddress('0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea'), '0x27E3...91Ea');
  assert.equal(shortenAddress(null), null);
});

test('legacy wallet client wraps existing walletSigner callback', async () => {
  const calls = [];
  const client = createLegacyWalletClient(async (message) => {
    calls.push(message);
    return { wallet: '0xabc', signature: '0xsig' };
  });

  assert.deepEqual(client.getSnapshot(), {
    ready: true,
    configured: true,
    connected: true,
    address: null,
    label: null,
    connectLabel: 'Sign owner claim',
  });
  assert.deepEqual(await client.signMessage('hello'), { wallet: '0xabc', signature: '0xsig' });
  assert.deepEqual(calls, ['hello']);
});

test('injected wallet client connects before personal_sign', async () => {
  const requests = [];
  const ethereum = {
    request: async (request) => {
      requests.push(request);
      if (request.method === 'eth_requestAccounts') return ['0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea'];
      if (request.method === 'personal_sign') return '0xsig';
      throw new Error(`Unexpected ${request.method}`);
    },
  };
  const client = createInjectedWalletClient({ getWindow: () => ({ ethereum }) });

  await client.connect();
  assert.equal(client.getSnapshot().connected, true);
  assert.equal(client.getSnapshot().label, '0x27E3...91Ea');
  assert.deepEqual(await client.signMessage('Sign Bendr claim'), {
    wallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
    signature: '0xsig',
  });
  assert.deepEqual(requests, [
    { method: 'eth_requestAccounts' },
    { method: 'personal_sign', params: ['Sign Bendr claim', '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea'] },
  ]);
});

test('wallet error normalization treats user rejection as safe cancellation', () => {
  assert.equal(getWalletErrorMessage({ code: 4001 }), 'Wallet signature cancelled. Nothing was changed.');
  assert.equal(getWalletErrorMessage(new Error('User rejected the request')), 'Wallet signature cancelled. Nothing was changed.');
  assert.equal(getWalletErrorMessage(new Error('no personal_sign support')), 'no personal_sign support');
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
cd /home/ubuntu/.config/superpowers/worktrees/multipass/multipass-privy-wallet-integration
pnpm exec node --test apps/web/test/wallet-client.test.mjs
```

Expected: FAIL with module-not-found for `../src/wallet-client.js`.

### Task 2: Implement framework-free wallet client

**Files:**
- Create: `apps/web/src/wallet-client.js`
- Test: `apps/web/test/wallet-client.test.mjs`

- [ ] **Step 1: Add minimal wallet-client implementation**

Create `apps/web/src/wallet-client.js`:

```js
export function shortenAddress(address) {
  if (!address) return null;
  const text = String(address);
  if (text.length <= 12) return text;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

export function defaultWalletSnapshot(overrides = {}) {
  return {
    ready: true,
    configured: true,
    connected: false,
    address: null,
    label: null,
    connectLabel: 'Connect wallet to claim',
    ...overrides,
  };
}

export function getWalletErrorMessage(error) {
  const code = error?.code;
  const message = [error?.message, error?.shortMessage, error?.reason, error?.info?.error?.message]
    .filter(Boolean)
    .join(' ');
  const lower = message.toLowerCase();
  if (code === 4001 || code === 'ACTION_REJECTED' || lower.includes('user rejected') || lower.includes('rejected the request')) {
    return 'Wallet signature cancelled. Nothing was changed.';
  }
  return message || 'Wallet connection failed. Nothing was changed.';
}

export function createLegacyWalletClient(walletSigner) {
  return {
    getSnapshot: () => defaultWalletSnapshot({
      connected: true,
      connectLabel: 'Sign owner claim',
    }),
    subscribe: () => () => {},
    connect: async () => {},
    signMessage: walletSigner,
  };
}

export function createInjectedWalletClient({ getWindow = () => globalThis.window } = {}) {
  let address = null;
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());
  const getEthereum = () => getWindow()?.ethereum;

  async function connect() {
    const ethereum = getEthereum();
    if (!ethereum?.request) throw new Error('Connect an Ethereum wallet to sign the owner claim.');
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    address = accounts?.[0] ?? null;
    notify();
    if (!address) throw new Error('Wallet connection did not return an account.');
  }

  return {
    getSnapshot: () => defaultWalletSnapshot({
      connected: Boolean(address),
      address,
      label: shortenAddress(address),
      connectLabel: address ? `Sign owner claim with ${shortenAddress(address)}` : 'Connect wallet to claim',
    }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    connect,
    signMessage: async (message) => {
      if (!address) await connect();
      const ethereum = getEthereum();
      if (!ethereum?.request) throw new Error('Connected wallet cannot sign messages.');
      const signature = await ethereum.request({ method: 'personal_sign', params: [message, address] });
      return { wallet: address, signature };
    },
  };
}
```

- [ ] **Step 2: Run wallet-client tests**

Run:

```bash
pnpm exec node --test apps/web/test/wallet-client.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Commit wallet client boundary**

Run:

```bash
git add apps/web/src/wallet-client.js apps/web/test/wallet-client.test.mjs
git commit -m "Add Multipass wallet client boundary"
```

Expected: commit created.

### Task 3: Add wallet-aware app tests

**Files:**
- Modify: `apps/web/test/app.test.mjs`
- Modify later in Task 4: `apps/web/src/app.js`

- [ ] **Step 1: Update existing claim button expectation**

In `direct saved slug route renders display-only claim management panel`, change:

```js
assert.equal(panel.querySelector('[data-action="claim-with-wallet"]')?.textContent, 'Sign owner claim');
```

to:

```js
assert.equal(panel.querySelector('[data-action="claim-with-wallet"]')?.textContent, 'Connect wallet to claim');
```

- [ ] **Step 2: Extract saved-profile test helpers**

Near the existing saved-profile claim tests, add reusable helpers so the new edge-case tests are not copy-paste heavy:

```js
async function savedProfileFetch(url) {
  if (String(url).endsWith('/api/multipass/bendr-2-1')) {
    return new Response(JSON.stringify({
      ...sampleData().profile,
      display_name: 'Saved Bendr',
      slug: 'bendr-2-1',
      multipass_id: 'mp_helixa_agent_1',
      status: 'active',
      owner_summary: {
        owner_state: 'unclaimed',
        verification_status: 'unclaimed',
        summary: 'Saved display-only profile. Management is unclaimed.',
      },
    }), { status: 200 });
  }
  if (String(url).endsWith('/fragments')) return new Response(JSON.stringify({ multipass_id: 'mp_helixa_agent_1', fragments: [] }), { status: 200 });
  if (String(url).endsWith('/card') || String(url).endsWith('/agent-card')) return new Response(JSON.stringify({ ...sampleData().card, multipass_id: 'mp_helixa_agent_1', name: 'Saved Bendr' }), { status: 200 });
  if (String(url).endsWith('/standards')) return new Response(JSON.stringify(sampleData().standards), { status: 200 });
  if (String(url).endsWith('/x402')) return new Response(JSON.stringify(sampleData().x402), { status: 200 });
  if (String(url).endsWith('/changes')) return new Response(JSON.stringify({ multipass_id: 'mp_helixa_agent_1', entries: [] }), { status: 200 });
  throw new Error(`Unexpected URL ${url}`);
}

function createWalletClientFixture({ snapshot, connect, signMessage } = {}) {
  let currentSnapshot = snapshot ?? { ready: true, configured: true, connected: false, address: null, label: null, connectLabel: 'Connect wallet to claim' };
  const client = {
    getSnapshot: () => currentSnapshot,
    setSnapshot: (next) => { currentSnapshot = { ...currentSnapshot, ...next }; },
    subscribe: () => () => {},
    connect: connect ?? (async () => {}),
    signMessage: signMessage ?? (async () => ({ wallet: currentSnapshot.address, signature: '0xsig' })),
  };
  return client;
}

function createSavedMultipassError({ status = 403, code = 'forbidden', message = 'Wallet is not eligible to manage this Multipass record.' } = {}) {
  const error = new Error(message);
  error.name = 'SavedMultipassError';
  error.details = { status, body: { error: { code, message } } };
  return error;
}
```

- [ ] **Step 3: Add connected-wallet DOM copy test**

Append:

```js
test('claim button renders connected wallet shortened address', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const walletClient = createWalletClientFixture({
    snapshot: {
      ready: true,
      configured: true,
      connected: true,
      address: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
      label: '0x27E3...91Ea',
      connectLabel: 'Sign owner claim with 0x27E3...91Ea',
    },
  });

  await createApp({ root, walletClient, fetchImpl: savedProfileFetch }).start();

  assert.equal(root.querySelector('[data-action="claim-with-wallet"]')?.textContent, 'Sign owner claim with 0x27E3...91Ea');
});
```

- [ ] **Step 4: Add connect-before-nonce test**

Append:

```js
test('saved profile claim connects wallet before creating nonce', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const calls = [];
  const walletClient = createWalletClientFixture({
    connect: async () => {
      calls.push(['connect']);
      walletClient.setSnapshot({
        connected: true,
        address: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea',
        label: '0x27E3...91Ea',
        connectLabel: 'Sign owner claim with 0x27E3...91Ea',
      });
    },
    signMessage: async (message) => {
      calls.push(['sign', message]);
      return { wallet: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', signature: '0xsig' };
    },
  });
  const claimApi = {
    createClaimNonce: async () => { calls.push(['nonce']); return { nonce: 'nonce-1', message: 'Sign Bendr claim' }; },
    verifyClaimSignature: async () => ({ claim_status: 'claimed_verified_owner', csrfToken: 'csrf-1', profile: { ...sampleData().profile, slug: 'bendr-2-1' } }),
  };

  await createApp({ root, claimApi, walletClient, fetchImpl: savedProfileFetch }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls.slice(0, 3), [['connect'], ['nonce'], ['sign', 'Sign Bendr claim']]);
});
```

- [ ] **Step 5: Add wallet cancellation/no-wallet/config/provider tests**

Append:

```js
test('wallet modal cancellation does not create a claim nonce', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const calls = [];
  const walletClient = createWalletClientFixture({
    connect: async () => { calls.push(['connect']); throw { code: 4001 }; },
  });
  const claimApi = {
    createClaimNonce: async () => { calls.push(['nonce']); return { nonce: 'nonce-1', message: 'Sign Bendr claim' }; },
  };

  await createApp({ root, claimApi, walletClient, fetchImpl: savedProfileFetch }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls, [['connect']]);
  assert.match(root.querySelector('.claim-management-panel').textContent, /Wallet signature cancelled\. Nothing was changed\./);
});

test('claim button is disabled when wallet login is not configured', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const walletClient = createWalletClientFixture({
    snapshot: { ready: true, configured: false, connected: false, address: null, label: null, connectLabel: 'Wallet login not configured' },
  });

  await createApp({ root, walletClient, fetchImpl: savedProfileFetch }).start();

  const button = root.querySelector('[data-action="claim-with-wallet"]');
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, 'Wallet login not configured');
  assert.match(root.querySelector('.claim-management-panel').textContent, /Wallet login is not configured for this build\./);
});

test('claim flow stops when connect returns no EVM wallet', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const calls = [];
  const walletClient = createWalletClientFixture({
    connect: async () => { calls.push(['connect']); },
  });
  const claimApi = {
    createClaimNonce: async () => { calls.push(['nonce']); return { nonce: 'nonce-1', message: 'Sign Bendr claim' }; },
  };

  await createApp({ root, claimApi, walletClient, fetchImpl: savedProfileFetch }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls, [['connect']]);
  assert.match(root.querySelector('.claim-management-panel').textContent, /Connect an Ethereum wallet to sign the owner claim\./);
});

test('claim flow handles missing personal_sign support before verify', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const calls = [];
  const walletClient = createWalletClientFixture({
    snapshot: { ready: true, configured: true, connected: true, address: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea', label: '0x27E3...91Ea', connectLabel: 'Sign owner claim with 0x27E3...91Ea' },
    signMessage: async () => { calls.push(['sign']); throw new Error('Connected wallet cannot sign messages.'); },
  });
  const claimApi = {
    createClaimNonce: async () => { calls.push(['nonce']); return { nonce: 'nonce-1', message: 'Sign Bendr claim' }; },
    verifyClaimSignature: async () => { calls.push(['verify']); },
  };

  await createApp({ root, claimApi, walletClient, fetchImpl: savedProfileFetch }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls, [['nonce'], ['sign']]);
  assert.match(root.querySelector('.claim-management-panel').textContent, /Connected wallet cannot sign messages\./);
});

test('API unauthorized claim shows wrong-wallet manual-review guidance', async () => {
  const root = setupDom('https://helixa.xyz/multipass/bendr-2-1?api=https://api.example.test');
  const walletClient = createWalletClientFixture({
    snapshot: { ready: true, configured: true, connected: true, address: '0x0000000000000000000000000000000000000001', label: '0x0000...0001', connectLabel: 'Sign owner claim with 0x0000...0001' },
    signMessage: async () => ({ wallet: '0x0000000000000000000000000000000000000001', signature: '0xsig' }),
  });
  const claimApi = {
    createClaimNonce: async () => ({ nonce: 'nonce-1', message: 'Sign Bendr claim' }),
    verifyClaimSignature: async () => { throw createSavedMultipassError(); },
  };

  await createApp({ root, claimApi, walletClient, fetchImpl: savedProfileFetch }).start();
  root.querySelector('[data-action="claim-with-wallet"]').click();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.match(root.querySelector('.claim-management-panel').textContent, /That wallet cannot manage this Multipass\. Connect the source owner wallet or request manual review\./);
});
```

Use exact copy from the spec:

- `Wallet login is not configured for this build.`
- `Wallet signature cancelled. Nothing was changed.`
- `Connect an Ethereum wallet to sign the owner claim.`
- `Connected wallet cannot sign messages.`
- `That wallet cannot manage this Multipass. Connect the source owner wallet or request manual review.`

- [ ] **Step 6: Run app tests to verify failures**

Run:

```bash
pnpm exec node --test apps/web/test/app.test.mjs
```

Expected: FAIL because `createApp` does not yet accept/render `walletClient` behavior.

### Task 4: Implement wallet-aware claim flow in app.js

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/test/app.test.mjs`
- Test: `apps/web/test/app.test.mjs`, `apps/web/test/wallet-client.test.mjs`

- [ ] **Step 1: Import wallet client helpers**

At the top of `apps/web/src/app.js`, add:

```js
import { createInjectedWalletClient, createLegacyWalletClient, getWalletErrorMessage } from './wallet-client.js';
```

- [ ] **Step 2: Update `createApp` options**

Change the function signature to accept `walletClient` while preserving `walletSigner`:

```js
export function createApp({
  root,
  loadDemo,
  loadLiveDemo = loadLiveHelixaMultipass,
  saveMultipass = defaultSaveMultipass,
  claimApi = defaultClaimApi,
  walletClient,
  walletSigner,
  fetchImpl,
} = {}) {
```

Inside `createApp`, create the active wallet client:

```js
const activeWalletClient = walletClient
  ?? (walletSigner ? createLegacyWalletClient(walletSigner) : createInjectedWalletClient());
```

- [ ] **Step 3: Store and refresh wallet snapshot**

Add to initial state:

```js
walletSnapshot: activeWalletClient.getSnapshot(),
```

In `start()`, subscribe before loading data:

```js
const unsubscribeWallet = activeWalletClient.subscribe?.(() => {
  state = { ...state, walletSnapshot: activeWalletClient.getSnapshot() };
  if (state.data) render(root, state, handlers);
});
```

If the app later grows a stop/destroy method, return `unsubscribeWallet`; for this change it is acceptable to keep the current one-shot app lifecycle.

- [ ] **Step 4: Connect before nonce in `claimWithWallet`**

Replace direct `walletSigner(nonce.message)` usage with:

```js
const snapshot = activeWalletClient.getSnapshot();
if (snapshot.configured === false) throw new Error('Wallet login is not configured for this build.');
if (snapshot.ready === false) throw new Error('Wallet options are still loading.');
if (!snapshot.connected) await activeWalletClient.connect();
const connectedSnapshot = activeWalletClient.getSnapshot();
state = { ...state, walletSnapshot: connectedSnapshot };
if (!connectedSnapshot.connected) throw new Error('Connect an Ethereum wallet to sign the owner claim.');
const nonce = await claimApi.createClaimNonce({ id, apiBase, fetchImpl });
const signed = await activeWalletClient.signMessage(nonce.message);
```

Add an explicit API error classifier near `claimWithWallet`:

```js
function isWrongWalletClaimError(error) {
  const status = error?.details?.status;
  const apiError = error?.details?.body?.error ?? {};
  const message = String(apiError.message ?? error?.message ?? '');
  return error?.name === 'SavedMultipassError'
    && [401, 403].includes(status)
    && ['forbidden', 'unauthorized'].includes(apiError.code)
    && /not eligible to manage this Multipass record/i.test(message);
}
```

Wrap wallet errors through `getWalletErrorMessage(error)`. For the API wrong-wallet shape above, map to:

```js
'That wallet cannot manage this Multipass. Connect the source owner wallet or request manual review.'
```

Do not map unrelated `invalid_request`, bad-signature, expired nonce, or network failures to wrong-wallet copy.

- [ ] **Step 5: Render wallet-aware claim copy**

Add helper near `renderClaimManagementPanel`:

```js
function getClaimButtonLabel(state) {
  if (state.claimStatus === 'signing') return 'Waiting for signature...';
  const snapshot = state.walletSnapshot ?? {};
  if (snapshot.configured === false) return 'Wallet login not configured';
  if (snapshot.ready === false) return 'Loading wallet options...';
  return snapshot.connectLabel ?? (snapshot.connected && snapshot.label ? `Sign owner claim with ${snapshot.label}` : 'Connect wallet to claim');
}
```

Use it in the button and disable when signing or unconfigured:

```html
<button type="button" data-action="claim-with-wallet" ${state.claimStatus === 'signing' || state.walletSnapshot?.configured === false ? 'disabled' : ''}>${escapeHtml(getClaimButtonLabel(state))}</button>
```

If `configured === false`, render `Wallet login is not configured for this build.` in the panel.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm exec node --test apps/web/test/wallet-client.test.mjs apps/web/test/app.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Run full test suite**

Run:

```bash
pnpm test
```

Expected: PASS with existing plus new tests.

- [ ] **Step 8: Commit app wallet flow**

Run:

```bash
git add apps/web/src/app.js apps/web/src/wallet-client.js apps/web/test/app.test.mjs apps/web/test/wallet-client.test.mjs
git commit -m "Wire Multipass claim flow to wallet client"
```

Expected: commit created.

---

## Chunk 2: Privy Bridge and Production Entry Point

### Task 5: Add Privy and React dependencies

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add web runtime dependencies**

Run:

```bash
cd /home/ubuntu/.config/superpowers/worktrees/multipass/multipass-privy-wallet-integration
pnpm --filter @helixa/multipass-web add @privy-io/react-auth react react-dom viem
```

Expected: package and lockfile update. Do not add wagmi or TanStack Query; Multipass only needs Privy wallet connection/signing.

- [ ] **Step 2: Verify package change**

Run:

```bash
node -e "const p=require('./apps/web/package.json'); console.log(p.dependencies)"
```

Expected dependencies include `@privy-io/react-auth`, `react`, `react-dom`, `viem`.

### Task 6: Add Privy wallet bridge tests

**Files:**
- Create: `apps/web/test/privy-wallet-client.test.mjs`
- Create later in Task 7: `apps/web/src/privy-wallet-client.js`

- [ ] **Step 1: Write failing Privy bridge helper tests**

Create `apps/web/test/privy-wallet-client.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { createPrivyWalletClient, selectEvmWallet } from '../src/privy-wallet-client.js';

test('selectEvmWallet prefers wallets with EVM provider and address', () => {
  const wallets = [
    { address: null, getEthereumProvider: async () => ({}) },
    { address: '0xabc', getSolanaProvider: async () => ({}) },
    { address: '0xdef', connectedAt: 100, getEthereumProvider: async () => ({ request: async () => '0xsig' }) },
  ];
  assert.equal(selectEvmWallet(wallets), wallets[2]);
});

test('selectEvmWallet prefers the most recently connected EVM wallet', () => {
  const older = { address: '0x111', connectedAt: 100, getEthereumProvider: async () => ({ request: async () => '0xsig1' }) };
  const newer = { address: '0x222', connectedAt: 200, getEthereumProvider: async () => ({ request: async () => '0xsig2' }) };
  assert.equal(selectEvmWallet([older, newer]), newer);
});

test('Privy wallet client publishes snapshot updates to subscribers', () => {
  const client = createPrivyWalletClient();
  let calls = 0;
  const unsubscribe = client.subscribe(() => { calls += 1; });
  client.setSnapshot({ ready: true, configured: true, connected: true, address: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea' });
  assert.equal(calls, 1);
  assert.equal(client.getSnapshot().label, '0x27E3...91Ea');
  unsubscribe();
  client.setSnapshot({ connected: false, address: null });
  assert.equal(calls, 1);
});

test('Privy wallet client delegates connect and sign actions', async () => {
  const client = createPrivyWalletClient();
  const calls = [];
  client.setActions({
    connect: async () => { calls.push(['connect']); },
    signMessage: async (message) => { calls.push(['sign', message]); return { wallet: '0xabc', signature: '0xsig' }; },
  });
  await client.connect();
  assert.deepEqual(await client.signMessage('hello'), { wallet: '0xabc', signature: '0xsig' });
  assert.deepEqual(calls, [['connect'], ['sign', 'hello']]);
});

test('Privy wallet client waitForConnection resolves after a connected snapshot', async () => {
  const client = createPrivyWalletClient();
  const wait = client.waitForConnection({ timeoutMs: 100 });
  client.setSnapshot({ ready: true, configured: true, connected: true, address: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea' });
  assert.equal(await wait, '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec node --test apps/web/test/privy-wallet-client.test.mjs
```

Expected: FAIL with module-not-found for `../src/privy-wallet-client.js`.

### Task 7: Implement Privy wallet bridge

**Files:**
- Create: `apps/web/src/privy-wallet-client.js`
- Test: `apps/web/test/privy-wallet-client.test.mjs`

- [ ] **Step 1: Add pure client and selection helpers**

Create `apps/web/src/privy-wallet-client.js` with this shape:

```js
import React, { useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { defaultWalletSnapshot, shortenAddress } from './wallet-client.js';

export function selectEvmWallet(wallets = []) {
  const candidates = wallets.filter((wallet) => wallet?.address && typeof wallet.getEthereumProvider === 'function');
  return candidates.sort((left, right) => Number(right.connectedAt ?? 0) - Number(left.connectedAt ?? 0))[0] ?? null;
}

export function createPrivyWalletClient() {
  let snapshot = defaultWalletSnapshot({ ready: false, configured: false, connectLabel: 'Loading wallet options...' });
  let actions = {
    connect: async () => { throw new Error('Wallet options are still loading.'); },
    signMessage: async () => { throw new Error('Wallet options are still loading.'); },
  };
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());

  function waitForConnection({ timeoutMs = 15000 } = {}) {
    if (snapshot.connected && snapshot.address) return Promise.resolve(snapshot.address);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error('Connect an Ethereum wallet to sign the owner claim.'));
      }, timeoutMs);
      const unsubscribe = client.subscribe(() => {
        const next = client.getSnapshot();
        if (next.connected && next.address) {
          clearTimeout(timeout);
          unsubscribe();
          resolve(next.address);
        }
      });
    });
  }

  const client = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    connect: () => actions.connect(),
    signMessage: (message) => actions.signMessage(message),
    waitForConnection,
    setSnapshot: (next) => {
      const address = next.address ?? null;
      snapshot = defaultWalletSnapshot({
        ...snapshot,
        ...next,
        address,
        label: shortenAddress(address),
        connectLabel: address ? `Sign owner claim with ${shortenAddress(address)}` : (next.connectLabel ?? 'Connect wallet to claim'),
      });
      notify();
    },
    setActions: (nextActions) => {
      actions = { ...actions, ...nextActions };
    },
  };
  return client;
}
```

- [ ] **Step 2: Add `PrivyWalletBridge` component**

In the same file, add:

```js
export function PrivyWalletBridge({ client, configured }) {
  const { ready, connectWallet } = usePrivy();
  const { wallets } = useWallets();
  const wallet = selectEvmWallet(wallets);

  useEffect(() => {
    client.setSnapshot({
      ready: Boolean(ready),
      configured: Boolean(configured),
      connected: Boolean(wallet),
      address: wallet?.address ?? null,
      connectLabel: wallet?.address ? `Sign owner claim with ${shortenAddress(wallet.address)}` : 'Connect wallet to claim',
    });
  }, [client, configured, ready, wallet?.address]);

  useEffect(() => {
    client.setActions({
      connect: async () => {
        if (!configured) throw new Error('Wallet login is not configured for this build.');
        await connectWallet({ description: 'Connect the wallet that manages this Multipass public profile.' });
        await client.waitForConnection({ timeoutMs: 15000 });
      },
      signMessage: async (message) => {
        const activeWallet = selectEvmWallet(wallets);
        if (!activeWallet) throw new Error('Connect an Ethereum wallet to sign the owner claim.');
        const provider = await activeWallet.getEthereumProvider();
        if (!provider?.request) throw new Error('Connected wallet cannot sign messages.');
        const signature = await provider.request({ method: 'personal_sign', params: [message, activeWallet.address] });
        return { wallet: activeWallet.address, signature };
      },
    });
  }, [client, configured, connectWallet, wallets]);

  return null;
}
```

If the installed Privy version exposes `connectWallet` through `useConnectWallet` instead of `usePrivy`, adjust this file only; keep the `createApp` wallet-client interface unchanged.

- [ ] **Step 3: Run Privy bridge tests**

Run:

```bash
pnpm exec node --test apps/web/test/privy-wallet-client.test.mjs
```

Expected: PASS.

### Task 8: Mount Privy bridge in the production entry point

**Files:**
- Modify: `apps/web/index.html`
- Modify: `apps/web/src/main.js`
- Test: `apps/web/test/privy-wallet-client.test.mjs`, build command

- [ ] **Step 1: Add wallet root to HTML**

In `apps/web/index.html`, add the wallet bridge root beside the existing app root:

```html
<div id="wallet-root"></div>
<main id="app"></main>
```

Do not remove or semantically downgrade the existing `#app` element. If it is already `<main id="app">`, keep it as `<main>` and only add `#wallet-root` beside it.

- [ ] **Step 2: Mount Privy beside the vanilla app**

Replace `apps/web/src/main.js` with this shape:

```js
import './styles.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import { base } from 'viem/chains';

import { createApp } from './app.js';
import { createPrivyWalletClient, PrivyWalletBridge } from './privy-wallet-client.js';

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;
const appRoot = document.querySelector('#app');
const walletRoot = document.querySelector('#wallet-root');
const walletClient = createPrivyWalletClient();

if (walletRoot && PRIVY_APP_ID) {
  createRoot(walletRoot).render(
    React.createElement(PrivyProvider, {
      appId: PRIVY_APP_ID,
      config: {
        appearance: {
          theme: 'dark',
          accentColor: '#6eecd8',
          logo: 'https://helixa.xyz/helixa-logo.jpg',
        },
        loginMethods: ['wallet'],
        appearance: {
          walletChainType: 'ethereum-only',
        },
        defaultChain: base,
        supportedChains: [base],
      },
    }, React.createElement(PrivyWalletBridge, { client: walletClient, configured: true })),
  );
} else {
  walletClient.setSnapshot({
    ready: true,
    configured: false,
    connected: false,
    address: null,
    connectLabel: 'Wallet login not configured',
  });
}

createApp({ root: appRoot, walletClient }).start();
```

Note: `loginMethods: ['wallet']` keeps Multipass claim focused on wallet proof. Do not use Privy email/social as Multipass authorization.

- [ ] **Step 3: Run focused tests**

Run:

```bash
pnpm exec node --test apps/web/test/wallet-client.test.mjs apps/web/test/privy-wallet-client.test.mjs apps/web/test/app.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Run web build**

Run:

```bash
MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build
```

Expected: Vite build succeeds and outputs `apps/web/dist` assets.

- [ ] **Step 5: Commit Privy bridge**

Run:

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/index.html apps/web/src/main.js apps/web/src/privy-wallet-client.js apps/web/test/privy-wallet-client.test.mjs
git commit -m "Add Privy wallet bridge to Multipass web"
```

Expected: commit created.

---

## Chunk 3: Full Verification, Guardrails, and Handoff

### Task 9: Run full local verification

**Files:**
- No code changes expected unless a verification failure exposes a bug.

- [ ] **Step 1: Run full test suite**

Run:

```bash
cd /home/ubuntu/.config/superpowers/worktrees/multipass/multipass-privy-wallet-integration
pnpm test
```

Expected: all tests pass. Record final pass/fail count in the implementation notes.

- [ ] **Step 2: Run production web build**

Run:

```bash
cd /home/ubuntu/.config/superpowers/worktrees/multipass/multipass-privy-wallet-integration
MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build
```

Expected: build succeeds.

- [ ] **Step 3: Run forbidden-overclaim scan**

Run:

```bash
forbidden='custody transfer|asset transfer|transfer assets|tool transfer|transfer tools|secret transfer|transfer secrets|permission grant|transfer ownership|ownership transfer|grant permissions|move secrets|credential transfer|transfer credentials|credentials transferred|credential release|current NFT binding|live NFT binding|currently bound NFT|binds this NFT|NFT is bound|bound to this identity'
if grep -RInE "$forbidden" apps/web/src apps/web/index.html apps/web/test 2>/dev/null; then
  echo "violations_found=1"
  exit 1
else
  echo "violations_found=0"
fi
```

Expected: `violations_found=0`. If this catches legitimate safety-denial copy, narrow the scan to user-facing implementation copy, document the exact exception, and run a second manual grep for transfer/binding/credential claims before proceeding.

- [ ] **Step 4: Inspect git diff**

Run:

```bash
git diff --stat 7888a35..HEAD
git diff 7888a35..HEAD -- apps/web/src/app.js apps/web/src/wallet-client.js apps/web/src/privy-wallet-client.js apps/web/src/main.js apps/web/index.html apps/web/package.json apps/web/test/app.test.mjs apps/web/test/wallet-client.test.mjs apps/web/test/privy-wallet-client.test.mjs pnpm-lock.yaml
```

Expected: all implementation commits since the approved spec baseline are visible, and changes are limited to wallet client, Privy bridge, entry point, tests, package files, and lockfile updates.

### Task 10: Optional manual smoke before merge/deploy

**Files:**
- No code changes expected.

- [ ] **Step 1: Start local web/API if needed**

Run in one terminal/session:

```bash
pnpm --filter @helixa/multipass-api start --fixture bendr
```

Run in another terminal/session:

```bash
MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web dev
```

Expected: API and web dev servers start.

- [ ] **Step 2: Browser smoke paths**

Open:

```text
http://127.0.0.1:5173/multipass/bendr-2-1
```

Verify:

- Claim panel shows `Connect wallet to claim` before connection.
- Privy wallet modal opens.
- Desktop injected wallet path can connect.
- Telegram in-app browser path reaches the Privy wallet modal on the deployed or tunneled URL.
- Mobile WalletConnect/deep-link path opens a mobile wallet such as Coinbase Wallet or MetaMask.
- Wrong wallet shows manual-review guidance.
- Signature cancellation shows `Wallet signature cancelled. Nothing was changed.`
- If a valid owner wallet is available, successful signature creates the manager edit form.

If Telegram/mobile WalletConnect smoke cannot be run because no mobile device, tunnel, or production preview is available, document it explicitly as `not run` with the blocker. Do not claim Telegram/mobile support was manually verified unless this path was actually checked. If no valid owner wallet is locally available, do not fake success in the browser smoke. Rely on automated API/signature tests for the owner-verified path.

### Task 11: Final review request

**Files:**
- No code changes expected unless review finds issues.

- [ ] **Step 1: Request code review**

Use @superpowers:requesting-code-review after implementation and verification. Ask reviewers to focus on:

- Privy bridge does not authorize edits by itself.
- Claim nonce is created only after wallet connection.
- Wrong-wallet and cancellation states do not create sessions.
- No localStorage auth was added.
- UI copy does not imply transfer of custody, assets, tools, secrets, permissions, credentials, ownership, or current NFT binding.

- [ ] **Step 2: Fix review findings or document non-blocking notes**

If issues are found, fix them with tests and rerun focused/full verification.

- [ ] **Step 3: Final implementation commit if needed**

If review fixes changed files, commit:

```bash
git status --short
# If review fixes touched only expected implementation files, stage those exact files explicitly, for example:
git add apps/web/src/app.js apps/web/src/wallet-client.js apps/web/src/privy-wallet-client.js apps/web/src/main.js apps/web/index.html apps/web/test/app.test.mjs apps/web/test/wallet-client.test.mjs apps/web/test/privy-wallet-client.test.mjs apps/web/package.json pnpm-lock.yaml
git commit -m "Harden Privy wallet claim flow"
```

Expected: clean feature branch with reviewed commits. Before staging, compare `git status --short` against the explicit file list above. If review fixes touched a different file, inspect it and either add that exact path intentionally or stop and explain why it changed. Do not stage unrelated files.

### Task 12: Completion handoff

**Files:**
- No code changes expected.

- [ ] **Step 1: Confirm final status**

Run:

```bash
git status --short --branch
git log --oneline -5
```

Expected: branch `multipass-privy-wallet-integration`; no uncommitted changes unless intentionally left for review.

- [ ] **Step 2: Report verification evidence**

Final user update must include:

- Worktree path.
- Branch name.
- Commits created.
- `pnpm test` final pass count.
- `MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build` result.
- Whether manual browser smoke was run or skipped and why.
- Explicit note that deployment/merge has not happened unless the user separately approves it.
