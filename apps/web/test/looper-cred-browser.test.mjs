import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';
import { createServer as createViteServer } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const OWNER = '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';

function cred(score, tier, { stale = false } = {}) {
  return {
    score,
    tier,
    coverage: {
      score: 45,
      label: 'PARTIAL',
      present: ['binding', 'metadata'],
      missing: ['continuity', 'erc6551Activity', 'erc8004Reputation', 'verifiedReceipts'],
    },
    freshness: {
      status: stale ? 'stale' : 'fresh',
      stale,
      cached: stale,
      ageSeconds: stale ? 901 : 0,
      maxAgeSeconds: 300,
      staleIfErrorSeconds: 86400,
      ...(stale ? { reason: 'upstream_timeout' } : {}),
    },
    methodologyVersion: 'looper-cred-v1',
    computedAt: '2026-09-26T22:00:00.000Z',
    updatedAt: '2026-09-26T22:00:00.000Z',
    status: stale ? 'stale' : 'available',
  };
}

function authoritativeRoster() {
  return {
    schema_version: '0.1.0',
    collection: 'loopers',
    owner: OWNER.toLowerCase(),
    agents: [
      {
        tokenId: '614',
        erc8004AgentId: '87043',
        chainId: 8453,
        name: '<img src=x onerror="globalThis.__credXss=true">',
        role: 'Signal operator',
        verified: true,
        cred: cred(40, 'MARGINAL'),
      },
      {
        tokenId: '615',
        erc8004AgentId: '87044',
        chainId: 8453,
        name: 'Looper #615',
        role: 'Scout',
        verified: true,
        cred: cred(41, 'MARGINAL', { stale: true }),
      },
    ],
  };
}

async function startFixtureServer() {
  const requests = [];
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/src/styles.css"></head><body><div id="root" class="record-shell multipass-console-shell"></div><script type="module">
    import { fetchOwnedLooperAgents } from '/src/loopers-console-agents.js';
    import { createMultipassConsoleSnapshot, renderMultipassConsole } from '/src/multipass-console.js';
    const agents = await fetchOwnedLooperAgents();
    const snapshot = createMultipassConsoleSnapshot({
      agents,
      state: {
        walletSnapshot: { connected: true, address: '${OWNER}' },
        consoleAuthenticatedWallet: '${OWNER}',
        consoleOwnedAgents: { status: 'loaded', agents },
        consoleSelectedAgentId: '614',
        consoleMainRosterOpen: true,
      },
    });
    document.querySelector('#root').innerHTML = renderMultipassConsole(snapshot);
    document.documentElement.dataset.ready = 'true';
  </script></body></html>`;
  const server = await createViteServer({
    root: webRoot,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'looper-cred-browser-fixture',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          requests.push(request.url);
          if (request.url === '/cred-smoke') {
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            response.end(html);
            return;
          }
          if (request.url === '/api/loopers/owned') {
            response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            response.end(JSON.stringify(authoritativeRoster()));
            return;
          }
          next();
        });
      },
    }],
  });
  await server.listen();
  const address = server.httpServer.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => server.close(),
  };
}

test('production-like Console reads authoritative CRED same-origin and fits desktop/mobile', { timeout: 60_000 }, async (t) => {
  const fixture = await startFixtureServer();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/snap/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  t.after(async () => {
    await browser.close();
    await fixture.close();
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${fixture.origin}/cred-smoke`, { waitUntil: 'domcontentloaded' });
    await page.locator('html[data-ready="true"]').waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {});
    assert.deepEqual(browserErrors, [], `browser module errors: ${browserErrors.join('; ')}`);
    assert.equal(await page.locator('html').getAttribute('data-ready'), 'true', `fixture requests: ${fixture.requests.join(', ')}`);
    const result = await page.evaluate(() => {
      const credCards = [...document.querySelectorAll('.console-cred-summary')];
      return {
        text: document.body.textContent,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        cardOverflow: credCards.some((card) => card.scrollWidth > card.clientWidth),
        labels: credCards.map((card) => card.getAttribute('aria-label')),
        injectedImage: Boolean(document.querySelector('img[src="x"]')),
        xss: Boolean(globalThis.__credXss),
      };
    });
    assert.match(result.text, /CRED 40.*MARGINAL/s);
    assert.match(result.text, /Evidence PARTIAL.*45%/s);
    assert.match(result.text, /CRED 41.*STALE/s);
    assert.match(result.text, /Stale.*15m old/s);
    assert.equal(result.overflow, false, `${viewport.width}px document overflow`);
    assert.equal(result.cardOverflow, false, `${viewport.width}px CRED card overflow`);
    assert.equal(result.injectedImage, false);
    assert.equal(result.xss, false);
    assert.equal(result.labels.every((label) => label === 'Authoritative CRED'), true);
  }

  assert.equal(fixture.requests.filter((url) => url === '/api/loopers/owned').length, 2);
  assert.equal(fixture.requests.some((url) => url.includes('api.helixa.xyz') || url.includes('/api/v2/agent/')), false);
});
