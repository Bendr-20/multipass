import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('root web:build script emits assets under /multipass/', () => {
  assert.match(rootWebBuildScript(), /MULTIPASS_BASE=\/multipass\//, 'web:build must set the deployed Vite base path');
});

test('Loopers build script emits a static mint route entry', () => {
  assert.match(allowlistEntryScript, /join\(distRoot, 'mint', 'index\.html'\)/);
  assert.match(allowlistEntryScript, /Mint Loopers on Base\./);
});

test('Privy chain config follows the active Loopers mint route', () => {
  assert.match(mainSource, /getLooperMintConfigFromLocation\(window\.location\.href\)/);
  assert.match(mainSource, /defaultChain: walletDefaultChain/);
  assert.match(mainSource, /supportedChains: walletSupportedChains/);
  assert.match(mainSource, /baseSepolia/);
});
