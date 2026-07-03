import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAgentShareCard,
  getAgentShareImageUrl,
  getAgentSharePageUrl,
  getAgentSharePath,
} from '../src/share-cards.js';

const manifest = {
  '81': {
    tokenId: '81',
    version: 'ab052a87',
    visualSource: 'https://assets.example.test/quigbot.png',
  },
};

test('share-card helpers format production share URLs from manifest version', () => {
  const card = getAgentShareCard(81, manifest);

  assert.deepEqual(card, manifest['81']);
  assert.equal(getAgentSharePath(card), '/multipass/share/81/?v=ab052a87');
  assert.equal(getAgentSharePageUrl(card, 'https://helixa.xyz'), 'https://helixa.xyz/multipass/share/81/?v=ab052a87');
  assert.equal(getAgentShareImageUrl(card, 'https://helixa.xyz'), 'https://helixa.xyz/multipass/share/81.jpg?v=ab052a87');
});

test('share-card helpers return null for missing manifest entries', () => {
  assert.equal(getAgentShareCard(9999, manifest), null);
  assert.equal(getAgentSharePath(null), null);
  assert.equal(getAgentSharePageUrl(null, 'https://helixa.xyz'), null);
  assert.equal(getAgentShareImageUrl(null, 'https://helixa.xyz'), null);
});

test('share-card helpers reject invalid direct card input', () => {
  assert.equal(getAgentSharePath({ tokenId: 'swarm:helixa', version: 'ab052a87' }), null);
  assert.equal(getAgentSharePath({ tokenId: '81', version: 'visual-2' }), null);
  assert.equal(getAgentShareImageUrl({ tokenId: '../81', version: 'ab052a87' }, 'https://helixa.xyz'), null);
  assert.equal(getAgentSharePageUrl({ tokenId: '81', version: '' }, 'https://helixa.xyz'), null);
});
