const BANKR_PROMPT_URL = 'https://api.bankr.bot/agent/prompt';
const BANKR_JOB_BASE_URL = 'https://api.bankr.bot/agent/job/';
const HELIXA_AGENT_BASE_URL = 'https://api.helixa.xyz/api/v2/agent/';
const BANKR_PRICE_SYMBOLS = new Set(['BTC', 'ETH', 'SOL', 'USDC']);
const BANKR_JOB_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/;
const MAX_POLL_LIMIT = 10;
const DEFAULT_MAX_POLLS = 5;
const POLL_INTERVAL_MS = 1_000;
const MAX_RESULT_TEXT_BYTES = 2_048;
const MAX_PROFILE_FIELD_BYTES = 160;

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
        return executeBankrPrice({
          symbol: parsed.symbol,
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
    return { skill: 'bankr', symbol: bankr[1] };
  }

  const helixa = command.match(/^\/helixa agent ([1-9][0-9]{0,14})$/);
  if (helixa) return { skill: 'helixa', numericId: helixa[1] };

  throw unsupportedCommand();
}

function unsupportedCommand() {
  return new TypeError('Unsupported Console read skill command.');
}

async function executeBankrPrice({ symbol, apiKey, fetchImpl, sleep, maxPolls }) {
  const submission = await fetchJson(fetchImpl, BANKR_PROMPT_URL, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      prompt: `Read-only request. Report the current USD market price of ${symbol}. Return concise price information only. Do not perform any action.`,
    }),
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
        operation: 'price',
        provider: 'bankr_agent_api',
        text: truncateUtf8(text, MAX_RESULT_TEXT_BYTES),
        data: { symbol },
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
