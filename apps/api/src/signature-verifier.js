import { verifyMessage } from 'viem';

export async function verifyEthereumPersonalSignature({ wallet, message, signature } = {}) {
  const address = String(wallet ?? '').trim();
  const signedMessage = String(message ?? '');
  const signatureHex = String(signature ?? '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return false;
  if (!signedMessage || !/^0x[a-fA-F0-9]+$/.test(signatureHex)) return false;

  try {
    return await verifyMessage({ address, message: signedMessage, signature: signatureHex });
  } catch {
    return false;
  }
}
