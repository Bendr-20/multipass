import { buildConsoleXmtpWorkerOptionsFromEnv, startConsoleXmtpWorker } from './index.js';

const worker = await startConsoleXmtpWorker(buildConsoleXmtpWorkerOptionsFromEnv());

console.log(`Console XMTP worker started for inbox ${worker.client.inboxId}.`);

async function shutdown(signal) {
  console.log(`Console XMTP worker received ${signal}; stopping.`);
  await worker.stop();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
