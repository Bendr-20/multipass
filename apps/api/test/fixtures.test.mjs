import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createMultipassApi } from '../src/index.js';
import { loadFixtureStore } from '../src/fixtures.js';

async function requestJson(api, pathName) {
  const response = await api.handleRequest(new Request(`http://127.0.0.1:8787${pathName}`));
  return { response, body: await response.json() };
}

test('loads generic fixture store and resolves demo agent', async () => {
  const { store, fixtureName } = await loadFixtureStore({ fixture: 'generic' });
  const profile = store.resolveProfile('demo-agent');

  assert.equal(fixtureName, 'generic');
  assert.equal(profile.multipass_id, 'mp_demo_agent');
  assert.equal(store.resolveProfile('mp_demo_agent').slug, 'demo-agent');
});

test('loads Bendr fixture store and resolves Bendr demo agent', async () => {
  const { store, fixtureName } = await loadFixtureStore({ fixture: 'bendr' });
  const profile = store.resolveProfile('bendr-2');

  assert.equal(fixtureName, 'bendr');
  assert.equal(profile.multipass_id, 'mp_bendr_2');
  assert.equal(profile.display_name, 'Bendr 2.0');
});

test('fixture-backed API filters private fragments', async () => {
  const { store } = await loadFixtureStore({ fixture: 'generic' });
  const api = createMultipassApi({ store, baseUrl: 'http://127.0.0.1:8787' });

  const { response, body } = await requestJson(api, '/api/multipass/demo-agent/fragments');

  assert.equal(response.status, 200);
  assert.ok(body.fragments.length >= 3);
  assert.equal(body.fragments.some((fragment) => fragment.visibility !== 'public'), false);
  assert.equal(body.fragments.some((fragment) => fragment.fragment_id === 'frag_demo_private_note'), false);
});




test('Bendr fixture covers V0.2 fragment state examples', async () => {
  const { store } = await loadFixtureStore({ fixture: 'bendr' });
  const api = createMultipassApi({ store, baseUrl: 'http://127.0.0.1:8787' });

  const { response, body } = await requestJson(api, '/api/multipass/bendr-2/fragments');

  assert.equal(response.status, 200);
  assert.equal(body.fragments.some((fragment) => fragment.visibility !== 'public'), false);
  assert.deepEqual([...new Set(body.fragments.map((fragment) => fragment.status))].sort(), [
    'disputed',
    'historical',
    'pending',
    'stale',
    'verified',
  ]);
  assert.ok(body.fragments.some((fragment) => fragment.transfer_policy === 'pause_on_transfer'));
  assert.ok(body.fragments.some((fragment) => fragment.transfer_policy === 'never_transfer'));
});

test('fixture names cannot escape the fixture root', async () => {
  for (const fixture of ['../generic', '../../tmp/example', '/tmp/example', 'foo\\bar']) {
    await assert.rejects(
      () => loadFixtureStore({ fixture }),
      /Invalid fixture name/,
      `expected ${fixture} to be rejected`,
    );
  }
});

test('unknown fixture rejects with useful error', async () => {
  await assert.rejects(
    () => loadFixtureStore({ fixture: 'missing-fixture' }),
    /Unknown fixture "missing-fixture"/,
  );
});

test('invalid JSON fixture rejects with file path and parse context', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'multipass-fixture-json-'));
  const dir = path.join(root, 'broken');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'profile.json'), '{', 'utf8');

  try {
    await assert.rejects(
      () => loadFixtureStore({ fixture: 'broken', fixturesRoot: root }),
      (error) => {
        assert.match(error.message, /profile\.json/);
        assert.match(error.message, /invalid JSON/i);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('schema-invalid fixture rejects with schema name and validation path', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'multipass-fixture-schema-'));
  const dir = path.join(root, 'invalid');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'profile.json'), JSON.stringify({ schema_version: '0.1.0' }), 'utf8');

  try {
    await assert.rejects(
      () => loadFixtureStore({ fixture: 'invalid', fixturesRoot: root }),
      (error) => {
        assert.match(error.message, /multipass-profile/);
        assert.match(error.message, /multipass_id|subject_type|display_name/);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
