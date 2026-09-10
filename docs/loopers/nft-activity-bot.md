# Loopers NFT Activity Bot

Telegram-first watcher for post-launch Loopers marketplace activity.

## Scope

The first production lane watches Reservoir sales on Base and posts each new Loopers sale to Telegram. Reservoir is the right source for buy/sell posts because it includes price, marketplace/source, buyer, seller, token ID, and transaction hash in one indexed event stream.

This does not change the NFT contract and does not auto-pay anything.

## Message Shape

Each post includes:

- sale label
- Looper name/token ID
- price
- marketplace
- seller and buyer short addresses
- Looper link
- Basescan transaction link
- token image when Telegram accepts the image URL

## Config

Set these in the host environment or service env file:

```bash
LOOPERS_ACTIVITY_CONTRACT=0x...
LOOPERS_ACTIVITY_TELEGRAM_BOT_TOKEN=...
LOOPERS_ACTIVITY_TELEGRAM_CHAT_ID=...
LOOPERS_ACTIVITY_RESERVOIR_API_KEY=...
LOOPERS_ACTIVITY_STATE_PATH=/var/lib/multipass/loopers-activity-seen.json
```

Optional:

```bash
LOOPERS_ACTIVITY_POLL_INTERVAL_MS=60000
LOOPERS_ACTIVITY_TOKEN_BASE_URL=https://helixa.xyz/multipass/loopers/
LOOPERS_ACTIVITY_EXPLORER_TX_BASE_URL=https://basescan.org/tx/
LOOPERS_ACTIVITY_SEND_IMAGES=1
```

Never paste bot tokens or API keys into chat, docs, commands, URLs, or logs. Use the host's masked secret/env path.

## Commands

Dry-run one poll without posting:

```bash
pnpm loopers:activity-bot -- --once --dry-run --contract 0x...
```

Run continuously:

```bash
pnpm loopers:activity-bot
```

Run once and post any unseen sales:

```bash
pnpm loopers:activity-bot -- --once
```

## Launch Notes

- Start the bot after the real mainnet contract address is final.
- Keep the JSON seen-state file on persistent disk so restarts do not repost old sales.
- Use a private Telegram test chat first, then swap the chat ID to the public/community destination.
- If Telegram cannot send the token image as a photo, the bot falls back to a text post with links.
- Primary mints may need a separate raw `Transfer` watcher if Reservoir does not surface them as sale activity for the collection. Marketplace buys/sells should use Reservoir.
