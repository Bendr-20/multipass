import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryStore, createMultipassApi } from '../src/index.js';

test('GET Console marketplace skills exposes the complete bounded public catalog', async () => {
  const api = createMultipassApi({ store: createMemoryStore(), baseUrl: 'https://helixa.test' });
  const response = await api.handleRequest(new Request('https://helixa.test/api/multipass/console/skills?limit=200'));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /max-age=300/);
  assert.equal(body.schemaVersion, 1);
  assert.equal(body.total, 151);
  assert.equal(body.skills.length, 20);
  assert.equal(body.skills.every((skill) => skill.execution === 'review_only'), true);
  assert.equal(body.skills.every((skill) => skill.credentialAccess === false), true);
});

test('GET Console marketplace skills searches deterministic third-party metadata', async () => {
  const api = createMultipassApi({ store: createMemoryStore(), baseUrl: 'https://helixa.test' });
  const response = await api.handleRequest(new Request('https://helixa.test/api/multipass/console/skills?q=checkr%20attention&limit=5'));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.query, 'checkr attention');
  assert.equal(body.skills[0].id, 'checkr');
  assert.match(body.skills[0].description, /attention/i);
  assert.equal(JSON.stringify(body).includes('install the'), false);
  assert.equal(JSON.stringify(body).includes('PRIVATE_KEY='), false);
});
