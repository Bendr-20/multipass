import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getBankrMarketplaceCatalog,
  searchBankrMarketplaceSkills,
} from '../src/bankr-marketplace-catalog.js';

const REVISION = 'd7b28f4caea71b446655ef991346f4860b95656a';

test('loads the complete bounded official Bankr marketplace snapshot', () => {
  const catalog = getBankrMarketplaceCatalog();
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.source, 'https://github.com/BankrBot/skills');
  assert.equal(catalog.sourceRevision, REVISION);
  assert.equal(catalog.skills.length, 151);
  assert.equal(new Set(catalog.skills.map((skill) => skill.id)).size, 151);
  assert.equal(Object.isFrozen(catalog), true);
  assert.equal(Object.isFrozen(catalog.skills), true);

  for (const skill of catalog.skills) {
    assert.deepEqual(Object.keys(skill).sort(), [
      'credentialAccess', 'description', 'execution', 'id', 'name', 'provider',
      'providerUrl', 'sourcePath', 'sourceRevision',
    ]);
    assert.match(skill.id, /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/);
    assert.ok(Buffer.byteLength(skill.name, 'utf8') <= 100);
    assert.ok(Buffer.byteLength(skill.provider, 'utf8') <= 100);
    assert.ok(Buffer.byteLength(skill.description, 'utf8') <= 400);
    assert.ok(Buffer.byteLength(skill.sourcePath, 'utf8') <= 160);
    if (skill.providerUrl) assert.match(skill.providerUrl, /^https:\/\/[^\s]+$/);
    assert.equal(skill.sourceRevision, REVISION);
    assert.equal(skill.execution, 'review_only');
    assert.equal(skill.credentialAccess, false);
    assert.equal('demo' in skill, false);
    assert.equal('setup' in skill, false);
    assert.equal('install' in skill, false);
    assert.equal('command' in skill, false);
  }
});

test('searches all marketplace skills deterministically without returning executable instructions', () => {
  const exact = searchBankrMarketplaceSkills('checkr social attention', { limit: 5 });
  assert.equal(exact.total, 151);
  assert.equal(exact.query, 'checkr social attention');
  assert.equal(exact.skills[0].id, 'checkr');
  assert.match(exact.skills[0].description, /attention/i);

  const deployment = searchBankrMarketplaceSkills('deploy token on Clanker', { limit: 4 });
  assert.equal(deployment.skills.some((skill) => skill.id === 'clanker'), true);
  assert.ok(deployment.skills.length <= 4);

  const bounded = searchBankrMarketplaceSkills('a'.repeat(10_000), { limit: 10_000 });
  assert.ok(Buffer.byteLength(bounded.query, 'utf8') <= 200);
  assert.ok(bounded.skills.length <= 20);
  assert.equal(Object.isFrozen(bounded), true);
});
