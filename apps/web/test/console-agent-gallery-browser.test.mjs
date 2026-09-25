import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';

import { chromium } from 'playwright-core';
import { createMultipassConsoleSnapshot, renderMultipassConsole } from '../src/multipass-console.js';

const OWNER = '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';
const EXPECTED_COLUMNS = new Map([
  [320, 1],
  [479, 1],
  [480, 2],
  [759, 2],
  [760, 3],
  [1119, 3],
  [1120, 4],
]);

function agents(count) {
  return Array.from({ length: count }, (_, index) => ({
    tokenId: String(index + 1),
    name: `Looper ${String(index + 1).padStart(4, '0')}`,
    role: index % 2 ? 'Scout' : 'Operator',
    credLabel: `Cred ${60 + (index % 30)}`,
    verified: true,
  }));
}

function pageMarkup({ count = 24, status = 'loaded', query = '', error = null } = {}, css = '') {
  const roster = status === 'loaded' ? agents(count) : [];
  const snapshot = createMultipassConsoleSnapshot({
    agents: roster,
    state: {
      walletSnapshot: { connected: true, address: OWNER },
      consoleAuthenticatedWallet: OWNER,
      consoleOwnedAgents: { status, error, agents: roster },
      consoleSelectedAgentId: null,
      consoleAgentGallery: { query, sort: 'token-asc', activationError: null },
    },
  });
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${css}</style></head><body><div class="record-shell multipass-console-shell">${renderMultipassConsole(snapshot)}</div></body></html>`;
}

async function startFixtureServer(css) {
  const pages = new Map([
    ['/full', pageMarkup({ count: 7_777 }, css)],
    ['/gallery', pageMarkup({ count: 24 }, css)],
    ['/tail', pageMarkup({ count: 7_777, query: '7777' }, css)],
    ['/loading', pageMarkup({ status: 'loading' }, css)],
    ['/empty', pageMarkup({ count: 0 }, css)],
    ['/filtered', pageMarkup({ count: 24, query: 'missing' }, css)],
    ['/error', pageMarkup({ status: 'error', error: 'Ownership scan failed.' }, css)],
  ]);
  const server = createServer((request, response) => {
    const html = pages.get(request.url);
    response.writeHead(html ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html ?? 'Not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('Console gallery fully renders 7,777 agents and meets responsive browser gates', { timeout: 120_000 }, async (t) => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const fixture = await startFixtureServer(css);
  const executablePath = process.env.CHROMIUM_PATH ?? '/snap/bin/chromium';
  const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
  t.after(async () => {
    await browser.close();
    await fixture.close();
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  const startedAt = performance.now();
  await page.goto(`${fixture.origin}/full`, { waitUntil: 'domcontentloaded' });
  await page.locator('.console-agent-gallery-card button').first().waitFor({ state: 'visible' });
  const interactiveMs = performance.now() - startedAt;
  assert.ok(interactiveMs < 5_000, `7,777-card gallery became interactive in ${Math.round(interactiveMs)}ms`);
  assert.equal(await page.locator('.console-agent-gallery-card').count(), 7_777);
  assert.equal(await page.locator('.console-agent-gallery-card button').count(), 7_777);
  assert.equal(await page.locator('.console-agent-gallery-card button').first().getAttribute('data-token-id'), '1');
  assert.equal(await page.locator('.console-agent-gallery-card button').last().getAttribute('data-token-id'), '7777');

  await page.goto(`${fixture.origin}/tail`, { waitUntil: 'domcontentloaded' });
  assert.equal(await page.locator('.console-agent-gallery-card').count(), 1);
  assert.equal(await page.locator('.console-agent-gallery-card button').getAttribute('data-token-id'), '7777');
  assert.equal(await page.locator('.console-agent-gallery-card button').isEnabled(), true);

  for (const [width, columns] of EXPECTED_COLUMNS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${fixture.origin}/gallery`, { waitUntil: 'domcontentloaded' });
    const measurements = await page.evaluate(() => {
      const grid = document.querySelector('.console-agent-gallery-grid');
      const controls = [...document.querySelectorAll('.console-agent-gallery input, .console-agent-gallery select, .console-agent-gallery button, .console-agent-gallery a')];
      return {
        pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        gridFits: grid.scrollWidth <= grid.clientWidth,
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
        undersized: controls.filter((control) => {
          const rect = control.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        }).map((control) => `${control.tagName}:${control.textContent?.trim() ?? ''}`),
      };
    });
    assert.equal(measurements.pageFits, true, `${width}px page must not overflow horizontally`);
    assert.equal(measurements.gridFits, true, `${width}px gallery grid must not overflow horizontally`);
    assert.equal(measurements.columns, columns, `${width}px must render ${columns} gallery columns`);
    assert.deepEqual(measurements.undersized, [], `${width}px controls must be at least 44px`);
  }

  if (process.env.CAPTURE_GALLERY === '1') {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${fixture.origin}/gallery`, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: '/home/ubuntu/.openclaw/workspace/multipass-looper-gallery-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 480, height: 920 });
    await page.goto(`${fixture.origin}/gallery`, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: '/home/ubuntu/.openclaw/workspace/multipass-looper-gallery-mobile.png', fullPage: true });
    for (const state of ['loading', 'empty', 'filtered', 'error']) {
      await page.goto(`${fixture.origin}/${state}`, { waitUntil: 'domcontentloaded' });
      await page.screenshot({ path: `/home/ubuntu/.openclaw/workspace/multipass-looper-gallery-${state}.png`, fullPage: true });
    }
  }
});
