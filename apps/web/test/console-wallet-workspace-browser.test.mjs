import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';

import { chromium } from 'playwright-core';
import { createMultipassConsoleSnapshot, renderMultipassConsole } from '../src/multipass-console.js';

const OWNER = '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';
const ACCOUNT = '0xf2FF55E53f45114f22Fa842C5521B6A3Ced31339';

function walletMarkup(css) {
  const agent = {
    tokenId: '612',
    name: 'Looper #612',
    role: 'Operator',
    credLabel: 'Cred pending',
    verified: true,
  };
  const snapshot = createMultipassConsoleSnapshot({
    agents: [agent],
    state: {
      walletSnapshot: { connected: true, address: OWNER },
      consoleAuthenticatedWallet: OWNER,
      consoleOwnedAgents: { status: 'loaded', agents: [agent] },
      consoleSelectedAgentId: '612',
      consoleWorkspaceView: 'wallet',
      looperAgentWallet: {
        mode: 'active',
        tokenId: '612',
        owner: OWNER,
        account: ACCOUNT,
        nativeWei: '1250000000000000000',
        tokens: [{
          contract: '0x4444444444444444444444444444444444444444',
          symbol: 'CRED',
          decimals: 18,
          balanceBaseUnits: '2500000000000000000',
        }],
        policyStatus: 'owner-only',
        policyRecoveryAllowed: true,
        operatorProfile: 'eip7702',
        canTransact: true,
        activation: { state: 'idle' },
        send: { state: 'idle' },
        policy: { state: 'idle' },
      },
    },
  });
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${css}</style></head><body><div class="record-shell multipass-console-shell">${renderMultipassConsole(snapshot)}</div></body></html>`;
}

function codexMarkup(css) {
  const agent = { tokenId: '617', name: 'Looper #617', role: 'Researcher', credLabel: 'Cred pending', verified: true };
  const artifactHash = 'a'.repeat(64);
  const envelope = (operation, result) => ({
    schemaVersion: '1.0.0', artifactHash, codexVersion: 'traits-v1', operation, subjectIds: [617], evidence: [], result,
  });
  const snapshot = createMultipassConsoleSnapshot({
    agents: [agent],
    state: {
      walletSnapshot: { connected: true, address: OWNER },
      consoleAuthenticatedWallet: OWNER,
      consoleOwnedAgents: { status: 'loaded', agents: [agent] },
      consoleSelectedAgentId: '617',
      consoleWorkspaceView: 'codex',
      consoleAgentThread: { status: 'inactive', messages: [] },
      consoleCodex: {
        status: 'ready', selectedTokenId: '617', artifactHash, codexVersion: 'traits-v1',
        profile: envelope('getTokenProfile', {
          identity: { tokenId: 617, canonicalName: 'Looper #617', description: 'Verified Looper.' },
          visualTraits: [{ type: 'Background', value: 'Nebula' }, { type: 'Artifact', value: 'Nyan Cat' }],
          interpretation: {
            primaryClass: 'Researcher', secondaryClass: 'Builder', specialization: 'signal cartographer',
            risk: { value: 4, label: 'Balanced' }, autonomy: { value: 6, label: 'Guided' }, voice: 'Precise',
            quirks: ['Maps every signal'], communicationStyle: ['Short and clear'], values: ['Evidence'], humor: ['Dry'],
            origin: 'Forged in the archive', missionBias: 'Trace signal', shortLore: 'Keeps the receipts.',
            longLore: 'A longer verified story.', firstMission: 'Map the signal',
            recommendedSkills: [{ family: 'research', skill: 'x-research', status: 'recommended' }],
          },
        }),
        explanation: envelope('explainTraits', {
          tokenId: 617,
          traits: [{ type: 'Background', value: 'Nebula', frequency: { numerator: 4, denominator: 7777, ppm: 514 } }],
        }),
        similarity: envelope('findSimilar', {
          tokenId: 617,
          items: [{ tokenId: 700, canonicalName: 'Looper #700', scorePpm: 600000, sharedTraits: [{ type: 'Background', value: 'Nebula' }] }],
        }),
      },
    },
  });
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${css}</style></head><body><div class="record-shell multipass-console-shell">${renderMultipassConsole(snapshot)}</div></body></html>`;
}

