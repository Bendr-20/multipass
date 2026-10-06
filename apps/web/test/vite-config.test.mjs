import test from 'node:test';
import assert from 'node:assert/strict';

import { assertProductionBuildConfig } from '../vite.config.js';

test('production build rejects a missing wallet login configuration', () => {
  assert.throws(
    () => assertProductionBuildConfig({ command: 'build', mode: 'production', env: { MULTIPASS_BASE: '/multipass/' } }),
    /VITE_PRIVY_APP_ID/,
  );
});

test('production build rejects a static base outside the Multipass route', () => {
  assert.throws(
    () => assertProductionBuildConfig({ command: 'build', mode: 'production', env: {
      VITE_PRIVY_APP_ID: 'cmlv6ibdm00350el2jsm8m8s6',
      MULTIPASS_BASE: '/',
    } }),
    /MULTIPASS_BASE/,
  );
});

test('production build accepts the reviewed wallet login and Multipass route', () => {
  assert.doesNotThrow(() => assertProductionBuildConfig({ command: 'build', mode: 'production', env: {
    VITE_PRIVY_APP_ID: 'cmlv6ibdm00350el2jsm8m8s6',
    MULTIPASS_BASE: '/multipass/',
  } }));
});

test('development server remains available without production deployment configuration', () => {
  assert.doesNotThrow(() => assertProductionBuildConfig({ command: 'serve', mode: 'development', env: {} }));
});
