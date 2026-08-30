export function buildSibylMemoryNamespace({ wallet, agentId, activationId } = {}) {
  const normalizedWallet = normalizeNamespacePart(wallet, 'unknown-wallet');
  const normalizedAgent = normalizeNamespacePart(agentId, 'unknown-agent');
  const normalizedActivation = normalizeNamespacePart(activationId, normalizedAgent);
  return `multipass:${normalizedWallet}:${normalizedAgent}:${normalizedActivation}`;
}

export function createLocalSibylMemoryStore({ now = () => new Date().toISOString() } = {}) {
  const entriesByNamespace = new Map();

  return {
    provider: 'local_sibyl_adapter',

    async saveMemory(input = {}) {
      const namespace = requireNamespace(input.namespace);
      const entry = {
        id: `mem_${hashish(`${namespace}:${input.text}:${entriesByNamespace.get(namespace)?.length ?? 0}`)}`,
        namespace,
        text: String(input.text ?? '').trim(),
        tags: normalizeTags(input.tags),
        savedAt: now(),
      };
      if (!entry.text) return null;
      const entries = entriesByNamespace.get(namespace) ?? [];
      entries.push(entry);
      entriesByNamespace.set(namespace, entries);
      return entry;
    },

    async recallMemory(input = {}) {
      const namespace = requireNamespace(input.namespace);
      return [...(entriesByNamespace.get(namespace) ?? [])].slice(-5).reverse();
    },

    async searchMemory(input = {}) {
      const namespace = requireNamespace(input.namespace);
      const query = String(input.query ?? '').trim().toLowerCase();
      if (!query) return this.recallMemory({ namespace });
      return (entriesByNamespace.get(namespace) ?? [])
        .filter((entry) => `${entry.text} ${entry.tags.join(' ')}`.toLowerCase().includes(query))
        .slice(-5)
        .reverse();
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

function hashish(value) {
  let hash = 0;
  for (const char of String(value)) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36);
}
