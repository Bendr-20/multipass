# Loopers Build Specs

Loopers is the NFT collection. Multipass is the dashboard, activation, and access layer around Loopers.

This folder turns the locked Telegram planning decisions into build artifacts:

- [Contract Spec](./contract-spec.md)
- [Deployment Verification](./deployment-verification.md)
- [Mint Site Requirements](./mint-site-requirements.md)
- [Metadata And Reveal Checklist](./metadata-reveal-checklist.md)
- [Sibyl Activation Demo](./sibyl-activation-demo.md)
- [Build Task Index](./build-task-index.md)

## Current Implementation Surface

- Contract draft: `packages/contracts/src/Loopers.sol`
- Contract tests: `packages/contracts/test/loopers.test.mjs`
- Contract deployment tooling: `packages/contracts/scripts/`
- Deployment config examples: `packages/contracts/config/`
- Allowlist registration/API code: `apps/web/src/looper-allowlist.js`, `apps/api/src/allowlist-store.js`, `apps/api/src/allowlist-snapshot.js`
- Hidden Sepolia mint page implementation: `apps/web/src/looper-mint.js` behind `?mint=sepolia`
- Metadata compiler/validator: `packages/loopers-metadata/`
- Sibyl activation demo implementation: not built yet

## Naming Rules

- Collection: `Loopers`
- Token metadata name: `Looper #1234`
- Multipass: holder dashboard, activation, agent naming, memory, and profile management layer
- Public phrasing: `Loopers mint`, `Activate your Looper`, `Loopers live in Multipass`
- Avoid `Multipass Loopers` as the public collection name.
