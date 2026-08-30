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
  assert.match(snapshot.lead, /operator identity/i);
  assert.match(snapshot.lead, /command room/i);
  assert.equal(snapshot.status.find((item) => item.label === 'Wallet')?.value, '0x1234...5678');
  assert.equal(snapshot.wallet.label, '0x1234...5678');
  assert.equal(snapshot.wallet.connected, true);
  assert.equal(snapshot.status.find((item) => item.label === 'Agents')?.value, 2);
  assert.equal(snapshot.status.find((item) => item.label === 'Public proof')?.value, 2);
  assert.deepEqual(snapshot.flowSteps.map((step) => step.label), ['Identity', 'Activation', 'Mission', 'Memory', 'Recall', 'Brief', 'Proposal']);
  assert.equal(snapshot.flowSteps.find((step) => step.label === 'Identity')?.state, 'done');
  assert.equal(snapshot.identityCard.label, 'Operator status');
  assert.equal(snapshot.identityCard.name, 'Bendr 2.0');
  assert.equal(snapshot.identityCard.stats.find((item) => item.label === 'Cred')?.value, 'Cred 80');
  assert.equal(snapshot.trustGraph.nodes.length, 6);
  assert.equal(snapshot.signalChart.lanes.length, 3);
  assert.doesNotMatch(`${snapshot.headline} ${snapshot.lead}`, /looper/i);
});

test('Multipass Console renderer includes memory missions and market signals as reviewed proposals', () => {
  const snapshot = createMultipassConsoleSnapshot({ data: sampleData(), agents: sampleAgents() });
  const root = render(renderMultipassConsole(snapshot));
  const text = root.textContent;

  assert.ok(root.querySelector('.multipass-console'));
  assert.ok(root.querySelector('.console-dashboard-header'));
  assert.ok(root.querySelector('.console-control-grid'));
  assert.ok(root.querySelector('.console-identity-card'));
  assert.ok(root.querySelector('.console-trust-graph-card'));
  assert.ok(root.querySelector('.console-signal-chart-card'));
  assert.ok(root.querySelector('.console-agent-portrait img[src="/multipass/og-bendr-profile-capture.png"]'));
  assert.ok(root.querySelector('.console-graph-core'));
  assert.equal(root.querySelectorAll('.console-graph-node').length, 6);
  assert.equal(root.querySelectorAll('.console-chart-visual i').length, 8);
  assert.match(text, /Multipass Console/);
  assert.match(text, /Operator status/);
  assert.match(text, /Trust graph/);
  assert.match(text, /Signal card/);
  assert.match(text, /Memory/);
  assert.match(text, /Mission lanes/);
  assert.match(text, /Signals/);
  assert.match(text, /Mission control/);
  assert.match(text, /Save mission/);
  assert.match(text, /Reset session/);
  assert.match(text, /Bankr-ready/);
  assert.match(text, /Sibyl-ready/);
  assert.match(text, /XMTP-ready/);
  assert.match(text, /Tokenized equities/);
  assert.match(text, /Vaults/);
  assert.match(text, /Agent assets/);
  assert.match(text, /\$CRED/);
  assert.match(text, /Recall/);
  assert.equal(root.querySelector('[data-action="connect-console-wallet"]')?.textContent, 'Connect wallet');
  assert.equal(root.querySelector('[data-action="send-console-agent-message"] button')?.disabled, true);
  assert.equal(root.querySelector('[data-action="reset-console-session"]')?.disabled, true);
  assert.match(root.querySelector('.console-wallet-panel')?.textContent ?? '', /Required/);
  assert.match(text, /No trades/);
  assert.doesNotMatch(text, /Loopers|NFT dashboard|custody transferred|credentials released|tool authority granted|private credentials available/i);
});

test('Multipass Console renderer includes agent runtime messages and review-only proposals', () => {
  const snapshot = createMultipassConsoleSnapshot({
    data: sampleData(),
    agents: sampleAgents(),
    state: {
      walletSnapshot: { connected: true, address: '0x1234567890abcdef1234567890abcdef12345678' },
      consoleAgentThread: {
        status: 'received',
        transport: 'xmtp_ready',
        memoryProvider: 'local_sibyl_adapter',
        inferenceProvider: 'fake_bankr',
        messages: [
          { role: 'human', text: 'Watch NVDAx and Base agent tokens.', transport: 'console' },
          { role: 'agent', text: 'Saved. I will prepare review-only proposals.', transport: 'xmtp_ready' },
        ],
        proposals: [
          {
            status: 'review_only',
            title: 'Review watchlist briefing',
            action: 'Keep monitoring before any execution.',
            risk: 'No transaction authority is attached to this proposal.',
          },
        ],
        savedMemory: [
          { text: 'Watchlist preference: NVDAx and Base agent tokens.', tags: ['watchlist'] },
          { text: 'Constraint: review-only proposals.', tags: ['constraint'] },
        ],
      },
    },
  });
  const root = render(renderMultipassConsole(snapshot));
  const text = root.textContent;

  assert.equal(root.querySelector('[data-action="send-console-agent-message"] button')?.disabled, false);
  assert.equal(root.querySelector('[data-action="reset-console-session"]')?.disabled, false);
  assert.match(root.querySelector('.console-identity-card')?.textContent ?? '', /Active/);
  assert.match(root.querySelector('.console-trust-graph-card')?.textContent ?? '', /1 queued/);
  assert.match(text, /Watch NVDAx/);
  assert.match(text, /Saved/);
  assert.match(text, /Review watchlist briefing/);
  assert.match(text, /No transaction authority/);
});

test('Multipass Console renderer shows fresh-session recall after client reset', () => {
  const snapshot = createMultipassConsoleSnapshot({
    data: sampleData(),
    agents: sampleAgents(),
    state: {
      walletSnapshot: { connected: true, address: '0x1234567890abcdef1234567890abcdef12345678' },
      consoleAgentThread: {
        status: 'reset',
        sessionReset: true,
        recalledMission: 'I remember this wallet 0x1234...5678. Active mission: tokenized equities, vault opportunities, and agent-asset signals. Constraint: review-only proposals. No execution path is attached.',
        savedMemory: [
          { text: 'Watchlist preference: tokenized equities, vault opportunities, and agent-asset signals.', tags: ['watchlist'] },
        ],
        messages: [],
        proposals: [],
      },
    },
  });
  const root = render(renderMultipassConsole(snapshot));
  const text = root.textContent;

  assert.match(text, /Session reset/);
  assert.match(text, /I remember this wallet/);
  assert.match(text, /review-only proposals/);
  assert.match(root.querySelector('.console-trust-graph-card')?.textContent ?? '', /Sibyl/);
});
