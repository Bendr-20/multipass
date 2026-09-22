import assert from 'node:assert/strict';
import test from 'node:test';

import { createLooperBankrResearchFacade } from '../src/looper-bankr-research.js';

test('Looper Bankr research facade is unconditionally disabled and exposes no wallet authority', async () => {
  const facade = createLooperBankrResearchFacade({ enabled: false });
  assert.equal(facade.enabled, false);
  assert.deepEqual(Object.keys(facade).sort(), ['enabled', 'research']);
  await assert.rejects(facade.research({
    owner: '0x1111111111111111111111111111111111111111',
    account: '0x2222222222222222222222222222222222222222',
  }), /disabled/i);
});

test('Looper Bankr research cannot be enabled by configuration', () => {
  assert.throws(() => createLooperBankrResearchFacade({ enabled: true }), /disabled/i);
});
