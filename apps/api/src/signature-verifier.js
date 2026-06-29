import { createPublicClient, http, verifyMessage as verifyEoaMessage } from 'viem';
import { base } from 'viem/chains';

const DEFAULT_BASE_RPC_URL = 'https://mainnet.base.org';

function isValidWallet(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function isValidSignature(signature) {
  return /^0x[a-fA-F0-9]+$/.test(signature);
}

function createDefaultClient() {
  return createPublicClient({
    chain: base,
    transport: http(process.env.MULTIPASS_BASE_RPC_URL || DEFAULT_BASE_RPC_URL),
  });
}

export function createEthereumPersonalSignatureVerifier({ client = createDefaultClient() } = {}) {
  return async function verifyEthereumPersonalSignature({ wallet, message, signature } = {}) {
    const address = String(wallet ?? '').trim();
    const signedMessage = String(message ?? '');
    const signatureHex = String(signature ?? '').trim();
    if (!isValidWallet(address)) return false;
    if (!signedMessage || !isValidSignature(signatureHex)) return false;

    try {
      if (await verifyEoaMessage({ address, message: signedMessage, signature: signatureHex })) return true;
    } catch {}

    if (typeof client?.verifyMessage !== 'function') return false;
    try {
      return await client.verifyMessage({ address, message: signedMessage, signature: signatureHex });
    } catch {
      return false;
    }
  };
}

export const verifyEthereumPersonalSignature = createEthereumPersonalSignatureVerifier();
