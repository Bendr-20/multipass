export function createBankrLlmClient({
  apiKey,
  model = 'claude-haiku-4.5',
  fetchImpl = fetch,
} = {}) {
  const key = String(apiKey ?? '').trim();
  if (!key) return null;

  return {
    provider: 'bankr_llm_gateway',

    async generate({ profile, message, memory = [], signals = [] } = {}) {
      const response = await fetchImpl('https://llm.bankr.bot/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: buildSystemPrompt(profile),
            },
            {
              role: 'user',
              content: JSON.stringify({
                message,
                memory,
                signals,
              }),
            },
          ],
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error?.message ?? `Bankr LLM Gateway request failed with ${response.status}.`);
      }
      return {
        provider: 'bankr_llm_gateway',
        text: body?.choices?.[0]?.message?.content ?? body?.content?.[0]?.text ?? 'Bankr LLM returned an empty response.',
      };
    },
  };
}

function buildSystemPrompt(profile = {}) {
  return [
    `You are ${profile.displayName ?? 'an activated Looper agent'} inside Multipass Console.`,
    'Use remembered context and signals to produce concise operator briefings.',
    'Never claim to execute trades, transfer assets, or control custody.',
    'Draft review-only proposals when useful.',
  ].join('\n');
}
