#!/usr/bin/env node
import {
  buildSibylMemoryNamespace,
  createSibylMemoryStore,
} from '../src/sibyl-memory/index.js';

const args = parseArgs(process.argv.slice(2));
const namespace = args.namespace || buildSibylMemoryNamespace({
  wallet: args.wallet,
  agentId: args.agentId,
  activationId: args.activationId,
});
const message = args.message || 'Watchlist preference: prove real Sibyl cold-start recall.';
const query = args.query || 'watchlist';

try {
  const writer = createSibylMemoryStore({
    pythonBin: args.pythonBin,
    bridgePath: args.bridgePath,
    allowFallback: false,
  });
  const saved = await writer.saveMemory({
    namespace,
    text: message,
    tags: ['hackathon', 'cold-start-proof'],
  });

  const reader = createSibylMemoryStore({
    pythonBin: args.pythonBin,
    bridgePath: args.bridgePath,
    allowFallback: false,
  });
  const recalled = await reader.searchMemory({ namespace, query, limit: 5 });
  const matched = recalled.some((entry) => String(entry.text ?? '').includes(message));
  if (!matched) {
    throw new Error('Cold-start Sibyl recall did not return the saved memory.');
  }

  console.log(JSON.stringify({
    ok: true,
    provider: reader.provider,
    namespace,
    saved,
    query,
    recalled_count: recalled.length,
    matched,
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--namespace') parsed.namespace = argv[++index];
    else if (arg === '--wallet') parsed.wallet = argv[++index];
    else if (arg === '--agent-id') parsed.agentId = argv[++index];
    else if (arg === '--activation-id') parsed.activationId = argv[++index];
    else if (arg === '--message') parsed.message = argv[++index];
    else if (arg === '--query') parsed.query = argv[++index];
    else if (arg === '--python-bin') parsed.pythonBin = argv[++index];
    else if (arg === '--bridge-path') parsed.bridgePath = argv[++index];
  }
  return parsed;
}
