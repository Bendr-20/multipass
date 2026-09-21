import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import http from 'node:http';
import { chromium } from 'playwright-core';

const chromiumPath = process.env.CHROMIUM_PATH || '/snap/bin/chromium';
const pagePath = new URL('../owner-tools/activate-looper-3802/index.html', import.meta.url);
const approvedOrigins = new Set(['https://mainnet.base.org','https://base.drpc.org','https://base-rpc.publicnode.com']);
const approvedMethods = new Set(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_getStorageAt','eth_getBalance','eth_call','eth_estimateGas','eth_gasPrice','eth_getTransactionByHash','eth_getTransactionReceipt','debug_traceTransaction']);
const timeout = AbortSignal.timeout(90000);
let browser; let server;

try {
  await access(chromiumPath, constants.X_OK);
  const html = await readFile(pagePath);
  server = http.createServer((request, response) => {
    if (request.method === 'GET' && (request.url === '/activate-looper-3802/' || request.url === '/activate-looper-3802/index.html')) { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': html.length }); response.end(html); return; }
    if (request.method === 'GET' && request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    response.writeHead(404); response.end('not found');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address(); const route = `http://127.0.0.1:${port}/activate-looper-3802/`;
  browser = await chromium.launch({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox'] });
  const results = []; const methodInventory = new Set(); let sendCount = 0;
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    if (timeout.aborted) throw timeout.reason;
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage(); const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('https://**/*', async (routeRequest) => {
      const request = routeRequest.request(); const url = new URL(request.url()); const origin = url.origin;
      if (!approvedOrigins.has(origin) || request.method() !== 'POST' || url.search) return routeRequest.abort('blockedbyclient');
      let body; try { body = JSON.parse(request.postData() || ''); } catch { return routeRequest.abort('blockedbyclient'); }
      if (!approvedMethods.has(body.method) || /send|sign|personal|wallet_/iu.test(body.method)) { sendCount += 1; return routeRequest.abort('blockedbyclient'); }
      methodInventory.add(body.method);
      return routeRequest.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32005, message: 'bounded smoke outage' } }) });
    });
    const response = await page.goto(route, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('#page-state')?.dataset.busy === 'false', null, { timeout: 30000 });
    const result = await page.evaluate(() => ({
      noindex: document.querySelector('meta[name="robots"]')?.content,
      scripts: document.scripts.length,
      activateDisabled: document.querySelector('#activate')?.disabled,
      transactionHasLink: Boolean(document.querySelector('#transaction a')),
      walletInjected: Boolean(window.ethereum),
      storageWrites: localStorage.length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      status: document.querySelector('#status')?.textContent,
      facts: [document.querySelector('#account')?.textContent, document.querySelector('#identity-id')?.textContent],
    }));
    if (response?.status() !== 200 || result.noindex !== 'noindex, nofollow, noarchive' || result.scripts !== 1 || !result.activateDisabled || result.transactionHasLink || result.walletInjected || result.storageWrites !== 0 || result.overflow || pageErrors.length || !result.facts[0]?.includes('0x88a30C57') || result.facts[1] !== '90994') throw new Error(`No-wallet ${viewport.name} smoke failed: ${JSON.stringify({ result, pageErrors })}`);
    results.push({ viewport: viewport.name, passed: true, status: result.status }); await context.close();
  }
  process.stdout.write(`${JSON.stringify({ route: '/activate-looper-3802/', viewports: results, publicMethods: [...methodInventory].sort(), walletInjected: false, storageWrites: 0, sendCount }, null, 2)}\n`);
  if (sendCount !== 0) throw new Error('No-wallet smoke observed a send/sign-capable request.');
} finally {
  await browser?.close().catch(() => {});
  await new Promise((resolve) => server ? server.close(resolve) : resolve());
}
