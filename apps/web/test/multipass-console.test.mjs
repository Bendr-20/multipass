import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import { createMultipassConsoleSnapshot, renderMultipassConsole } from '../src/multipass-console.js';

function sampleData() {
  return {
    profile: { display_name: 'Bendr 2.0', subject_type: 'agent' },
    fragments: {
      fragments: [
        { fragment_id: 'public_identity', visibility: 'public' },
        { fragment_id: 'public_route', visibility: 'public' },
        { fragment_id: 'private_note', visibility: 'private' },
      ],
    },
  };
}

function sampleAgents() {
  return [
    { name: 'Bendr 2.0', role: 'Lead agent', credScore: 80, verified: true, href: '/multipass/?agent=1' },
    { name: 'Quigbot', role: 'Strategy agent', credScore: 75, verified: true, href: '/multipass/?agent=81' },
  ];
}

function render(html) {
  return new JSDOM(`<!doctype html><main>${html}</main>`).window.document.querySelector('main');
}

test('Multipass Console snapshot frames onchain agent operations without collection-specific copy', () => {
  const snapshot = createMultipassConsoleSnapshot({
    data: sampleData(),
    agents: sampleAgents(),
    state: { walletSnapshot: { connected: true, address: '0x1234567890abcdef1234567890abcdef12345678' } },
  });

  assert.equal(snapshot.title, 'Multipass Console');
  assert.match(snapshot.lead, /wallet identity/i);
  assert.match(snapshot.lead, /persistent memory/i);
  assert.match(snapshot.lead, /onchain action proposals/i);
  assert.equal(snapshot.status.find((item) => item.label === 'Wallet')?.value, '0x1234...5678');
  assert.equal(snapshot.wallet.label, '0x1234...5678');
  assert.equal(snapshot.wallet.connected, true);
  assert.equal(snapshot.status.find((item) => item.label === 'Agents')?.value, 2);
  assert.equal(snapshot.status.find((item) => item.label === 'Public proof')?.value, 2);
  assert.doesNotMatch(`${snapshot.headline} ${snapshot.lead}`, /looper/i);
});

test('Multipass Console renderer includes memory missions and market signals as reviewed proposals', () => {
  const snapshot = createMultipassConsoleSnapshot({ data: sampleData(), agents: sampleAgents() });
  const root = render(renderMultipassConsole(snapshot));
  const text = root.textContent;

  assert.ok(root.querySelector('.multipass-console'));
  assert.match(text, /Human-facing control for agents that remember/);
  assert.match(text, /Memory/);
  assert.match(text, /Missions/);
  assert.match(text, /Signals/);
  assert.match(text, /Tokenized equities/);
  assert.match(text, /Vaults/);
  assert.match(text, /Agent assets/);
  assert.match(text, /Fresh-session recall/);
  assert.equal(root.querySelector('[data-action="connect-console-wallet"]')?.textContent, 'Connect wallet');
  assert.match(root.querySelector('.console-wallet-panel')?.textContent ?? '', /No operator wallet is attached/);
  assert.match(text, /does not place trades/);
  assert.doesNotMatch(text, /Loopers|NFT dashboard|custody transferred|credentials released|tool authority granted|private credentials available/i);
});
