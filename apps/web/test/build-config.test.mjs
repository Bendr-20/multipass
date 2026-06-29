import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT_PACKAGE_URL = new URL('../../../package.json', import.meta.url);
const PRIVY_APP_ID = 'cmlv6ibdm00350el2jsm8m8s6';

test('production web build includes the public Privy app id', async () => {
  const pkg = JSON.parse(await readFile(ROOT_PACKAGE_URL, 'utf8'));
  assert.match(pkg.scripts?.['web:build'] ?? '', new RegExp(`VITE_PRIVY_APP_ID=${PRIVY_APP_ID}`));
});
