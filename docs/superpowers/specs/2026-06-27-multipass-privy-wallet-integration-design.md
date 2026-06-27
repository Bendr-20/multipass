# Multipass Privy Wallet Integration Design

## Summary

Multipass should use Privy as its wallet connection layer. WalletConnect support should come through Privy's wallet modal rather than a separate Reown/WalletConnect integration. The server-side claim proof model from A2 stays unchanged: the API creates a nonce, the connected wallet signs the exact claim message, and the API verifies that signature against the source owner or approved manager wallet before issuing the HTTP-only manager session.

This fixes the current Telegram/mobile gap without creating a second wallet stack next to Helixa's existing Privy setup.

## Current State

- Live Multipass web is in `/home/ubuntu/multipass/apps/web`.
- The web app is currently a Vite/vanilla ESM app.
- `apps/web/src/app.js` exposes `createApp({ ..., walletSigner = defaultWalletSigner })`.
- `defaultWalletSigner(message)` only reads `window.ethereum`, calls `eth_requestAccounts`, then calls `personal_sign`.
- This works in injected-wallet browsers, but fails in Telegram's in-app browser where `window.ethereum` is absent.
- A2 backend claim/session security is already server-side and should remain the source of truth.
- Helixa's main frontend already uses Privy with `@privy-io/react-auth`, `VITE_PRIVY_APP_ID`, `usePrivy`, `useWallets`, and `wallet.getEthereumProvider()`.

## Goals

1. Let Telegram and mobile users connect a wallet through Privy, including WalletConnect/mobile wallet routes.
2. Keep the existing Multipass claim API and owner-proof semantics.
3. Preserve server-side manager authorization: no localStorage auth token, no Privy-only authorization, no client-side trust shortcut.
4. Keep the user flow understandable:
   - connect wallet
   - sign owner claim
   - edit safe public Multipass fields after server verification
5. Reuse Helixa's normal wallet provider style instead of maintaining a separate wallet stack.

## Non-Goals

- No raw Reown/WalletConnect implementation unless Privy cannot satisfy the mobile flow.
- No custody transfer, asset transfer, tool transfer, secret transfer, permission grant, or live NFT binding.
- No claim approval based on Privy email, social login, or Privy access token.
- No localStorage manager auth.
- No backend rewrite of the A2 claim/session model.
- No full A3 owner dashboard redesign in this change.

## Options Considered

### Option A - Privy React wallet island inside Multipass web

Add a small React wrapper around the existing vanilla Multipass app. The wrapper mounts `PrivyProvider`, reads wallet state with Privy hooks, and passes a stable wallet client into `createApp`.

Pros:
- Reuses the Helixa wallet provider pattern.
- Gets WalletConnect/mobile wallet support through Privy.
- Leaves most Multipass rendering, tests, and API code intact.
- Keeps claim verification on the API.

Cons:
- Adds React and Privy dependencies to a currently vanilla web package.
- Requires a small bridge between React wallet hooks and the existing vanilla app state.

### Option B - Direct Reown/WalletConnect integration

Install a WalletConnect/Reown client directly and add custom QR/deep-link handling.

Pros:
- Avoids adding React just for wallet UI.
- Direct control over the wallet modal.

Cons:
- Creates a second wallet/auth stack while Helixa already standardizes on Privy.
- Requires separate project ID/config, more maintenance, more mobile edge cases.
- More ways to accidentally diverge from Helixa account behavior.

### Option C - Redirect to Helixa frontend for claiming

Keep Multipass display-only and send claim actions to an existing Helixa Privy app route.

Pros:
- Maximum reuse of existing Privy infrastructure.
- Avoids adding React to Multipass.

Cons:
- Splits the product flow across apps.
- More routing, callback, and share URL complexity.
- Makes the Multipass page feel broken when the user wants to claim in place.

## Recommendation

Use Option A.

Privy should own wallet connection. Multipass should own claim intent and public profile management. The API should remain the trust boundary.

## Architecture

### New wallet client boundary

Add a small wallet-client abstraction consumed by `createApp`:

```js
{
  getSnapshot(): {
    ready: boolean,
    connected: boolean,
    address: string | null,
    label: string | null,
    connectLabel: string,
  },
  subscribe(listener): () => void,
  connect(): Promise<void>,
  signMessage(message: string): Promise<{ wallet: string, signature: string }>,
}
```

`createApp` should not import Privy directly. It should only know this wallet-client boundary.

### Default wallet client

Keep an injected-wallet fallback for tests and local browser use. It can wrap the current `window.ethereum` behavior behind the same wallet-client interface.

### Privy wallet client

Add a React wrapper, likely `apps/web/src/main.jsx`, that:

1. Mounts `PrivyProvider` with the Helixa Privy app ID from `VITE_PRIVY_APP_ID`.
2. Uses a dark theme, Helixa accent color, Base as the default chain, and EVM wallet connection.
3. Uses Privy's `connectWallet` flow for external wallets. Privy docs state EVM external wallet connectors need no extra connector configuration.
4. Reads connected EVM wallets from `useWallets()`.
5. Selects the active wallet, preferring the most recent connected EVM wallet and falling back to the first EVM wallet.
6. Calls `wallet.getEthereumProvider()` and requests `personal_sign` using the selected wallet address.
7. Publishes wallet state to the vanilla app through a stable client object and subscription callbacks.

