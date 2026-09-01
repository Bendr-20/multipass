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
      tokenId: '1',
      name: 'Bendr 2.0',
      role: 'Lead agent',
      credScore: 80,
      helixaId: '8453:1',
      intuition: { label: 'Published', canonicalAgentId: '8453:18531' },
      proofCount: 2,
      routeCount: 1,
      standardsCount: 1,
      verified: true,
      href: '/multipass/?agent=1',
    },
    { tokenId: '81', name: 'Quigbot', role: 'Strategy agent', credScore: 75, proofCount: 1, routeCount: 1, standardsCount: 1, verified: true, href: '/multipass/?agent=81' },
  ];
}

function render(html) {
  return new JSDOM(`<!doctype html><main>${html}</main>`).window.document.querySelector('main');
}

test('Multipass Console snapshot frames onchain agent operations without collection-specific copy', () => {
  const snapshot = createMultipassConsoleSnapshot({
    agents: sampleAgents(),
    state: {
      walletSnapshot: { connected: true, address: '0x1234567890abcdef1234567890abcdef12345678' },
      consoleOwnedAgents: { status: 'loaded', agents: sampleAgents() },
      consoleSelectedAgentId: '1',
    },
  });

  assert.equal(snapshot.title, 'Multipass Console');
  assert.match(snapshot.lead, /simple wallet-owned chat workspace/i);
  assert.match(snapshot.lead, /Sibyl memory/i);
  assert.match(snapshot.lead, /review-only approvals/i);
  assert.equal(snapshot.session.nextAction.title, 'Start live chat');
  assert.match(snapshot.session.nextAction.body, /first mission/i);
  assert.equal(snapshot.session.status.find((item) => item.label === 'Wallet')?.value, '0x1234...5678');
  assert.equal(snapshot.session.status.find((item) => item.label === 'Agent')?.value, 'Bendr 2.0');
  assert.equal(snapshot.session.status.find((item) => item.label === 'Chat')?.value, 'XMTP ready');
  assert.equal(snapshot.session.status.find((item) => item.label === 'Memory')?.value, 'Sibyl ready');
  assert.equal(snapshot.session.wallet.label, '0x1234...5678');
  assert.equal(snapshot.session.wallet.connected, true);
  assert.equal(snapshot.session.selectionEnabled, true);
  assert.equal(snapshot.session.options.length, 2);
  assert.equal(snapshot.session.activeAgentId, '1');
  assert.match(snapshot.session.selectionHint, /Pick a primary agent/i);
  assert.equal(snapshot.identityCard.label, 'Active room');
  assert.equal(snapshot.identityCard.name, 'Bendr 2.0');
  assert.equal(snapshot.identityCard.stats.find((item) => item.label === 'Cred')?.value, 'Cred 80');
  assert.equal(snapshot.identityCard.stats.find((item) => item.label === 'Proof')?.value, '2');
  assert.equal(snapshot.identityCard.stats.find((item) => item.label === 'Routes')?.value, '1');
  assert.equal(snapshot.identityCard.stats.find((item) => item.label === 'Standards')?.value, '1');
  assert.equal(snapshot.suiteChecks.length, 6);
  assert.equal(snapshot.suiteChecks.find((item) => item.label === 'Selected agent')?.value, '#1');
  assert.equal(snapshot.suiteChecks.find((item) => item.label === 'Cred')?.value, 'Cred 80');
  assert.equal(snapshot.agentThread.agentName, 'Bendr 2.0');
  assert.equal(snapshot.agents.length, 2);
  assert.equal(snapshot.agents[0].selected, true);
  assert.doesNotMatch(`${snapshot.headline} ${snapshot.lead} ${snapshot.agents.map((agent) => agent.name).join(' ')}`, /looper|legendary/i);
});

