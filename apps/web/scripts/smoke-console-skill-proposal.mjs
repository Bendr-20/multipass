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
      const parseColor = (value) => {
        const match = String(value).match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
        return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])] : null;
      };
      const composite = (foreground, background) => {
        const alpha = foreground[3] + background[3] * (1 - foreground[3]);
        if (alpha === 0) return [0, 0, 0, 0];
        return [0, 1, 2].map((index) => (
          (foreground[index] * foreground[3] + background[index] * background[3] * (1 - foreground[3])) / alpha
        )).concat(alpha);
      };
      const effectiveBackground = (element) => {
        const layers = [];
        for (let current = element; current; current = current.parentElement) {
          const parsed = parseColor(getComputedStyle(current).backgroundColor);
          if (parsed && parsed[3] > 0) layers.push(parsed);
        }
        return layers.reverse().reduce((background, layer) => composite(layer, background), [255, 255, 255, 1]);
      };
      const luminance = (color) => color.slice(0, 3)
        .map((channel) => channel / 255)
        .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const contrast = (element) => {
        const foreground = parseColor(getComputedStyle(element).color);
        const background = effectiveBackground(element);
        if (!foreground) return 0;
        const brighter = Math.max(luminance(foreground), luminance(background));
        const darker = Math.min(luminance(foreground), luminance(background));
        return (brighter + 0.05) / (darker + 0.05);
      };
      const readabilityTargets = [
        surface.querySelector('header strong'),
        surface.querySelector('.console-skill-badge'),
        ...surface.querySelectorAll('dt, dd, p'),
      ].filter(Boolean);
      return {
        clientWidth: surface.clientWidth,
        scrollWidth: surface.scrollWidth,
        recipientReadable: text.includes(expected.recipient),
        contractReadable: text.includes(expected.assetContract),
        amountReadable: text.includes(expected.amountBaseUnits),
        minimumTextContrast: Math.min(...readabilityTargets.map(contrast)),
        surfaceBackgroundAlpha: parseColor(getComputedStyle(surface).backgroundColor)?.[3] ?? 0,
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
      || result.minimumTextContrast < 4.5
      || result.surfaceBackgroundAlpha !== 1
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
