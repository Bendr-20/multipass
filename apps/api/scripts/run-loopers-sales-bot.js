#!/usr/bin/env node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createLoopersSalesBot,
  parseLoopersSalesBotOptions,
} from '../src/loopers-sales-bot.js';
import { readOpenSeaApiKey } from '../src/loopers-sales/opensea.js';

const HELP = `Usage:
  node apps/api/scripts/run-loopers-sales-bot.js [options]

Options:
  --probe                       verify Stream, REST, floor, and durable state without Telegram
  --state-path <path>           durable sales state path
  --no-images                   disable sale-specific Telegram images
  --collection-slug <slug>      OpenSea collection slug
  --contract <address>          canonical Loopers contract
  --opensea-config-path <path>  OpenSea API key JSON config
  --telegram-chat-id <id>       Telegram destination
  --premium-multiplier <value>  premium threshold (default: 1.25)
  --sweep-animation-url <url>   approved Loopers sweep animation URL
  --reconcile-interval-ms <ms>  periodic REST interval
  --quiet-ms <ms>               sweep quiet deadline
  --hard-deadline-ms <ms>       sweep hard deadline
  --help                        show this help

Environment:
  LOOPERS_SALES_OPENSEA_CONFIG_PATH
  LOOPERS_SALES_COLLECTION_SLUG
  LOOPERS_SALES_CONTRACT
  LOOPERS_SALES_TELEGRAM_CHAT_ID
  LOOPERS_SALES_TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_TOKEN
  LOOPERS_SALES_STATE_PATH
  LOOPERS_SALES_PREMIUM_MULTIPLIER
  LOOPERS_SALES_SWEEP_ANIMATION_URL
`;

function stringifyStatus(type, detail = {}) {
  return JSON.stringify({ type, ...detail });
}

function redactedMessage(error, secrets = []) {
  let message = String(error?.message || 'Loopers sales bot failed');
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret) message = message.replaceAll(secret, '[REDACTED]');
  }
  message = message.replace(/(?:token|api[_ -]?key)=([^\s&]+)/gi, '$1=[REDACTED]');
  return message;
}

function validateRuntimeOptions(options) {
  const missing = [];
  if (!options.collectionSlug) missing.push('LOOPERS_SALES_COLLECTION_SLUG');
  if (!/^0x[0-9a-f]{40}$/i.test(options.contract)) missing.push('LOOPERS_SALES_CONTRACT');
  if (!options.statePath) missing.push('LOOPERS_SALES_STATE_PATH');
  if (!options.probe && !options.telegramBotToken) missing.push('LOOPERS_SALES_TELEGRAM_BOT_TOKEN');
  if (!options.probe && !options.telegramChatId) missing.push('LOOPERS_SALES_TELEGRAM_CHAT_ID');
  if (missing.length) throw new Error(`Missing required Loopers sales bot config: ${missing.join(', ')}`);
}

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = line => console.log(line),
  stderr = line => console.error(line),
  readApiKey = readOpenSeaApiKey,
  makeBot = createLoopersSalesBot,
  processImpl = process,
} = {}) {
  let options;
  let apiKey = '';
  let probeDirectory = null;
  let bot = null;
  try {
    options = parseLoopersSalesBotOptions(argv, env);
    if (options.help) {
      stdout(HELP);
      return 0;
    }
    validateRuntimeOptions(options);
    apiKey = await readApiKey(options.openseaConfigPath);

    const probeHasExplicitStatePath = argv.some(argument => argument === '--state-path');
    if (options.probe && !probeHasExplicitStatePath) {
      probeDirectory = await mkdtemp(path.join(os.tmpdir(), 'loopers-sales-probe-'));
      options = { ...options, statePath: path.join(probeDirectory, 'state.json') };
    }

    bot = makeBot({ options, apiKey });
    if (options.probe) {
      const status = await bot.probe();
      stdout(stringifyStatus('loopers-sales-bot probe ok', {
        ready: status.ready,
        restWatermark: status.restWatermark ?? status.watermark ?? null,
        telegramCalls: 0,
      }));
      return status.ready ? 0 : 1;
    }

    await bot.start();
    stdout(stringifyStatus('loopers-sales-bot ready', bot.getStatus()));

    await new Promise((resolve, reject) => {
      let shuttingDown = false;
      const shutdown = signal => {
        if (shuttingDown) return;
        shuttingDown = true;
        Promise.resolve(bot.stop()).then(() => {
          stdout(stringifyStatus('loopers-sales-bot stopped', { signal }));
          resolve();
        }, reject);
      };
      const onSigint = () => shutdown('SIGINT');
      const onSigterm = () => shutdown('SIGTERM');
      processImpl.once('SIGINT', onSigint);
      processImpl.once('SIGTERM', onSigterm);
    });
    return 0;
  } catch (error) {
    if (bot && !options?.probe) await bot.stop().catch(() => {});
    stderr(stringifyStatus('loopers-sales-bot fatal', {
      message: redactedMessage(error, [apiKey, options?.telegramBotToken]),
    }));
    return 1;
  } finally {
    if (probeDirectory) await rm(probeDirectory, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  process.exitCode = await main();
}
