#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, '..');
const repoRoot = resolve(webRoot, '..', '..');
const port = Number(process.env.LOOPER_SMOKE_PORT || 4175);
const devServerUrl = `http://127.0.0.1:${port}`;
const smokeUrl = `${devServerUrl}/looper-mint-browser-smoke.html?mint=sepolia`;
const contractAddress = '0xd195ADC09A654d6A87319f9c6a2b3169b5A5ce16';
const rpcUrl = 'https://base-sepolia-rpc.publicnode.com';
const chainId = 84532;
const chainHex = '0x14a34';
const chromiumPath = process.env.CHROMIUM_PATH || '/snap/bin/chromium';

const secret = JSON.parse(execFileSync('aws', [
  'secretsmanager',
  'get-secret-value',
  '--secret-id',
  'helixa/deployer-key',
  '--query',
  'SecretString',
  '--output',
  'text',
], { encoding: 'utf8' }));

const account = privateKeyToAccount(secret.DEPLOYER_PRIVATE_KEY);
const wallet = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(rpcUrl),
});

const { spawn } = await import('node:child_process');
const devServer = spawn('pnpm', ['exec', 'vite', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: webRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOutput = '';
devServer.stdout.on('data', (chunk) => {
  serverOutput += chunk.toString();
});
devServer.stderr.on('data', (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForHttp(smokeUrl, 30_000);

  const browser = await chromium.launch({
    executablePath: chromiumPath,
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1480, height: 1180 },
      deviceScaleFactor: 1,
    });

    await page.exposeFunction('__looperWalletRequest', async (payload = {}) => {
      const method = payload?.method;
      if (method === 'eth_requestAccounts') return [account.address];
      if (method === 'eth_accounts') return [account.address];
      if (method === 'eth_chainId') return chainHex;
      if (method === 'wallet_switchEthereumChain') {
        const requested = payload?.params?.[0]?.chainId;
        if (requested && String(requested).toLowerCase() !== chainHex) {
          throw createRpcError(`Unsupported chain ${requested}`, 4902);
        }
        return null;
      }
      if (method === 'eth_sendTransaction') {
        const tx = payload?.params?.[0] ?? {};
        if (!tx.to) throw new Error('Missing transaction target');
        return wallet.sendTransaction({
          account,
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : 0n,
          gas: tx.gas ? BigInt(tx.gas) : undefined,
        });
      }
      throw createRpcError(`Unsupported wallet method ${method}`, 4200);
    });

    await page.addInitScript(() => {
      window.ethereum = {
        isMetaMask: true,
        request(payload) {
          return window.__looperWalletRequest(payload);
        },
      };
      window.dispatchEvent(new Event('ethereum#initialized'));
    });

    await page.goto(smokeUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('.looper-mint-panel');
    await expectText(page, '.looper-mint-note', /connect a wallet/i);

    await page.click('[data-action="connect-looper-mint-wallet"]');
    await expectText(page, '.looper-mint-wallet strong', /0x3395\.\.\.80E0/i);
    await expectText(page, '.looper-mint-note.success', /public mint active with adapter8004 bind/i);

    const submitButton = page.locator('.looper-mint-form button[type="submit"]');
    await submitButton.waitFor({ state: 'visible' });
    await submitButton.click();

    const status = page.locator('.looper-mint-status.success');
    await status.waitFor({ state: 'visible', timeout: 90_000 });
    const statusText = await status.textContent();

    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').replace('T', 'T').replace('Z', 'Z');
    const shotDir = resolve(repoRoot, '..', '.openclaw', 'workspace', 'tmpshots');
    await mkdir(shotDir, { recursive: true });
    const screenshotPath = join(shotDir, `loopers-browser-mint-smoke-${timestamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const summary = {
      ok: true,
      smokeUrl,
      wallet: account.address,
      statusText: statusText?.trim() ?? '',
      screenshotPath,
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
  }
} finally {
  devServer.kill('SIGTERM');
}

function createRpcError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}\n${serverOutput}`);
}

async function expectText(page, selector, pattern) {
  await page.waitForFunction(
    ({ targetSelector, source, flags }) => {
      const node = document.querySelector(targetSelector);
      if (!node) return false;
      return new RegExp(source, flags).test(node.textContent || '');
    },
    { targetSelector: selector, source: pattern.source, flags: pattern.flags },
    { timeout: 30_000 },
  );
}
