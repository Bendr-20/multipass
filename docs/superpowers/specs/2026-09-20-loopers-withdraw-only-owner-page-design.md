# Loopers Withdraw-Only Owner Page Design

## Goal

Give the live Loopers contract owner one narrow browser control to withdraw current mint proceeds to the contract's existing treasury wallet. The page must not change treasury, royalties, ownership, supply, NFTs, sale state, or contract code.

## Locked Onchain Targets

- Chain: Base mainnet (`8453`)
- Live Loopers proxy: `0x1649CD37f4748807b4882FC48765bA0B2aFfa94a`
- Expected owner: `0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE`
- Expected existing treasury: `0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE`
- Only write call: `withdraw()` (`0x3ccfd60b`)

The contract's `withdraw()` sends its entire ETH balance to its stored treasury address. Moving ETH from that wallet to the Base Safe is a separate manual operation outside this page.

## Page Behavior

1. Read and display live contract balance, owner, treasury, connected wallet, and network.
2. Connect an injected wallet and switch to Base mainnet when requested.
3. Enable the withdraw button only when all checks pass:
   - connected chain is Base mainnet;
   - connected wallet equals the expected owner;
   - onchain owner equals the expected owner;
   - onchain treasury equals the expected treasury;
   - contract balance is greater than zero.
4. Before opening wallet approval, simulate/estimate the exact zero-value `withdraw()` transaction.
5. Send only `{from: owner, to: live Loopers proxy, data: 0x3ccfd60b, value: 0}`.
6. Show the transaction hash with a BaseScan link and refresh state after confirmation/polling.

## Fail-Closed Rules

- No editable contract or destination fields.
- No `setTreasury`, reserve mint, NFT transfer, ownership, pause, sale, upgrade, or arbitrary calldata controls.
- A mismatched owner or treasury disables withdrawal and displays the full mismatch.
- A missing wallet, wrong network, zero balance, failed simulation, rejected signature, or reverted transaction leaves state unchanged and shows a bounded error.
- The page never requests or stores private keys, seed phrases, passwords, or API keys.

## Deployment

Publish as a standalone, noindex static route under `https://helixa.xyz/withdraw-loopers/`. Keep the prior old-contract withdrawal route unchanged. Back up the live destination before replacement.

## Verification

- Static tests assert the exact chain, contract, owner, treasury, calldata, and absence of forbidden selectors/actions.
- Browser smoke covers no-wallet, wrong-wallet, ready, rejected-signature, submitted, and zero-balance states with mocked provider/RPC responses.
- Live read-only verification confirms the deployed HTML hash, public route status, and displayed onchain owner/treasury/balance.
- No transaction is initiated during deployment or verification; Quigley alone approves it in his wallet.
