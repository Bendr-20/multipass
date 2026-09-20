# Loopers Withdraw-Only Owner Page Design

## Goal

Give the live Loopers contract owner one narrow browser control to withdraw current mint proceeds to the contract's existing treasury wallet. The page must not change treasury, royalties, ownership, supply, NFTs, sale state, or contract code.

## Locked Onchain Targets

- Chain: Base mainnet (`8453`)
- Live Loopers proxy: `0x1649CD37f4748807b4882FC48765bA0B2aFfa94a`
- Expected owner: `0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE`
- Expected existing treasury: `0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE`
- Only write call: `withdraw()` (`0x3ccfd60b`)
- Owner read selector: `owner()` (`0x8da5cb5b`)
- Treasury read selector: `treasury()` (`0x61d027b3`)
- EIP-1967 implementation slot: `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`
- Expected implementation: `0x68F22e3563891167D37C86391c4a83449c83e908`
- Expected proxy-code SHA-256: `6ea05616ee3e471f1a4890f75aebac2410a44a0beb0110821f74e6a977e59662`
- Expected implementation-code SHA-256: `46c2bf5bca689ba1994f06a6b85971e68392e2fc458a1ed09ff20022399644ec`

The contract's `withdraw()` sends its entire ETH balance to its stored treasury address. Moving ETH from that wallet to the Base Safe is a separate manual operation outside this page.

## Page Behavior

1. Read and display live contract balance, owner, treasury, connected wallet, network, and implementation identity from Base mainnet RPC only.
2. Verify the live proxy code, EIP-1967 implementation address, and implementation code against the pinned identities before enabling any write.
3. Connect an injected wallet and switch to Base mainnet when requested.
4. Enable the withdraw button only when all checks pass:
   - connected chain is Base mainnet;
   - connected wallet equals the expected owner;
   - onchain owner equals the expected owner;
   - onchain treasury equals the expected treasury;
   - proxy and implementation identities match;
   - contract balance is greater than zero.
5. Listen for `accountsChanged` and `chainChanged`; immediately clear readiness and re-run every check.
6. On click, re-read chain, account, owner, treasury, balance, proxy identity, and implementation identity to prevent stale-state/TOCTOU errors.
7. Run `eth_call` against the live proxy with the exact zero-value `withdraw()` transaction. Gas estimation may supplement but never replace this simulation.
8. Enforce an exact runtime transaction allowlist immediately before `eth_sendTransaction`: chain `8453`, expected owner as `from`, live proxy as `to`, `data: 0x3ccfd60b`, and `value: 0x0`. No caller may override those fields.
9. Show the transaction hash with a BaseScan link. Poll `eth_getTransactionByHash` and `eth_getTransactionReceipt` on Base; success requires matching `from`, `to`, `input`, and `value`, plus a receipt with `status == 0x1`.
10. Refresh owner, treasury, and balance after the verified receipt.

## Fail-Closed Rules

- No editable contract or destination fields and no mutable third-party executable scripts.
- No `setTreasury`, reserve mint, NFT transfer, ownership, pause, sale, upgrade, or arbitrary calldata controls.
- A mismatched owner or treasury disables withdrawal and displays the full mismatch.
- A missing wallet, wrong network, zero balance, failed simulation, rejected signature, or reverted transaction leaves state unchanged and shows a bounded error.
- The page never requests or stores private keys, seed phrases, passwords, or API keys.

## Deployment

Publish as a standalone, noindex static route under `https://helixa.xyz/withdraw-loopers/`. Keep the prior old-contract withdrawal route unchanged. Back up the live destination before replacement.

## Verification

- Static tests assert the exact chain, contract, owner, treasury, read selectors, implementation slot/address, code hashes, calldata, exact transaction allowlist, and absence of forbidden selectors/actions.
- Browser smoke covers no-wallet, wrong-wallet, ready, rejected-signature, submitted, and zero-balance states with mocked provider/RPC responses.
- Live read-only verification confirms hashes for every deployed executable asset, public route status, and displayed onchain owner/treasury/balance/implementation identity.
- No transaction is initiated during deployment or verification; Quigley alone approves it in his wallet.
