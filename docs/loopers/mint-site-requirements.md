# Loopers Mint Site Requirements

## Goal

One mint page should handle allowlist and public mint clearly. The page should display contract-backed facts and avoid frontend-only guesses.

## Page States

Before wallet connect:

- current phase
- price
- max per wallet
- countdown
- collection cap

After wallet connect:

- connected wallet
- eligibility
- remaining mints for that wallet
- exact ETH required
- chain status
- clear next action

## Phase Behavior

Allowlist phase:

- Allowlisted wallet can mint up to 3 at discounted price.
- Non-allowlisted wallet sees public mint countdown, not a scary error.
- Do not emphasize minted count during allowlist.

Public phase:

- Everyone can mint up to 10 per wallet.
- Show a small accurate supply line such as `Minted: 1,248 / 7,777` or `Remaining: 6,529`.
- Near sellout, make remaining supply more visible to reduce failed transactions.

Ended phase:

- Mint disabled.
- Final supply shown clearly.
- Link to activation/dashboard when ready.

## Wallet Support

The page must support:

- regular EOA wallets
- MetaMask/injected wallets
- Coinbase Wallet
- Base/Coinbase smart wallets
- Privy embedded/address-only smart accounts when a real address is available

Allowlist registration must not require signing-wallet/provider semantics just to save an address.

## Allowlist Source

- Public signup list is raw interest.
- Final allowlist uses a frozen Merkle list after basic cleanup.
- Mint site/API serves Merkle proofs to eligible wallets.
- Keep cleanup simple unless obvious bot patterns require more.

## Display Rules

- Use `Looper #1234`, not `Multipass Looper #1234`.
- Public phrasing should be `Loopers mint`, `Activate your Looper`, and `Loopers live in Multipass`.
- Multipass is the dashboard/access layer, not the collection name.
- Minted count must be accurate if displayed.
- Do not make the counter the emotional center unless momentum is strong.

## Error Handling

Handle these states with plain copy:

- wrong chain
- wallet rejected transaction
- insufficient ETH
- sale not started
- wallet not allowlisted during allowlist phase
- wallet cap reached
- supply sold out
- sale ended
- proof unavailable
- smart wallet connection still settling

## Data Source Rule

Contract is truth. UI is display.

The mint page should read contract sale state, prices, wallet counts, reveal state, total minted, and supply information from the contract or a verified index/API mirror of the contract.

