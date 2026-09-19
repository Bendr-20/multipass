import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const rootPackage = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
const allowlistEntryScript = readFileSync(new URL('../scripts/write-allowlist-entry.mjs', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const PRIVY_APP_ID = 'cmlv6ibdm00350el2jsm8m8s6';

function rootWebBuildScript() {
  return rootPackage.scripts?.['web:build'] ?? '';
}

test('production web build includes the public Privy app id', () => {
  assert.match(rootWebBuildScript(), new RegExp(`VITE_PRIVY_APP_ID=${PRIVY_APP_ID}`));
});

test('current built web bundle includes the public Privy app id', () => {
  const indexPath = new URL('../dist/index.html', import.meta.url);
  if (!existsSync(indexPath)) return;
  const html = readFileSync(indexPath, 'utf8');
  const match = html.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/u);
  assert.ok(match, 'built index must reference the module bundle');
  const bundlePath = new URL(`../dist${match[1].replace(/^\/multipass/u, '')}`, import.meta.url);
  const bundle = readFileSync(bundlePath, 'utf8');
  assert.match(bundle, new RegExp(PRIVY_APP_ID), 'built bundle must keep wallet connect enabled');
});

test('root web:build script emits assets under /multipass/', () => {
  assert.match(rootWebBuildScript(), /MULTIPASS_BASE=\/multipass\//, 'web:build must set the deployed Vite base path');
});

test('Loopers build script emits a static mint route entry', () => {
  assert.match(allowlistEntryScript, /join\(distRoot, 'mint', 'index\.html'\)/);
  assert.match(allowlistEntryScript, /Mint Loopers on Base\./);
  assert.match(allowlistEntryScript, /loopers-mint-preview-20260910a\.jpg/);
});

test('Loopers build script emits a static emergency pause route entry', () => {
  assert.match(allowlistEntryScript, /join\(distRoot, 'pause-mint', 'index\.html'\)/);
  assert.match(allowlistEntryScript, /Emergency owner-only Loopers mint pause\./);
  assert.match(allowlistEntryScript, /https:\/\/helixa\.xyz\/pause-mint/);
});

test('web build emits a static Console route entry', () => {
  assert.match(allowlistEntryScript, /join\(distRoot, 'console', 'index\.html'\)/);
  assert.match(allowlistEntryScript, /Persistent operating console for onchain agents\./);
});

test('Privy wallet modal uses the deployed Multipass logo asset', () => {
  assert.match(mainSource, /logo:\s*'https:\/\/helixa\.xyz\/multipass\/helixa-logo\.png'/);
  assert.doesNotMatch(mainSource, /https:\/\/helixa\.xyz\/helixa-logo\.jpg/);
});

test('Privy chain config follows the active Loopers mint route', () => {
  assert.match(mainSource, /getLooperMintConfigFromLocation\(window\.location\.href\)/);
  assert.match(mainSource, /defaultChain: walletDefaultChain/);
  assert.match(mainSource, /supportedChains: walletSupportedChains/);
  assert.match(mainSource, /baseSepolia/);
});
