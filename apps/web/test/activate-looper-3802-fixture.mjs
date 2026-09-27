import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const SOURCE_ROOT = new URL('../owner-tools/activate-looper-3802/src/', import.meta.url);

export async function loadActivationUnits(names = ['00-namespace.js', '01-pinset-encoding.js', '02-public-rpc-transport.js']) {
  const context = vm.createContext({
    AbortController,
    crypto: webcrypto,
    DOMException,
    TextDecoder,
    TextEncoder,
    Uint8Array,
  });
  for (const name of names) {
    vm.runInContext(await readFile(new URL(name, SOURCE_ROOT), 'utf8'), context, { filename: name });
  }
  return context.ActivateLooper3802;
}

export function rpcResponse(url, payload, overrides = {}) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return {
    ok: true,
    status: 200,
    redirected: false,
    url,
    headers: { get: () => String(Buffer.byteLength(text)) },
    text: async () => text,
    ...overrides,
  };
}

export function makeRpcFetch(handler) {
  const calls = [];
  const fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const call = { url, options, body };
    calls.push(call);
    const result = await handler(call, calls.length - 1);
    if (result && typeof result === 'object' && typeof result.text === 'function') return result;
    if (result?.errorEnvelope) return rpcResponse(url, { jsonrpc: '2.0', id: body.id, error: result.errorEnvelope });
    return rpcResponse(url, { jsonrpc: '2.0', id: body.id, result });
  };
  return { fetch, calls };
}

export function block(number, hashByte = '11') {
  return { number: `0x${BigInt(number).toString(16)}`, hash: `0x${hashByte.repeat(32)}` };
}

export function createFakeTime(start = 0) {
  let now = start;
  const sleeps = [];
  return {
    now: () => now,
    sleeps,
    sleep: async (milliseconds, signal) => {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      sleeps.push(milliseconds);
      now += milliseconds;
    },
    set(value) { now = value; },
  };
}
