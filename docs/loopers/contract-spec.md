# Loopers Contract Spec

## Goal

Ship a simple, durable Base mainnet ERC-721 collection that can mint cleanly, reveal safely, and later activate into Multipass without forcing NFT migration.

The NFT contract is the permanent root asset. Future logic belongs in external modules such as Multipass, `LooperActivationRegistry`, Evolution, Cred utility, APIs, and dashboard services.

## Chain And Naming

- Chain: Base mainnet
- Rehearsal: Base Sepolia
- Collection name: `Loopers`
- Token name pattern: `Looper #<tokenId>`
- Token IDs: normal sequential IDs

## Contract Posture

- Use ERC-721A-style minting or an equivalent gas-efficient ERC-721 implementation.
- Main NFT contract should not be upgradeable by default.
- Use standard marketplace-compatible ERC-721 behavior.
- Use ERC-2981 royalties.
- Implement ERC-8048 onchain metadata with ERC-721T reserved keys.
- Include ERC-6551 token-bound account resolution in the launch rehearsal path.
- Do not use ERC-721C or forced marketplace enforcement in v1.
- Do not put Sibyl, Evolution, autonomous spend, tool wallets, or activation memory into the mint contract.

## Supply

- Max supply: `7,777`
- Team reserve: `337`
- Team reserve counts inside the `7,777` cap.
- No hidden owner mint beyond the reserve.
- After the mint window ends, permanently close/burn the remaining public supply.
- Final supply is minted public/allowlist tokens plus the 337 team reserve.

## Sale Phases

- Allowlist phase starts first.
- Allowlist phase duration: `24 hours`.
- Public phase starts when the allowlist phase ends.
- Total mint window: `7 days, 7 hours, 7 minutes, 7 seconds`.
- Mint ends when sold out or when the window closes.

## Pricing

- Payment asset: ETH on Base.
- Public target: about `$20`.
- Allowlist target: about `$10`, 50% discount.
- Exact ETH-denominated prices are set before mint based on ETH/USD near launch.
- Store fixed `publicPriceWei` and `allowlistPriceWei` in contract.
- No live oracle pricing.
- Avoid price changes after mint starts unless something extreme happens.

## Wallet Limits

- Allowlist: max 3 discounted mints per allowlist wallet.
- Public: max 10 mints per wallet.
- Reserve mints do not count against public wallet caps.

## Allowlist

- Use a Merkle root.
- Public signup list is raw interest, not automatic eligibility.
- Do basic cleanup only unless an obvious bot/problem pattern needs more.
- Final Merkle allowlist is frozen before allowlist mint.
- Mint site/API serves per-wallet proofs.
- Contract stores only the Merkle root.
- Avoid root changes after allowlist starts unless genuinely broken.

## Agent Metadata And ERC-6551

- Implement ERC-8048 `metadata(uint256 tokenId, string key) returns (bytes)` and report interface ID `0xdf670be1`.
- Use ERC-721T as the agent metadata profile, not a separate NFT standard.
- Reserved keys use canonical lowercase endpoint names such as `context`, `endpoint[mcp]`, `endpoint[a2a]`, `endpoint[web]`, and `endpoint[x402]`.
- Base uses ERC-7930 chain identifier `0x000100000202210500`.
- `address[0x000100000202210500]` resolves to the current token owner as a 20-byte address component.
- `account[0x000100000202210500][0]` resolves to the configured ERC-6551 token-bound account as a 20-byte address component.
- The owner can configure the ERC-6551 registry, implementation, and salt for launch.
- Token-bound account resolution must be rehearsed on Base Sepolia before mainnet.

## Owner/Admin Controls

Owner can:

- Pause minting only.
- Update Merkle root before allowlist starts.
- Update prices before mint starts.
- Update treasury/royalty receiver if needed.
- Reserve mint up to the 337 cap.
- Configure ERC-6551 registry/account implementation.
- Set ERC-8048/721T metadata values for minted tokens.
- Reveal once by setting final base URI and reveal offset.
- Withdraw ETH.

Owner must not be able to:

- Blacklist holders.
- Freeze normal transfers.
- Force transfer tokens.
- Seize tokens.
- Mint beyond declared reserve/max supply.

## Treasury/Admin Wallet

- Fresh Base owner/admin wallet provided by Quigley: `0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE`.
- Use the same wallet for primary proceeds and ERC-2981 royalty receiver unless Quigley changes it before deployment.
- Do not use a daily personal wallet or Bankr ops wallet.
- Exact wallet address must be verified before deployment for:
  - contract owner/admin
  - primary proceeds receiver
  - royalty receiver
  - reveal/admin permissions

## Reveal

- Allowlist phase uses placeholder metadata.
- Reveal happens at public mint open.
- Contract owner flips from placeholder to final base URI at reveal.
- Use a simple reveal offset to prevent public-phase trait sniping.
- No complicated provenance ceremony.

Reveal offset behavior:

- Tokens mint sequentially as normal.
- Before reveal, every token returns placeholder metadata.
- At reveal, final metadata file selection is shifted by one owner-set/randomized offset.
- Example: `tokenId 123` may resolve to metadata file `5912`.
- Buyers cannot know the exact Looper they are minting before transaction execution.

## Royalties

- Royalty standard: ERC-2981.
- Royalty: 5%.
- Receiver: same fresh Base treasury wallet as primary proceeds.
- Owner may update royalty receiver if treasury changes.
- Royalty should be capped at 5% so it cannot later surprise-increase.
- No ERC-721C or restrictive transfer rules in v1.

## Public Reads For Mint Site

Expose enough public reads that the frontend does not guess:

- sale state: not started, allowlist, public, ended
- allowlist start
- public start
- sale end
- public price
- allowlist price
- max supply
- team reserve
- total minted
- remaining supply
- minted by wallet
- allowlist minted by wallet
- revealed state
- token URI behavior for placeholder/final metadata

## Mainnet Launch Gates

No mainnet mint until:

- Contract tests pass for pricing, caps, Merkle, reserve, pause, reveal offset, withdraw, and royalties.
- Base Sepolia rehearsal passes end-to-end.
- Mint site handles allowlist, public, sold out, ended, wrong chain, rejected transaction, smart wallet, and EOA.
- Placeholder metadata is live and correct.
- Final metadata/art passes validation before Arweave upload.
- Fresh Base treasury/admin wallet address is verified twice.
- Final Merkle file is frozen and backed up.
- Pause, reveal, and withdraw are tested from the actual admin wallet on rehearsal.
