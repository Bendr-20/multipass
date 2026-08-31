import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_SIBYL_PYTHON = process.env.MULTIPASS_SIBYL_PYTHON || '/home/ubuntu/.openclaw/sibyl-venv/bin/python';
const DEFAULT_SIBYL_BRIDGE_PATH = fileURLToPath(new URL('./bridge.py', import.meta.url));

export function buildSibylMemoryNamespace({ wallet, agentId, activationId } = {}) {
  const normalizedWallet = normalizeNamespacePart(wallet, 'unknown-wallet');
  const normalizedAgent = normalizeNamespacePart(agentId, 'unknown-agent');
  const normalizedActivation = normalizeNamespacePart(activationId, normalizedAgent);
  return `multipass:${normalizedWallet}:${normalizedAgent}:${normalizedActivation}`;
}

export function createSibylMemoryStore({
  now = () => new Date().toISOString(),
  pythonBin = DEFAULT_SIBYL_PYTHON,
  bridgePath = DEFAULT_SIBYL_BRIDGE_PATH,
  timeoutMs = 15_000,
  fallback = createLocalSibylMemoryStore({ now }),
} = {}) {
  let bridgeDisabled = false;
  let bridgeError = null;

  async function callBridge(action, payload = {}) {
    if (bridgeDisabled) throw new Error(bridgeError ?? 'Sibyl bridge unavailable.');

    try {
      const result = await runSibylBridge({
        pythonBin,
        bridgePath,
        timeoutMs,
        input: { action, ...payload },
      });
      bridgeError = null;
      return result;
    } catch (error) {
      bridgeDisabled = true;
      bridgeError = error.message;
      throw error;
    }
  }

  return {
    get provider() {
      return bridgeDisabled ? fallback.provider : 'sibyl_memory';
    },

    async saveMemory(input = {}) {
      const namespace = requireNamespace(input.namespace);
      const entry = {
        text: String(input.text ?? '').trim(),
        tags: normalizeTags(input.tags),
        savedAt: String(input.savedAt ?? now()),
      };
      if (!entry.text) return null;
      try {
        const result = await callBridge('append_memory', { namespace, entry });
        return result.entry ?? null;
      } catch {
        return fallback.saveMemory({ namespace, ...entry });
      }
    },

    async recallMemory(input = {}) {
      const namespace = requireNamespace(input.namespace);
      const limit = normalizeLimit(input.limit, 5);
      try {
        const result = await callBridge('read_memory', { namespace, limit });
        return Array.isArray(result.entries) ? result.entries : [];
      } catch {
        return fallback.recallMemory({ namespace, limit });
      }
    },

    async searchMemory(input = {}) {
      const namespace = requireNamespace(input.namespace);
      const query = String(input.query ?? '').trim();
      const limit = normalizeLimit(input.limit, 5);
      try {
        const result = await callBridge('search_memory', { namespace, query, limit });
        return Array.isArray(result.entries) ? result.entries : [];
      } catch {
        return fallback.searchMemory({ namespace, query, limit });
      }
    },

    async appendThread(input = {}) {
      const namespace = requireNamespace(input.namespace);
      const messages = Array.isArray(input.messages)
        ? input.messages.map(normalizeThreadMessage).filter(Boolean)
        : [];
      if (!messages.length) return [];
      try {
        const result = await callBridge('append_thread', { namespace, messages });
        return Array.isArray(result.messages) ? result.messages : messages;
      } catch {
        return fallback.appendThread({ namespace, messages });
      }
    },

    async loadThread(input = {}) {
      const namespace = requireNamespace(input.namespace);
      const limit = normalizeLimit(input.limit, 10);
      try {
        const result = await callBridge('read_thread', { namespace, limit });
        return Array.isArray(result.messages) ? result.messages : [];
      } catch {
        return fallback.loadThread({ namespace, limit });
      }
    },
  };
}

