# Coinbase EIP-7702 Owner Wallet Support

## Goal

Permit the existing Multipass Looper wallet write flow when the connected current NFT owner is an EOA delegated on Base to Coinbase's verified EIP-7702 proxy. Keep every unknown contract or delegation read-only.

## Scope

- Recognize only the exact EIP-7702 designator `0xef01007702cb554e6bfb442cb743a7df23154544a7176c`.
- Classify it separately from an empty-code EOA and from unsupported contract/delegated accounts.
- Allow the existing zero-value transaction path only when the connected address is still the current Looper owner and all existing chain, registry, runtime, binding, policy, preview, persistence, and receipt-attribution checks pass.
- Re-read and validate the operator code immediately before submission.
- Continue using the connected wallet's EIP-1193 `eth_sendTransaction` method with the exact prevalidated payload.
- Fail closed to read-only if the owner code changes, the delegate differs, or any existing evidence check fails.

## Non-goals

- Supporting arbitrary EIP-7702 delegates or general contract wallets.
- Revoking or changing wallet delegation.
- Changing TBA permissions, transaction targets, value limits, or policy modules.
- Deploying to production or sending a live transaction without fresh approval.

## Verification

Add regressions proving the pinned Coinbase designator is writable, unknown or malformed code remains blocked, and pre-sign delegation drift invalidates the prepared attempt. Run affected tests, the complete suite, and the production build.