test('Multipass Console renderer includes memory missions and runtime checks as reviewed proposals', () => {
  const snapshot = createMultipassConsoleSnapshot({ agents: sampleAgents() });
  const root = render(renderMultipassConsole(snapshot));
  const text = root.textContent;

  assert.ok(root.querySelector('.multipass-console'));
  assert.ok(root.querySelector('.console-dashboard-header'));
  assert.ok(root.querySelector('.console-trust-stage'));
  assert.ok(root.querySelector('.console-wallet-panel'));
  assert.equal(root.querySelectorAll('.console-status-strip div').length, 4);
  assert.equal(root.querySelectorAll('.console-flow-panel li').length, 0);
  assert.ok(root.querySelector('.console-trust-rail'));
  assert.ok(root.querySelector('.console-identity-card'));
  assert.ok(root.querySelector('.console-thread-shell-header'));
  assert.equal(root.querySelector('.console-thread-formatting'), null);
  assert.equal(root.querySelector('.console-trust-graph-card'), null);
  assert.ok(root.querySelector('.console-agent-portrait img[src="/multipass/og-bendr-profile-capture.png"]'));
  assert.match(text, /Multipass Console/);
  assert.equal(root.querySelector('.console-trust-stage')?.getAttribute('aria-label'), 'Agent manager suite');
  assert.match(text, /Connect wallet/);
  assert.match(text, /Select primary agent/);
  assert.match(text, /Selected agent/);
  assert.match(text, /Room context/);
  assert.match(text, /what still waits for approval/i);
  assert.match(text, /Bendr 2\.0 room/);
  assert.match(text, /Today/);
  assert.match(text, /Sibyl recall/);
  assert.match(text, /Memory/);
  assert.match(text, /Send/);
  assert.match(text, /Reset chat/);
  assert.match(text, /Bankr-ready|Bankr gateway/);
  assert.match(text, /Sibyl memory/);
  assert.match(text, /Live chat|XMTP ready|XMTP room/);
  assert.match(text, /Review-only/);
  assert.match(text, /recall/i);
  assert.match(text, /Owned agents/);
  assert.match(text, /The Console only loads real Helixa agents owned by the connected wallet/);
  assert.doesNotMatch(text, /Tokenized equities|Vaults|Agent assets|What it&#39;s watching|What it's watching|signals feed/i);
  assert.equal(root.querySelector('[data-action="connect-console-wallet"]')?.textContent, 'Connect wallet');
  assert.equal(root.querySelector('[data-action="send-console-agent-message"] button[type="submit"]')?.disabled, true);
  assert.equal(root.querySelector('[data-action="reset-console-session"]')?.disabled, true);
  assert.equal(root.querySelector('[data-action="select-console-agent"]')?.disabled, true);
  assert.match(root.querySelector('.console-wallet-panel')?.textContent ?? '', /Required/);
  assert.match(text, /every action still waits for you/i);
  assert.match(text, /Review-only\. Nothing executes without your approval/i);
  assert.doesNotMatch(text, /Loopers|NFT dashboard|Legendary|custody transferred|credentials released|tool authority granted|private credentials available/i);
});

test('Multipass Console renderer includes agent runtime messages and review-only proposals', () => {
  const snapshot = createMultipassConsoleSnapshot({
    agents: sampleAgents(),
    state: {
      walletSnapshot: { connected: true, address: '0x1234567890abcdef1234567890abcdef12345678' },
      consoleOwnedAgents: { status: 'loaded', agents: sampleAgents() },
      consoleSelectedAgentId: '1',
      consoleParticipantAgentIds: ['1', '81'],
      consoleAgentThread: {
        status: 'received',
        transport: 'xmtp_local',
        memoryProvider: 'local_sibyl_adapter',
        inferenceProvider: 'fake_bankr',
        roomName: 'Bendr 2.0 + 1 room',
        participants: [
          { participantId: '1', tokenId: '1', displayName: 'Bendr 2.0', role: 'Lead agent' },
          { participantId: '81', tokenId: '81', displayName: 'Quigbot', role: 'Strategy agent' },
        ],
        messages: [
          { role: 'human', text: 'Watch NVDAx and Base agent tokens.', transport: 'console' },
          { role: 'agent', senderLabel: 'Bendr 2.0', text: 'Saved. I will prepare review-only proposals.', transport: 'xmtp_local' },
          { role: 'agent', senderLabel: 'Quigbot', text: 'I will track sentiment and summarize changes.', transport: 'xmtp_local' },
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

  assert.equal(root.querySelector('[data-action="send-console-agent-message"] button[type="submit"]')?.disabled, false);
  assert.equal(root.querySelector('[data-action="reset-console-session"]')?.disabled, false);
  assert.equal(root.querySelector('[data-action="select-console-agent"]')?.value, '1');
  assert.match(root.querySelector('.console-identity-card')?.textContent ?? '', /Bendr 2\.0/);
  assert.match(root.querySelector('.console-trust-rail')?.textContent ?? '', /1 queued/);
  assert.match(root.querySelector('.console-thread-shell-meta')?.textContent ?? '', /3 messages, 1 queued/);
  assert.match(root.querySelector('.console-thread-member-list')?.textContent ?? '', /Bendr 2\.0/);
  assert.match(root.querySelector('.console-thread-member-list')?.textContent ?? '', /Quigbot/);
  assert.match(text, /Watch NVDAx/);
  assert.match(text, /Saved/);
  assert.match(text, /Quigbot/);
  assert.match(text, /Review watchlist briefing/);
  assert.match(text, /No transaction authority/);
  assert.match(text, /Queued proposals/);
  assert.match(text, /Sibyl memory/);
});

test('Multipass Console renderer shows fresh-session recall after client reset', () => {
  const snapshot = createMultipassConsoleSnapshot({
    agents: sampleAgents(),
    state: {
      walletSnapshot: { connected: true, address: '0x1234567890abcdef1234567890abcdef12345678' },
      consoleOwnedAgents: { status: 'loaded', agents: sampleAgents() },
      consoleSelectedAgentId: '1',
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

  assert.match(text, /Session recall/);
  assert.match(text, /I remember this wallet/);
  assert.match(text, /review-only proposals/);
  assert.equal(root.querySelector('.console-signal-grid'), null);
  assert.match(root.querySelector('.console-recall-panel')?.textContent ?? '', /Session recall/);
});
