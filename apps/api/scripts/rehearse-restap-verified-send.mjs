#!/usr/bin/env node
import { resolve } from 'node:path';

import { rehearseRestapVerifiedSend } from '../src/restap-network/verified-send-rehearsal.js';

const args = process.argv.slice(2);
if (args[0] === '--') args.shift();
const [sourceDatabasePath, senderTokenId, recipientTokenId, topic, idempotencyKey, owner] = args;
if (!sourceDatabasePath || !senderTokenId || !recipientTokenId || !topic || !idempotencyKey || !owner || args.length !== 6) {
  process.stderr.write('Usage: node apps/api/scripts/rehearse-restap-verified-send.mjs <source-db> <sender-token> <recipient-token> <topic> <idempotency-key> <owner>\n');
  process.exitCode = 64;
} else {
  const proof = await rehearseRestapVerifiedSend({
    sourceDatabasePath: resolve(sourceDatabasePath),
    input: { senderTokenId, recipientTokenId, topic, idempotencyKey, owner },
  });
  process.stdout.write(JSON.stringify(proof) + '\n');
}