async function startFixtureServer(html) {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function measureOverflow(page, selector) {
  return page.locator(selector).evaluateAll((nodes, measuredSelector) => nodes.map((node) => ({
    selector: measuredSelector,
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
    fits: node.scrollWidth <= node.clientWidth,
  })), selector);
}

test('wallet workspace is balance-first and keeps send and advanced controls contained on mobile', { timeout: 90_000 }, async (t) => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const fixture = await startFixtureServer(walletMarkup(css));
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH ?? '/snap/bin/chromium',
    args: ['--no-sandbox'],
  });
  t.after(async () => {
    await browser.close();
    await fixture.close();
  });

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(fixture.origin, { waitUntil: 'domcontentloaded' });
  await page.locator('.console-wallet-workspace').waitFor({ state: 'visible' });

  assert.equal(await page.locator('.console-looper-wallet-hero').isVisible(), true);
  assert.equal(await page.locator('.console-looper-wallet-asset-row').count(), 2);
  assert.equal(await page.locator('.console-workspace-nav-mobile').isVisible(), true);
  assert.equal(await page.locator('.console-workspace-sidebar .console-workspace-nav').isVisible(), false);
  const mobileOrder = await page.evaluate(() => {
    const switcher = document.querySelector('.console-agent-switcher-mobile');
    const nav = document.querySelector('.console-workspace-nav-mobile');
    const main = document.querySelector('.console-workspace-main');
    const sidebar = document.querySelector('.console-workspace-sidebar');
    return {
      switcherTop: switcher?.getBoundingClientRect().top ?? Infinity,
      navTop: nav?.getBoundingClientRect().top ?? Infinity,
      mainTop: main?.getBoundingClientRect().top ?? Infinity,
      sidebarVisible: Boolean(sidebar && getComputedStyle(sidebar).display !== 'none'),
    };
  });
  assert.ok(mobileOrder.switcherTop < mobileOrder.navTop, 'mobile agent switcher must precede workspace navigation');
  assert.ok(mobileOrder.navTop < mobileOrder.mainTop, 'mobile workspace navigation must precede the wallet workspace');
  assert.equal(mobileOrder.sidebarVisible, false, 'mobile identity sidebar must stay hidden until Multipass is selected');
  assert.equal(await page.locator('[data-wallet-action="advanced"]').getAttribute('open'), null);
  assert.equal(await page.locator('.console-looper-wallet-policy').isVisible(), false);

  for (const action of ['send', 'receive', 'advanced']) {
    await page.locator(`[data-wallet-action="${action}"] > summary`).click();
  }

  const selectors = [
    'html',
    'body',
    '.console-workspace-grid',
    '.console-workspace-main',
    '.console-wallet-workspace',
    '.console-looper-wallet-workspace',
    '.console-looper-wallet-action',
    '.console-looper-wallet-send',
    '.console-looper-wallet-confirm',
    '.console-looper-wallet-policy',
  ];
  const measurements = (await Promise.all(selectors.map((selector) => measureOverflow(page, selector)))).flat();
  assert.deepEqual(measurements.filter((measurement) => !measurement.fits), []);

  const checkbox = await page.locator('.console-looper-wallet-send input[type="checkbox"]').first().boundingBox();
  assert.ok(checkbox && checkbox.width <= 24, `confirmation checkbox width was ${checkbox?.width ?? 'missing'}px`);
  const sendButton = await page.locator('.console-looper-wallet-send button[type="submit"]').first().boundingBox();
  assert.ok(sendButton && sendButton.x + sendButton.width <= 390, 'send button must remain inside the mobile viewport');

  await page.screenshot({ path: '/home/ubuntu/.openclaw/workspace/multipass-wallet-redesign-mobile-actions.png', fullPage: true });
  await page.goto(fixture.origin, { waitUntil: 'domcontentloaded' });
  await page.locator('.console-wallet-workspace').waitFor({ state: 'visible' });
  await page.screenshot({ path: '/home/ubuntu/.openclaw/workspace/multipass-wallet-redesign-mobile.png', fullPage: true });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(fixture.origin, { waitUntil: 'domcontentloaded' });
  await page.locator('.console-wallet-workspace').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.console-workspace-nav-mobile').isVisible(), false);
  assert.equal(await page.locator('.console-workspace-sidebar .console-workspace-nav').isVisible(), true);
  const assetWidths = await page.evaluate(() => {
    const ledger = document.querySelector('.console-looper-wallet-balances');
    return [...document.querySelectorAll('.console-looper-wallet-asset-row')].map((row) => ({
      ledger: ledger?.getBoundingClientRect().width ?? 0,
      row: row.getBoundingClientRect().width,
    }));
  });
  assert.equal(assetWidths.every(({ ledger, row }) => Math.abs(ledger - row) < 1), true);
  await page.screenshot({ path: '/home/ubuntu/.openclaw/workspace/multipass-wallet-redesign-desktop.png', fullPage: true });
});

test('Codex workspace has no horizontal overflow and every drawer summary stays reachable at 390px', { timeout: 90_000 }, async (t) => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const fixture = await startFixtureServer(codexMarkup(css));
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH ?? '/snap/bin/chromium',
    args: ['--no-sandbox'],
  });
  t.after(async () => {
    await browser.close();
    await fixture.close();
  });

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(fixture.origin, { waitUntil: 'domcontentloaded' });
  await page.locator('.console-codex-workspace').waitFor({ state: 'visible' });

  const measurements = (await Promise.all([
    'html', 'body', '.console-workspace-grid', '.console-workspace-main',
    '.console-codex-workspace', '.console-codex-header', '.console-codex-facts', '.console-codex-drawers',
  ].map((selector) => measureOverflow(page, selector)))).flat();
  assert.deepEqual(measurements.filter((measurement) => !measurement.fits), []);

  const summaries = page.locator('details.console-codex-drawer > summary');
  assert.equal(await summaries.count(), 5);
  for (let index = 0; index < 5; index += 1) {
    const summary = summaries.nth(index);
    await summary.scrollIntoViewIfNeeded();
    assert.equal(await summary.isVisible(), true);
    const box = await summary.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `drawer summary ${index + 1} must remain inside the viewport`);
  }
});
