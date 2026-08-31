import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import { createMultipassConsoleSnapshot, renderMultipassConsole } from '../src/multipass-console.js';

function sampleData() {
  return {
    profile: {
      display_name: 'Bendr 2.0',
      subject_type: 'agent',
      owner_summary: { owner_state: 'unclaimed' },
      standards_profile: { supported_standard_ids: ['ERC-8004', 'ERC-8217'] },
      cred_summary: { score: 80 },
    },
    card: {
      message_routes: [{ visibility: 'public' }],
      service_endpoints: [{ visibility: 'public' }],
      standards_refs: [{ standard_id: 'ERC-8004' }],
    },
    fragments: {
      fragments: [
        { fragment_id: 'public_identity', fragment_type: 'attestation', visibility: 'public' },
        { fragment_id: 'public_route', fragment_type: 'endpoint', visibility: 'public' },
        { fragment_id: 'private_note', visibility: 'private' },
      ],
    },
  };
}

function sampleAgents() {
  return [
    {
      name: 'Bendr 2.0',
      role: 'Lead agent',
      credScore: 80,
      helixaId: '8453:1',
      intuition: { label: 'Published', canonicalAgentId: '8453:18531' },
      verified: true,
      href: '/multipass/?agent=1',
    },
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
  assert.match(snapshot.lead, /one Cred graph/i);
  assert.match(snapshot.lead, /onchain agent/i);
  assert.match(snapshot.lead, /human approval/i);
  assert.equal(snapshot.nextAction.title, 'Save mission');
  assert.match(snapshot.nextAction.body, /watch/i);
  assert.equal(snapshot.status.find((item) => item.label === 'Wallet')?.value, '0x1234...5678');
  assert.equal(snapshot.status.find((item) => item.label === 'Cred')?.value, 'Cred 80');
  assert.equal(snapshot.status.find((item) => item.label === 'Approval')?.value, 'Human review');
  assert.equal(snapshot.wallet.label, '0x1234...5678');
  assert.equal(snapshot.wallet.connected, true);
  assert.equal(snapshot.status.find((item) => item.label === 'Proof')?.value, 2);
  assert.deepEqual(snapshot.flowSteps.map((step) => step.label), ['Wallet', 'Agent', 'Mission', 'Memory', 'Briefing', 'Proposal']);
  assert.equal(snapshot.flowSteps.find((step) => step.label === 'Wallet')?.state, 'done');
  assert.equal(snapshot.identityCard.label, 'Your agent');
  assert.equal(snapshot.identityCard.name, 'Bendr 2.0');
  assert.equal(snapshot.identityCard.stats.find((item) => item.label === 'Cred')?.value, 'Cred 80');
  assert.equal(snapshot.trustGraph.label, 'Trust Graph v2');
  assert.match(snapshot.trustGraph.summary, /dense old-site field/i);
  assert.match(snapshot.trustGraph.summary, /halo shows nearby agents/i);
  assert.equal(snapshot.trustGraph.activeTier, 'Prime');
  assert.equal(snapshot.trustGraph.state, 'Cred ring: Prime');
  assert.equal(snapshot.trustGraph.nodes.length, 5);
  assert.equal(snapshot.trustGraph.markers.length, 20);
  assert.equal(snapshot.trustGraph.guideDots.length, 18);
  assert.equal(snapshot.trustGraph.tiers.length, 5);
  assert.equal(snapshot.trustGraph.tiers.find((tier) => tier.label === 'Prime')?.active, true);
  assert.equal(snapshot.trustGraph.nodes.find((node) => node.label === 'AgentDNA')?.state, '8453:1');
  assert.match(snapshot.trustGraph.nodes.find((node) => node.label === 'Proof')?.state ?? '', /2 public fragments/);
  assert.equal(snapshot.trustGraph.nodes.find((node) => node.label === 'Routes'), undefined);
  assert.equal(snapshot.signalChart.label, 'Graph checks');
  assert.equal(snapshot.signalChart.title, 'Trust checks');
  assert.equal(snapshot.signalChart.lanes.length, 6);
  assert.equal(snapshot.signalChart.lanes.find((lane) => lane.title === 'Cred tier')?.status, 'Prime');
  assert.doesNotMatch(`${snapshot.headline} ${snapshot.lead} ${snapshot.trustGraph.nodes.map((node) => node.label).join(' ')}`, /looper|legendary/i);
});

