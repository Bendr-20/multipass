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
- Use standard marketplace-compatible ERC-721 behavior by default, with optional ERC-721C validator hooks available if the owner explicitly arms them.
- Use ERC-2981 royalties.
- Implement ERC-8048 onchain metadata with ERC-721T reserved keys.
- Include ERC-6551 token-bound account resolution in the launch rehearsal path.
- Do not force ERC-721C validator enforcement in the default v1 posture. The collection should stay freely transferable unless the owner deliberately configures a validator.
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
- Public phase starts when the allowlist phase ends by default, but the owner can shorten that path before launch or flip public live early once allowlist is open.
- Total mint window: `7 days, 7 hours, 7 minutes, 7 seconds`.
- Mint ends when sold out or when the window closes.

## Pricing

- Payment asset: ETH on Base.
- Public price: `0.0077` ETH (`7700000000000000` wei).
- Allowlist price: `0.0037` ETH (`3700000000000000` wei).
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

## Mint-Time ERC-8004 Binding Target

- In addition to ERC-721T/ERC-8048 metadata support, the contract now includes an optional owner-set `Adapter8004` path.
- When `erc8004Registry` and `erc8004AgentBaseURI` are configured, every minted Looper auto-registers a paired ERC-8004 identity during the mint transaction and transfers that identity NFT to the same holder.
- The contract records `erc8004BoundByLooper(tokenId)`, `erc8004IdentityTokenIdByLooper(tokenId)`, and `erc8004AgentURI(tokenId)` so the bind is readable onchain.
- `erc8004AgentBaseURI` should point at the Helixa/Multipass API-controlled agent surface so 8004 registration data and 721T-indexed NFT metadata stay synchronized.
- Public mint surfaces must still stay honest: if a rehearsal deployment is missing the 8004 config, the UI should block mint instead of implying the bind exists.

## Owner/Admin Controls

Owner can:

- Pause minting only.
- Set or clear the optional ERC-721C transfer validator and validator auto-approval behavior.
- Update Merkle root before allowlist starts.
- Update prices before mint starts.
- Shorten `publicStart` after sale config is armed, as long as it stays inside the active sale window.
- Flip public mint live immediately once the allowlist phase is already open.
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
- Default launch posture keeps the validator unset so transfers remain standard ERC-721 behavior until the owner explicitly configures a 721C policy.

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
