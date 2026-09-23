#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, '..');
const port = Number(process.env.CONSOLE_SKILL_PROPOSAL_SMOKE_PORT || 4184);
const route = `http://127.0.0.1:${port}/multipass/console?mock=looper`;
const chromiumPath = process.env.CHROMIUM_PATH || '/snap/bin/chromium';
const recipient = '0x2222222222222222222222222222222222222222';
const assetContract = '0x1111111111111111111111111111111111111111';
const amountBaseUnits = '1234567890123456789';

const server = spawn('pnpm', ['exec', 'vite', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: webRoot,
  env: { ...process.env, MULTIPASS_BASE: '/multipass/' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

let browser;
try {
  await waitForHttp(route, 30_000);
  browser = await chromium.launch({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox'] });
  const results = [];

  for (const width of [320, 390, 768]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('https://**/*', (requestRoute) => requestRoute.abort('blockedbyclient'));
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('.console-unverified-transfer', { state: 'visible', timeout: 30_000 });

    const result = await page.locator('.console-unverified-transfer').evaluate((surface, expected) => {
      const text = surface.textContent || '';
      const unsafeSelector = [
        'button', 'input', 'textarea', 'select', 'form', '[contenteditable="true"]',
        '[data-action]', '[data-wallet]', '[data-wallet-controller]', '[data-provider]', '[data-calldata]',
      ].join(',');
      const walletInputs = [...document.querySelectorAll('.console-looper-wallet input, .console-looper-wallet select, .console-looper-wallet textarea')];
      return {
        clientWidth: surface.clientWidth,
        scrollWidth: surface.scrollWidth,
        recipientReadable: text.includes(expected.recipient),
        contractReadable: text.includes(expected.assetContract),
        amountReadable: text.includes(expected.amountBaseUnits),
        unsafeCandidateNodes: surface.querySelectorAll(unsafeSelector).length,
        clickHandler: surface.onclick !== null,
        walletPrefillMatches: walletInputs.filter((input) => [expected.recipient, expected.assetContract, expected.amountBaseUnits].includes(input.value)).length,
        candidateInsideWalletForm: Boolean(surface.closest('.console-looper-wallet, .console-looper-wallet-send')),
      };
    }, { recipient, assetContract, amountBaseUnits });

    if (
      pageErrors.length
      || result.scrollWidth > result.clientWidth
      || !result.recipientReadable
      || !result.contractReadable
      || !result.amountReadable
      || result.unsafeCandidateNodes !== 0
      || result.clickHandler
      || result.walletPrefillMatches !== 0
      || result.candidateInsideWalletForm
    ) {
      throw new Error(`Console skill proposal ${width}px smoke failed: ${JSON.stringify({ result, pageErrors })}`);
    }
    results.push({ width, ...result });
    await context.close();
  }

  process.stdout.write(`${JSON.stringify({ ok: true, route: '/multipass/console?mock=looper', viewports: results }, null, 2)}\n`);
} finally {
  await browser?.close().catch(() => {});
  server.kill('SIGTERM');
  await new Promise((resolveExit) => {
    if (server.exitCode !== null) return resolveExit();
    server.once('exit', resolveExit);
    setTimeout(resolveExit, 5_000).unref();
  });
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Timed out waiting for ${url}\n${serverOutput}`);
}
