import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const rootPackage = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
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
