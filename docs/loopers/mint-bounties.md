# Loopers Mint Bounties

Launch-day bounty rules for rare post-reveal trait hunts.

## Current Bounties

These bounties open only after reveal and after the public bounty announcement.

- `Artifact: Pikachu` - first eligible post-reveal mint wins `$100` in `$CRED`
- `Artifact: Mario` - first eligible post-reveal mint wins `$100` in `$CRED`
- `Artifact: Toshi` - first eligible post-reveal mint wins `$100` in `$TOSHI`

## Rules

- The bounty clock starts after reveal, not before.
- Only mints after the bounty start announcement count.
- One winner per bounty.
- Reserve/team mints are ineligible unless the team explicitly marks a mint event eligible.
- Winners are verified manually against token metadata, mint transaction order, and current ownership before payout.
- Payouts are manual. No contract changes and no automatic rewards.

## Settlement

Create a mint event file with the post-reveal eligible mint events in chain order:

```json
{
  "mints": [
    {
      "token_id": 1,
      "minter": "0x...",
      "tx_hash": "0x...",
      "block_number": 1,
      "log_index": 0,
      "eligible": true
    }
  ]
}
```

Create a bounty file:

```json
{
  "bounties": [
    {
      "id": "pikachu-artifact",
      "status": "active",
      "trait_type": "Artifact",
      "value": "Pikachu",
      "reward_amount": 100,
      "reward_symbol": "CRED"
    }
  ]
}
```

Run:

```bash
pnpm loopers:settle-bounties -- \
  --metadata-dir /private/final-loopers-metadata/metadata \
  --mints-path /private/loopers-bounty-mints.json \
  --bounties-path /private/loopers-bounties.json \
  --output-path /private/loopers-bounty-settlement.json
```

Review the settlement output before paying.
