import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderActivationHtml, SOURCE_MANIFEST } from './build-activate-looper-3802.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const PRODUCTION_ROOT = join(scriptDir, '..', 'owner-tools', 'activate-looper-3802');
const ALLOWED_URLS = new Set(['https://mainnet.base.org','https://base.drpc.org','https://base-rpc.publicnode.com','https://arweave.net/wC0L6LR_IGsS_SgAQFrSbnzsjVgAbOlwZcV_lbrp_v8/3802.json','https://basescan.org/tx/']);
const WALLET_METHODS = ['eth_chainId','eth_accounts','eth_requestAccounts','wallet_switchEthereumChain','eth_sendTransaction'];
const PUBLIC_METHODS = ['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_getStorageAt','eth_getBalance','eth_call','eth_estimateGas','eth_gasPrice','eth_getTransactionByHash','eth_getTransactionReceipt','debug_traceTransaction'];

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
  const source = names.map((name) => files.get(`src/${name}`)).join('\n');
  for (const method of WALLET_METHODS) if (!source.includes(method)) finding('src', `missing wallet method ${method}`);
  for (const method of PUBLIC_METHODS) if (!source.includes(method)) finding('src', `missing public method ${method}`);
  for (const forbidden of ['eth_sign','personal_sign','eth_signTransaction','wallet_addEthereumChain']) if (source.includes(forbidden)) finding('src', `forbidden wallet method ${forbidden}`);
  if ((source.match(/eth_sendTransaction/gu) || []).length > 2) finding('src', 'eth_sendTransaction appears outside allowlist/boundary');
  const output = { files: [...files.keys()].sort(), walletMethods: WALLET_METHODS, publicMethods: PUBLIC_METHODS, status: 'approved' };
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/scan-activate-looper-3802.mjs');
  const result = await scanTree(PRODUCTION_ROOT);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
