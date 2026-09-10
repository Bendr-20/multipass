#!/usr/bin/env node
import {
  parseLoopersActivityBotOptions,
  runLoopersActivityBot,
} from '../src/loopers-activity-bot.js';

const options = parseLoopersActivityBotOptions(process.argv.slice(2), process.env);

if (options.help) {
  console.log(`Usage:
  node apps/api/scripts/run-loopers-activity-bot.js --contract 0x... --telegram-chat-id -100...

Environment:
  LOOPERS_ACTIVITY_CONTRACT
  LOOPERS_ACTIVITY_TELEGRAM_BOT_TOKEN
  LOOPERS_ACTIVITY_TELEGRAM_CHAT_ID
  LOOPERS_ACTIVITY_RESERVOIR_API_KEY optional
  LOOPERS_ACTIVITY_STATE_PATH optional
  LOOPERS_ACTIVITY_POLL_INTERVAL_MS optional

Flags:
  --once       poll once and exit
  --dry-run    format activity without posting to Telegram
  --no-images  post text messages instead of Telegram photos
`);
  process.exit(0);
}

try {
  const result = await runLoopersActivityBot(options);
  if (options.once) {
    console.log(`Loopers activity poll checked ${result.checked} sale(s), posted ${result.posted}.`);
    for (const posted of result.postedActivities) {
      if (posted.message) console.log(`\n${posted.message}`);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