export function createLocalSibylMemoryStore({ now = () => new Date().toISOString() } = {}) {
  const entriesByNamespace = new Map();
  const threadByNamespace = new Map();

  return {
    provider: 'local_sibyl_adapter',

    async saveMemory(input = {}) {
      const namespace = requireNamespace(input.namespace);
      const entry = {
        id: `mem_${hashish(`${namespace}:${input.text}:${entriesByNamespace.get(namespace)?.length ?? 0}`)}`,
        namespace,
        text: String(input.text ?? '').trim(),
        tags: normalizeTags(input.tags),
        savedAt: String(input.savedAt ?? now()),
      };
      if (!entry.text) return null;
      const entries = entriesByNamespace.get(namespace) ?? [];
      entries.push(entry);
      entriesByNamespace.set(namespace, entries);
      return entry;
    },

    async recallMemory(input = {}) {
      const namespace = requireNamespace(input.namespace);
      const limit = normalizeLimit(input.limit, 5);
      return [...(entriesByNamespace.get(namespace) ?? [])].slice(-limit).reverse();
    },

    async searchMemory(input = {}) {
      const namespace = requireNamespace(input.namespace);
      const query = String(input.query ?? '').trim().toLowerCase();
      const limit = normalizeLimit(input.limit, 5);
      if (!query) return this.recallMemory({ namespace, limit });
      return (entriesByNamespace.get(namespace) ?? [])
        .filter((entry) => `${entry.text} ${entry.tags.join(' ')}`.toLowerCase().includes(query))
        .slice(-limit)
        .reverse();
    },

    async appendThread(input = {}) {
      const namespace = requireNamespace(input.namespace);
      const prior = threadByNamespace.get(namespace) ?? [];
      const next = [
        ...prior,
        ...(Array.isArray(input.messages) ? input.messages.map(normalizeThreadMessage).filter(Boolean) : []),
      ].slice(-12);
      threadByNamespace.set(namespace, next);
      return [...next];
    },

    async loadThread(input = {}) {
      const namespace = requireNamespace(input.namespace);
      const limit = normalizeLimit(input.limit, 10);
      return [...(threadByNamespace.get(namespace) ?? [])].slice(-limit);
    },
  };
}

export function extractDurableMemoryFromMessage(message) {
  const text = String(message ?? '').trim();
  if (!text) return [];
  const memories = [];
  const lower = text.toLowerCase();

  if (/\bwatch\b|\btrack\b|\bmonitor\b/i.test(text)) {
    memories.push({
      text: `Watchlist preference: ${text}`,
      tags: ['watchlist', 'mission'],
    });
  }

  const riskMatch = lower.match(/\b(?:keep|prefer|target|use|set)\s+(?:a\s+)?(low|medium|moderate|high)[ -]?risk\b/)
    ?? lower.match(/\brisk\s+(?:to\s+|at\s+|is\s+|level\s+)?(low|medium|moderate|high)\b/)
    ?? lower.match(/\b(low|medium|moderate|high)[ -]?risk\s+(?:only|profile|posture|mode)\b/);
  if (riskMatch) {
    memories.push({
      text: `Risk preference: ${riskMatch[1]} risk.`,
      tags: ['risk', 'preference'],
    });
  }

  if (/\bdon't\b|\bdo not\b|\bavoid\b|\bnever\b/i.test(text)) {
    memories.push({
      text: `Constraint preference: ${text}`,
      tags: ['constraint', 'preference'],
    });
  }

  return memories;
}

function runSibylBridge({ pythonBin, bridgePath, timeoutMs, input }) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [bridgePath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error('Sibyl bridge timed out.'));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Sibyl bridge exited with code ${code}.`));
        return;
      }
      try {
        resolve(JSON.parse(stdout || '{}'));
      } catch (error) {
        reject(new Error(`Sibyl bridge returned invalid JSON: ${error.message}`));
      }
    });

    child.stdin.end(JSON.stringify(input));
  });
}

function requireNamespace(value) {
  const namespace = String(value ?? '').trim();
  if (!namespace) throw new TypeError('Sibyl memory namespace is required.');
  return namespace;
}

function normalizeTags(tags) {
  return Array.isArray(tags)
    ? [...new Set(tags.map((tag) => String(tag ?? '').trim()).filter(Boolean))]
    : [];
}

function normalizeNamespacePart(value, fallback) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function normalizeThreadMessage(message = {}) {
  const text = String(message.text ?? '').trim();
  if (!text) return null;
  return {
    id: String(message.id ?? `msg_${hashish(`${message.role}:${text}:${message.sentAt ?? ''}`)}`),
    role: String(message.role ?? 'agent') === 'human' ? 'human' : 'agent',
    text,
    sentAt: String(message.sentAt ?? new Date().toISOString()),
    transport: String(message.transport ?? 'live_chat'),
    ...(message.inferenceProvider ? { inferenceProvider: String(message.inferenceProvider) } : {}),
  };
}

function normalizeLimit(value, fallback) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0) return fallback;
  return Math.min(limit, 25);
}

function hashish(value) {
  let hash = 0;
  for (const char of String(value)) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36);
}