test('Multipass Console renderer includes memory missions and runtime checks as reviewed proposals', () => {
  const snapshot = createMultipassConsoleSnapshot({ data: sampleData(), agents: sampleAgents() });
  const root = render(renderMultipassConsole(snapshot));
  const text = root.textContent;

  assert.ok(root.querySelector('.multipass-console'));
  assert.ok(root.querySelector('.console-dashboard-header'));
  assert.ok(root.querySelector('.console-trust-stage'));
  assert.equal(root.querySelectorAll('.console-status-strip div').length, 4);
  assert.equal(root.querySelectorAll('.console-flow-panel li').length, 0);
  assert.ok(root.querySelector('.console-trust-rail'));
  assert.ok(root.querySelector('.console-support-grid'));
  assert.ok(root.querySelector('.console-identity-card'));
  assert.ok(root.querySelector('.console-trust-graph-card'));
  assert.equal(root.querySelectorAll('.console-trust-stage .console-signal-chart-card').length, 0);
  assert.ok(root.querySelector('.console-agent-portrait img[src="/multipass/og-bendr-profile-capture.png"]'));
  assert.ok(root.querySelector('.console-graph-core'));
  assert.equal(root.querySelectorAll('.console-graph-marker').length, 20);
  assert.equal(root.querySelectorAll('.console-graph-guide-dot').length, 18);
  assert.equal(root.querySelectorAll('.console-graph-lines line').length, 0);
  assert.equal(root.querySelectorAll('.console-graph-ring').length, 5);
  assert.equal(root.querySelectorAll('.console-tier-strip span').length, 5);
  assert.equal(root.querySelectorAll('.console-graph-list article').length, 5);
  assert.equal(root.querySelectorAll('#console-signals').length, 0);
  assert.equal(root.querySelectorAll('.console-signal-grid article').length, 0);
  assert.equal(root.querySelectorAll('.console-chart-visual i').length, 0);
  assert.match(text, /Multipass Console/);
  assert.match(text, /Next/);
  assert.match(text, /Connect wallet/);
  assert.match(text, /Agent identity, memory, and review state stay tied to your wallet/);
  assert.match(text, /Your agent/);
  assert.match(text, /Trust Graph v2/);
  assert.match(text, /Cred ring: Prime/);
  assert.match(text, /Prime/);
  assert.match(text, /AgentDNA/);
  assert.match(text, /Intuition/);
  assert.match(text, /8453:1/);
  assert.match(text, /Proof/);
  assert.match(text, /2 public fragments/);
  assert.doesNotMatch(text, /Trust checks/);
  assert.doesNotMatch(text, /Identity proof/);
  assert.doesNotMatch(text, /Public routes/);
  assert.match(text, /Dense old-site field/);
  assert.match(text, /Cred tier: Prime/);
  assert.match(text, /Memory/);
  assert.match(text, /Mission lanes/);
  assert.match(text, /Agent mission/);
  assert.match(text, /Save mission/);
  assert.match(text, /Reset session/);
  assert.match(text, /Bankr-ready/);
  assert.match(text, /Sibyl-ready/);
  assert.match(text, /XMTP-ready/);
  assert.match(text, /Approval gate/);
  assert.match(text, /Recall/);
  assert.doesNotMatch(text, /Tokenized equities|Vaults|Agent assets|What it&#39;s watching|What it's watching|signals feed/i);
  assert.equal(root.querySelector('[data-action="connect-console-wallet"]')?.textContent, 'Connect wallet');
  assert.equal(root.querySelector('[data-action="send-console-agent-message"] button')?.disabled, true);
  assert.equal(root.querySelector('[data-action="reset-console-session"]')?.disabled, true);
  assert.match(root.querySelector('.console-wallet-panel')?.textContent ?? '', /Required/);
  assert.match(text, /You approve every action/);
  assert.match(text, /No trades/);
  assert.doesNotMatch(text, /Loopers|NFT dashboard|Legendary|custody transferred|credentials released|tool authority granted|private credentials available/i);
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
  assert.match(root.querySelector('.console-trust-rail')?.textContent ?? '', /1 proposal waiting/);
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
        recalledMission: 'I remember this wallet 0x1234...5678. Active mission: Cred tier, public proof, route health, and mission changes. Constraint: review-only proposals. No execution path is attached.',
        savedMemory: [
          { text: 'Watchlist preference: Cred tier, public proof, route health, and mission changes.', tags: ['watchlist'] },
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
  assert.equal(root.querySelector('.console-signal-grid'), null);
});
