import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderActivationHtml, SOURCE_MANIFEST } from './build-activate-looper-3802.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const PRODUCTION_ROOT = join(scriptDir, '..', 'owner-tools', 'activate-looper-3802');
const ALLOWED_URLS = new Set(['https://mainnet.base.org','https://base.drpc.org','https://base-rpc.publicnode.com','https://arweave.net/wC0L6LR_IGsS_SgAQFrSbnzsjVgAbOlwZcV_lbrp_v8/3802.json','https://basescan.org/tx/']);
const WALLET_METHODS = ['eth_chainId','eth_accounts','eth_requestAccounts','wallet_switchEthereumChain','eth_sendTransaction'];
const PUBLIC_METHODS = ['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_getStorageAt','eth_getBalance','eth_call','eth_estimateGas','eth_gasPrice','eth_getTransactionByHash','eth_getTransactionReceipt','debug_traceTransaction'];
const APPROVED_METHODS = new Set([...WALLET_METHODS, ...PUBLIC_METHODS]);
const APPROVED_SELECTORS = new Set(['0x8da5cb5b','0x6352211e','0x056d5afe','0xb3dd12a2','0x0df783f8','0x0be76ed6','0x246a0021','0x5adbbdce','0x4c4a2696','0xf195e791','0x134e18f4','0x4d69ebc2','0x158e711d','0xc87b56dd','0x5c60da1b','0xb0d691fe','0xfc0c546a','0xc19d93fb','0x523e3260','0xb61d27f6','0x34fcd5be','0x2c2abd1e','0x1fad948c','0xa6193531','0x8a54c52f']);
const APPROVED_STORAGE_NAMES = new Set(['loopers.walletActivation','loopers.walletActivation.8453.3802.v1','loopers.walletActivation.8453.3802.submit.v1']);

function finding(path, message) { throw new Error(`${path}: ${message}`); }
export async function scanTree(root = PRODUCTION_ROOT) {
  const srcDir = join(root, 'src');
  const names = (await readdir(srcDir)).sort();
  const expected = [...SOURCE_MANIFEST];
  if (JSON.stringify(names) !== JSON.stringify([...expected].sort())) finding('src', 'source manifest mismatch');
  const files = new Map();
  for (const name of names) files.set(`src/${name}`, await readFile(join(srcDir, name), 'utf8'));
  files.set('index.template.html', await readFile(join(root, 'index.template.html'), 'utf8'));
  files.set('index.html', await readFile(join(root, 'index.html'), 'utf8'));
  const expectedHtml = renderActivationHtml({ template: files.get('index.template.html'), sourceFiles: Object.fromEntries(expected.map((name) => [name, files.get(`src/${name}`)])) });
  if (files.get('index.html') !== expectedHtml) finding('index.html', 'generated artifact is stale');
  const template = files.get('index.template.html');
  if ((template.match(/<script/gu) || []).length !== 1 || /<script[^>]+src=/iu.test(template)) finding('index.template.html', 'must contain exactly one inline script');
  if (!/noindex, nofollow, noarchive/iu.test(template)) finding('index.template.html', 'missing noindex contract');
  const all = [...files.entries()].map(([path, text]) => ({ path, text }));
  for (const { path, text } of all) {
    const urls = text.match(/https:\/\/[^\s'"`<>)\]}]+/gu) || [];
    for (const raw of urls) {
      const value = raw.startsWith('https://basescan.org/tx/') ? 'https://basescan.org/tx/' : raw.replace(/[;,]+$/u, '');
      if (!ALLOWED_URLS.has(value)) finding(path, `unapproved URL ${raw}`);
    }
    if (/private[_ -]?key|seed phrase|mnemonic|api[_ -]?key/iu.test(text)) finding(path, 'secret-like material');
    if (/sessionStorage|indexedDB|document\.cookie/iu.test(text)) finding(path, 'alternate browser storage');
    if (/\b(?:for|while)\s*\([^)]*(?:token|collection|batch)/iu.test(text)) finding(path, 'collection-wide batch loop');
  }
  const allowedGlobal = {
    fetch: new Set(['src/02-public-rpc-transport.js','src/09-bootstrap.js']),
    'window.ethereum': new Set(['src/09-bootstrap.js']),
    localStorage: new Set(['src/09-bootstrap.js']),
    'navigator.locks': new Set(['src/09-bootstrap.js']),
  };
  for (const [token, paths] of Object.entries(allowedGlobal)) for (const { path, text } of all) if (text.includes(token) && !paths.has(path) && path !== 'index.html') finding(path, `misplaced ${token}`);
  for (const { path, text } of all) {
    if (/provider\.request\s*\(/u.test(text) && !['src/04-wallet-boundary.js','src/09-bootstrap.js'].includes(path) && path !== 'index.html') finding(path, 'misplaced provider request');
    if (/navigator(?:\?\.|\.)locks/gu.test(text) && path !== 'src/09-bootstrap.js' && path !== 'index.html') finding(path, 'misplaced Web Locks capability');
    if (text.includes('debug_traceTransaction') && path !== 'src/02-public-rpc-transport.js' && path !== 'index.html') finding(path, 'trace method outside transport');
    if (/URLSearchParams|location\.(?:search|hash)|[?&](?:rpc|provider|target)=/iu.test(text)) finding(path, 'dynamic URL or configuration input');
  }
  const source = names.map((name) => files.get(`src/${name}`)).join('\n');
  for (const method of WALLET_METHODS) if (!source.includes(method)) finding('src', `missing wallet method ${method}`);
  for (const method of PUBLIC_METHODS) if (!source.includes(method)) finding('src', `missing public method ${method}`);
  for (const match of source.matchAll(/(['"])((?:eth|wallet|personal|debug)_[A-Za-z0-9_]+)\1/gu)) if (!APPROVED_METHODS.has(match[2])) finding('src', `unapproved wallet/public method ${match[2]}`);
  for (const match of source.matchAll(/(['"])(0x[0-9a-fA-F]{8})\1/gu)) if (!APPROVED_SELECTORS.has(match[2].toLowerCase())) finding('src', `unapproved selector ${match[2]}`);
  for (const match of source.matchAll(/loopers\.walletActivation[^'"\s]*/gu)) if (!APPROVED_STORAGE_NAMES.has(match[0])) finding('src', `unapproved activation storage key ${match[0]}`);
  if ((source.match(/eth_sendTransaction/gu) || []).length !== 2) finding('src', 'eth_sendTransaction appears outside exact allowlist/boundary');
  const output = { files: [...files.keys()].sort(), walletMethods: WALLET_METHODS, publicMethods: PUBLIC_METHODS, status: 'approved' };
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/scan-activate-looper-3802.mjs');
  const result = await scanTree(PRODUCTION_ROOT);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
