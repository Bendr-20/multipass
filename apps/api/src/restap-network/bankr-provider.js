const CHAT_URL = 'https://llm.bankr.bot/zdr/v1/chat/completions';
const USAGE_URL = 'https://llm.bankr.bot/v1/usage?days=90';
const DEFAULT_MODEL = 'claude-haiku-4.5';
const DEFAULT_MAX_TOKENS = 512;

/**
 * Minimal, public-relay-only Bankr adapter.  It deliberately exposes neither
 * tools nor provider details: a privacy or response-shape failure is simply
 * an unavailable inference provider to its caller.
 */
export function createRestapNetworkBankrGateway({
  apiKey,
  model = DEFAULT_MODEL,
  maxTokens = DEFAULT_MAX_TOKENS,
  fetchImpl = fetch,
} = {}) {
  const key = text(apiKey, 'Bankr API key', 512);
  const selectedModel = text(model, 'Bankr model', 256);
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 4_096) throw new TypeError('Bankr max tokens is invalid.');
  if (typeof fetchImpl !== 'function') throw new TypeError('Bankr fetch implementation is invalid.');
  let dispatchedTotal = 0;

  async function generatePublicReply(projection) {
    const normalized = normalizeProjection(projection);
    try {
      dispatchedTotal += 1;
      const response = await fetchImpl(CHAT_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({
          model: selectedModel,
          max_tokens: maxTokens,
          temperature: 0,
          messages: [
            { role: 'system', content: normalized.systemInstruction },
            { role: 'user', content: normalized.userDataJson },
          ],
        }),
      });
      if (!response?.ok || response.headers?.get?.('x-privacy-tier') !== 'zdr') throw unavailable();
      const body = await response.json();
      const message = body?.choices?.[0]?.message;
      if (!message || Object.hasOwn(message, 'tool_calls') || typeof message.content !== 'string' || !validUsage(body?.usage)) throw unavailable();
      return message.content;
    } catch (error) {
      if (error?.message === 'RESTAP network Bankr inference unavailable.') throw error;
      throw unavailable();
    }
  }

  async function readUsageTotals() {
    try {
      const response = await fetchImpl(USAGE_URL, { method: 'GET', headers: { 'x-api-key': key } });
      if (!response?.ok) throw unavailable();
      const body = await response.json();
      const totalRequests = body?.totals?.totalRequests;
      if (!Number.isSafeInteger(totalRequests) || totalRequests < 0) throw unavailable();
      return Object.freeze({ totalRequests });
    } catch (error) {
      if (error?.message === 'RESTAP network Bankr inference unavailable.') throw error;
      throw unavailable();
    }
  }

  return Object.freeze({ generatePublicReply, readUsageTotals, readDispatchedTotal: () => dispatchedTotal });
}

export function createRestapNetworkProviderBudget({ readProviderRequestTotal, readDurableChargedUnits } = {}) {
  if (typeof readProviderRequestTotal !== 'function') throw new TypeError('Provider request total reader is invalid.');
  if (typeof readDurableChargedUnits !== 'function') throw new TypeError('Durable charged units reader is invalid.');
  const initialDurable = nonNegative(readDurableChargedUnits(), 'Durable charged units');
  let baselineProvider = null;
  const baselineDurable = 0;
  let previousProvider = null;

  async function read() {
    const providerTotal = nonNegative(await readProviderRequestTotal(), 'Provider request total');
    const durableTotal = nonNegative(readDurableChargedUnits(), 'Durable charged units');
    if (previousProvider !== null && providerTotal < previousProvider) throw new Error('RESTAP network provider request total regressed.');
    if (durableTotal < baselineDurable) throw new Error('RESTAP network durable charged units regressed.');
    if (baselineProvider === null) {
      if (durableTotal < initialDurable) throw new Error('RESTAP network durable charged units regressed.');
      baselineProvider = providerTotal - initialDurable;
    }
    previousProvider = providerTotal;
    const providerChargedUnits = providerTotal - baselineProvider;
    const durableChargedUnits = durableTotal - baselineDurable;
    return Object.freeze({
      providerChargedUnits,
      durableChargedUnits,
      unknownChargeUnits: 0,
    });
  }
  return Object.freeze({ read });
}

function normalizeProjection(value) {
  if (!plain(value) || Object.keys(value).sort().join(',') !== 'responseContract,systemInstruction,userDataJson') throw new TypeError('RESTAP network public projection is invalid.');
  if (!plain(value.responseContract) || value.responseContract.type !== 'text' || !Number.isSafeInteger(value.responseContract.maxUtf8Bytes) || value.responseContract.maxUtf8Bytes < 1) throw new TypeError('RESTAP network response contract is invalid.');
  return Object.freeze({
    systemInstruction: text(value.systemInstruction, 'RESTAP system instruction', 32 * 1024),
    userDataJson: text(value.userDataJson, 'RESTAP user data', 64 * 1024),
  });
}
function validUsage(value) {
  return plain(value) && ['prompt_tokens', 'completion_tokens', 'total_tokens'].every((key) => Number.isSafeInteger(value[key]) && value[key] >= 0)
    && value.total_tokens === value.prompt_tokens + value.completion_tokens;
}
function nonNegative(value, label) { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(label + ' is invalid.'); return value; }
function text(value, label, maximum) { if (typeof value !== 'string' || !value || Buffer.byteLength(value, 'utf8') > maximum || /[\u0000-\u001f\u007f]/u.test(value)) throw new TypeError(label + ' is invalid.'); return value; }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function unavailable() { return new Error('RESTAP network Bankr inference unavailable.'); }
