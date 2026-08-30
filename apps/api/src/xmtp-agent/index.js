export function createLocalXmtpAgentClient({ now = () => new Date().toISOString() } = {}) {
  const threads = new Map();

  return {
    provider: 'local_xmtp_adapter',

    async appendMessage({ threadId, role, text, transport, inferenceProvider } = {}) {
      const id = requireThreadId(threadId);
      const entry = {
        id: `xmtp_${threads.get(id)?.length ?? 0}`,
        role: String(role ?? 'agent'),
        text: String(text ?? '').trim(),
        sentAt: now(),
        transport: String(transport ?? 'xmtp_ready'),
        ...(inferenceProvider ? { inferenceProvider: String(inferenceProvider) } : {}),
      };
      const messages = threads.get(id) ?? [];
      messages.push(entry);
      threads.set(id, messages);
      return entry;
    },

    async getThread({ threadId } = {}) {
      return {
        threadId: requireThreadId(threadId),
        messages: [...(threads.get(threadId) ?? [])],
      };
    },
  };
}

function requireThreadId(value) {
  const threadId = String(value ?? '').trim();
  if (!threadId) throw new TypeError('XMTP thread id is required.');
  return threadId;
}
