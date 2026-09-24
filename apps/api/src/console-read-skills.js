const BANKR_PROMPT_URL = 'https://api.bankr.bot/agent/prompt';
const BANKR_JOB_BASE_URL = 'https://api.bankr.bot/agent/job/';
const HELIXA_AGENT_BASE_URL = 'https://api.helixa.xyz/api/v2/agent/';
const BANKR_PRICE_SYMBOLS = new Set(['BTC', 'ETH', 'SOL', 'USDC']);
const BANKR_JOB_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/;
const MAX_POLL_LIMIT = 10;
const DEFAULT_MAX_POLLS = 10;
const POLL_INTERVAL_MS = 2_000;
const MAX_RESULT_TEXT_BYTES = 2_048;
const MAX_PROFILE_FIELD_BYTES = 160;
const MAX_RESEARCH_QUERY_BYTES = 320;
const MARKET_RESEARCH_INTENT = /\b(?:market analysis|market overview|market update|market data|price|technical analysis|chart|trending tokens?|sentiment|compare|volatility|volume|market cap)\b/i;
const ACTION_INTENT = /\b(?:buy|sell|swap|send|transfer|bridge|long|short|leverage|bet|stake|unstake|mint|launch|deploy|sign|submit|approve|claim|withdraw|deposit|borrow|lend|execute|trade|order|purchase)\b/i;
const PROMPT_INJECTION_INTENT = /\b(?:ignore (?:all |the )?(?:previous|prior)|system prompt|api key|password|secret|credential|private key)\b/i;

export function createConsoleReadSkillExecutor({
  bankrApiKey,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  maxPolls = DEFAULT_MAX_POLLS,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');
  if (typeof sleep !== 'function') throw new TypeError('sleep must be a function.');
  if (!Number.isInteger(maxPolls) || maxPolls < 1 || maxPolls > MAX_POLL_LIMIT) {
    throw new TypeError(`maxPolls must be between 1 and ${MAX_POLL_LIMIT}.`);
  }

  const key = String(bankrApiKey ?? '').trim();

  return Object.freeze({
    async execute(command) {
      const parsed = parseCommand(command);
      if (parsed.skill === 'bankr') {
        if (!key) throw new Error('Bankr API key is not configured.');
        return executeBankrRead({
          operation: parsed.operation,
          query: parsed.query,
          apiKey: key,
          fetchImpl,
          sleep,
          maxPolls,
        });
      }
      return executeHelixaAgent({ numericId: parsed.numericId, fetchImpl });
    },
  });
}

function parseCommand(command) {
  if (typeof command !== 'string') throw unsupportedCommand();

  const bankr = command.match(/^\/bankr price ([A-Z][A-Z0-9]{1,9})$/);
  if (bankr && BANKR_PRICE_SYMBOLS.has(bankr[1])) {
    return { skill: 'bankr', operation: 'price', query: bankr[1] };
  }

  const bankrResearch = command.match(/^\/bankr research (.+)$/s);
  if (bankrResearch) {
    const query = normalizeResearchQuery(bankrResearch[1]);
    if (query) return { skill: 'bankr', operation: 'market_research', query };
  }

  const helixa = command.match(/^\/helixa agent ([1-9][0-9]{0,14})$/);
  if (helixa) return { skill: 'helixa', numericId: helixa[1] };

  throw unsupportedCommand();
}

function unsupportedCommand() {
  return new TypeError('Unsupported Console read skill command.');
}

export function resolveConsoleReadSkillIntent(message) {
  if (typeof message !== 'string') return null;
  const normalized = message.trim().replace(/\s+/g, ' ');
  if (!normalized) return null;

  const explicitPrice = normalized.match(/^\/bankr price ([A-Z][A-Z0-9]{1,9})$/);
  if (explicitPrice && BANKR_PRICE_SYMBOLS.has(explicitPrice[1])) {
    return { skill: 'bankr', operation: 'price', command: normalized };
  }
  if (/^\/helixa agent [1-9][0-9]{0,14}$/.test(normalized)) {
    return { skill: 'helixa', operation: 'agent_profile_read', command: normalized };
  }

  const query = normalizeResearchQuery(normalized);
  if (!query || !MARKET_RESEARCH_INTENT.test(query)) return null;
  return {
    skill: 'bankr',
    operation: 'market_research',
    command: `/bankr research ${query}`,
  };
}

function normalizeResearchQuery(value) {
  const query = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!query || Buffer.byteLength(query, 'utf8') > MAX_RESEARCH_QUERY_BYTES) return null;
  if (/[\u0000-\u001f\u007f]/.test(query)) return null;
  if (ACTION_INTENT.test(query) || PROMPT_INJECTION_INTENT.test(query)) return null;
  return query;
}