The implementation should avoid using Privy access tokens for Multipass manager authorization. Privy is a wallet connector here, not the proof authority.

## Claim Flow

The current A2 flow should be adjusted only where needed for better wallet UX:

1. User lands on a saved Multipass page.
2. Claim panel shows wallet state:
   - not ready: `Loading wallet options...`
   - no wallet: `Connect wallet to claim`
   - wallet connected: `Sign owner claim with 0x1234...abcd`
3. If no wallet is connected, clicking the claim button opens Privy's wallet modal.
4. After a successful wallet connection, the same user action continues into claim signing; the user should not need to click a second button unless the connect step was cancelled or failed.
5. The app creates the server nonce only after an EVM wallet is available.
6. The selected wallet signs the exact server-provided claim message.
7. The API verifies the signature through the existing `verifyClaimSignature` path.
8. On success, the API sets the HTTP-only manager session and returns CSRF as today.
9. On failure, the UI shows the API error without implying custody, ownership transfer, or authority transfer.

Create the claim nonce after wallet connection, not before opening the wallet modal. This avoids creating unused/expired nonces when users cancel the wallet modal.

## UI Copy

Use direct labels:

- No wallet: `Connect wallet to claim`
- Connected: `Sign owner claim with 0x1234...abcd`
- Signing: `Waiting for signature...`
- Rejected: `Wallet signature cancelled. Nothing was changed.`
- Wrong wallet or unauthorized: `That wallet cannot manage this Multipass. Connect the source owner wallet or request manual review.`
- Privy not configured: `Wallet login is not configured for this build.`

Keep the existing safety copy that says management only unlocks public profile edits and does not transfer custody, tools, credentials, assets, or ownership.

## Configuration

- Add `VITE_PRIVY_APP_ID` for the Multipass web build.
- Production should use the same Helixa Privy app unless the team explicitly creates a Multipass-specific Privy app.
- Do not add a separate WalletConnect project ID for this path.
- Do not expose server admin secrets or manager session secrets to the client.

## Error Handling

Handle these cases explicitly:

- Privy SDK not ready.
- Privy app ID missing.
- User closes the wallet modal.
- User connects no EVM wallet.
- Wallet provider cannot provide `personal_sign`.
- User rejects the signature.
- API returns `unauthorized` for wrong wallet.
- API returns `claim_pending` for manual-review path.
- Session/CSRF write still fails after successful signature.

Signature rejection should be treated as a safe cancellation. It should not leave scary claim-failed copy unless the API actually rejected the proof.

## Security Requirements

- The connected wallet alone never authorizes edits.
- Privy login, email, social account, or JWT never authorizes edits.
- The signed server nonce remains the proof.
- HTTP-only manager session and CSRF remain required for public profile writes.
- Origin/referer checks stay server-side.
- Manager sessions stay scoped to one Multipass ID.
- No new localStorage auth path is introduced by Multipass. Privy's own SDK storage is acceptable for wallet/account UX, but Multipass manager authorization must remain cookie/session based.
- Public copy must not imply custody transfer, asset transfer, tool transfer, secret transfer, permission grant, or current NFT binding.

## Testing Plan

### Unit and DOM tests

- Wallet button renders `Connect wallet to claim` when no wallet is connected.
- Wallet button renders shortened address when wallet is connected.
- Missing Privy app ID displays configuration copy and does not start claim signing.
- Claim flow calls wallet connect before creating a claim nonce when no wallet is connected.
- Claim flow creates nonce only after an EVM wallet is available.
- Wallet modal cancellation displays cancellation copy and does not create a claim nonce.
- No connected EVM wallet displays a clear wallet-required message.
- `personal_sign` receives the exact API nonce message and selected wallet address.
- Missing `personal_sign` support displays a wallet-provider unsupported message and does not call verify.
- Signature rejection displays cancellation copy and does not call verify.
- API `unauthorized` displays wrong-wallet/manual-review guidance.
- Existing A2 claim/session tests still pass.

### Build checks

- `pnpm test`
- `MULTIPASS_BASE=/multipass/ pnpm --filter @helixa/multipass-web build`

### Manual smoke

- Desktop wallet extension path.
- Telegram in-app browser path with Privy wallet modal.
- Mobile WalletConnect path into Coinbase Wallet or MetaMask.
- Wrong-wallet path returns clear manual-review guidance.
- Successful claim still creates HTTP-only session and enables only safe public profile edits.

## Deployment Notes

- Confirm `VITE_PRIVY_APP_ID` is present during the production web build.
- Rebuild and sync only the web bundle if API code does not change.
- If API copy/error handling changes are needed, restart `multipass-api.service` after tests.
- Run the same live smoke as A2 after deployment:
  - profile GET 200
  - claim nonce POST 200
  - unauthenticated PATCH 401
  - saved page 200

## Implementation Default

Use the existing Helixa Privy app ID for Multipass unless the team explicitly wants separate Privy analytics/configuration for Multipass. Split to a Multipass-specific Privy app later only if analytics, branding, or policy settings become noisy.
