import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveConsoleOwnerProfile, safeConsoleAvatarUrl } from '../src/console-owner-profile.js';

const WALLET = '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea';

test('Console owner profile resolves reverse ENS name and avatar through injected dependencies', async () => {
  const calls = [];
  const profile = await resolveConsoleOwnerProfile(WALLET, {
    getEnsName: async ({ address }) => { calls.push(['name', address]); return 'quigley.eth'; },
    getEnsAvatar: async ({ name }) => { calls.push(['avatar', name]); return 'https://example.test/quigley.png'; },
  });

  assert.deepEqual(profile, {
    address: WALLET,
    displayName: 'quigley.eth',
    ensName: 'quigley.eth',
    avatarUrl: 'https://example.test/quigley.png',
  });
  assert.deepEqual(calls, [['name', WALLET], ['avatar', 'quigley.eth']]);
});

test('Console owner profile falls back to the full checksum wallet on no-name or transport failure', async () => {
  for (const getEnsName of [async () => null, async () => { throw new Error('rpc down'); }]) {
    const profile = await resolveConsoleOwnerProfile(WALLET, { getEnsName });
    assert.equal(profile.address, WALLET);
    assert.equal(profile.displayName, WALLET);
    assert.equal(profile.ensName, null);
    assert.equal(profile.avatarUrl, null);
  }
});

test('Console avatar URLs accept only HTTPS', () => {
  assert.equal(safeConsoleAvatarUrl('https://example.test/a.png'), 'https://example.test/a.png');
  assert.equal(safeConsoleAvatarUrl('/multipass/looper.png'), 'https://helixa.xyz/multipass/looper.png');
  assert.equal(safeConsoleAvatarUrl('ipfs://bafybeigdyrzt/avatar.png'), 'https://ipfs.io/ipfs/bafybeigdyrzt/avatar.png');
  for (const value of ['http://example.test/a.png', 'https://user:pass@example.test/a.png', 'data:image/png;base64,abc', 'javascript:alert(1)', 'not a url', '', null]) {
    assert.equal(safeConsoleAvatarUrl(value), null);
  }
});

test('Console owner profile drops unsafe ENS avatars', async () => {
  const profile = await resolveConsoleOwnerProfile(WALLET, {
    getEnsName: async () => 'quigley.eth',
    getEnsAvatar: async () => 'data:image/svg+xml,unsafe',
  });
  assert.equal(profile.displayName, 'quigley.eth');
  assert.equal(profile.avatarUrl, null);
});