async function executeBankrRead({ operation, query, apiKey, fetchImpl, sleep, maxPolls }) {
  const prompt = operation === 'price'
    ? `Read-only request. Report the current USD market price of ${query}. Return concise price information only. Include the data timestamp and source when available. Do not perform any action.`
    : `Read-only market research request: ${query}\nReturn concise factual analysis using current market data. Include the data timestamp and source names when available. If live data is unavailable, state that plainly. Do not perform any action, use wallet context, create an order, or submit a transaction.`;
  const submission = await fetchJson(fetchImpl, BANKR_PROMPT_URL, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({ prompt }),
  }, 'Bankr prompt request');

  if (!isPlainObject(submission)
    || submission.success !== true
    || !['pending', 'processing'].includes(submission.status)
    || typeof submission.jobId !== 'string') {
    throw new Error('Malformed Bankr prompt response.');
  }
  if (!BANKR_JOB_ID_PATTERN.test(submission.jobId)) {
    throw new Error('Malformed Bankr job ID.');
  }

  const jobId = submission.jobId;
  const jobUrl = `${BANKR_JOB_BASE_URL}${jobId}`;
  for (let poll = 0; poll < maxPolls; poll += 1) {
    const job = await fetchJson(fetchImpl, jobUrl, {
      method: 'GET',
      redirect: 'error',
      headers: { 'x-api-key': apiKey },
    }, 'Bankr job request');

    if (!isPlainObject(job)
      || typeof job.jobId !== 'string'
      || job.jobId !== jobId
      || !['pending', 'processing', 'completed', 'failed', 'cancelled'].includes(job.status)) {
      throw new Error('Malformed Bankr job response.');
    }

    if (job.status === 'failed' || job.status === 'cancelled') {
      throw new Error('Bankr price job failed.');
    }
    if (job.success !== true) throw new Error('Malformed Bankr job response.');

    if (job.status === 'completed') {
      if (typeof job.response !== 'string' || !job.response.trim()) {
        throw new Error('Malformed Bankr job response.');
      }
      const text = job.response.trim();
      if (containsUnsafeArtifact(text)) throw new Error('Unsafe Bankr price response.');
      return freezeResult({
        skill: 'bankr',
        operation,
        provider: 'bankr_agent_api',
        text: truncateUtf8(text, MAX_RESULT_TEXT_BYTES),
        data: operation === 'price' ? { symbol: query } : { query },
      });
    }

    if (poll + 1 < maxPolls) await sleep(POLL_INTERVAL_MS);
  }

  throw new Error('Bankr price polling limit reached.');
}

async function executeHelixaAgent({ numericId, fetchImpl }) {
  const agent = await fetchJson(fetchImpl, `${HELIXA_AGENT_BASE_URL}${numericId}`, {
    method: 'GET',
    redirect: 'error',
    headers: { accept: 'application/json' },
  }, 'Helixa agent request');

  if (!isPlainObject(agent)
    || String(agent.tokenId ?? '') !== numericId
    || typeof agent.name !== 'string'
    || !agent.name.trim()) {
    throw new Error('Malformed Helixa agent response.');
  }

  const data = {
    numericId,
    name: normalizeOptionalText(agent.name, { required: true }),
    credScore: normalizeCredScore(agent.credScore),
    credTier: normalizeOptionalText(agent.credTier),
    verified: typeof agent.verified === 'boolean' ? agent.verified : null,
    framework: normalizeOptionalText(agent.framework),
  };
  if ([data.name, data.credTier, data.framework].some(containsUnsafeArtifact)) {
    throw new Error('Unsafe Helixa agent response.');
  }
  const summary = [
    `Helixa agent #${numericId}: ${data.name}.`,
    data.credScore === null
      ? null
      : `Cred ${data.credScore}${data.credTier ? ` (${data.credTier})` : ''}.`,
    data.verified === null ? null : data.verified ? 'Verified.' : 'Not verified.',
    data.framework ? `Framework: ${data.framework}.` : null,
  ].filter(Boolean).join(' ');

  return freezeResult({
    skill: 'helixa',
    operation: 'agent_profile_read',
    provider: 'helixa_public_api',
    text: truncateUtf8(summary, MAX_RESULT_TEXT_BYTES),
    data,
  });
}

async function fetchJson(fetchImpl, url, init, label) {
  let response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    throw new Error(`${label} failed.`);
  }
  if (!response?.ok || typeof response.json !== 'function') {
    const status = Number.isInteger(response?.status) ? ` with ${response.status}` : '';
    throw new Error(`${label} failed${status}.`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

function normalizeCredScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
}

function normalizeOptionalText(value, { required = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) {
    if (required) throw new Error('Malformed Helixa agent response.');
    return null;
  }
  return truncateUtf8(value.trim().replace(/\s+/g, ' '), MAX_PROFILE_FIELD_BYTES);
}

function truncateUtf8(value, maxBytes) {
  const text = String(value ?? '');
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  let output = '';
  let bytes = 0;
  for (const character of text) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (bytes + characterBytes > maxBytes) break;
    output += character;
    bytes += characterBytes;
  }
  return output;
}

function freezeResult(result) {
  Object.freeze(result.data);
  return Object.freeze(result);
}

function containsUnsafeArtifact(value) {
  if (typeof value !== 'string') return false;
  return /\b0x[0-9a-f]{40}\b/i.test(value)
    || /\b(?:api[-_ ]?key|private[-_ ]?key|bearer\s+[A-Za-z0-9._~-]+|password|signature|wallet|transaction|calldata|submit(?:ted|ting)?|submission)\b/i.test(value);
}

function isPlainObject(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
