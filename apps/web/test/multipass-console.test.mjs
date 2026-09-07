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
  assert.equal(snapshot.session.nextAction.title, 'Open a room');
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
  assert.match(snapshot.session.selectionHint, /open its room/i);
  assert.equal(snapshot.kicker, undefined);
  assert.equal(snapshot.identityCard.label, undefined);
  assert.equal(snapshot.identityCard.name, 'Bendr 2.0');
  assert.equal(snapshot.identityCard.rename?.value, 'Bendr 2.0');
  assert.equal(snapshot.identityCard.rename?.resettable, false);
  assert.equal(snapshot.identityCard.badges.length, 3);
  assert.equal(snapshot.identityCard.dossier.length, 4);
  assert.equal(snapshot.identityCard.stats.find((item) => item.label === 'Token')?.value, '#1');
  assert.equal(snapshot.identityCard.stats.find((item) => item.label === 'Cred')?.value, 'Cred 80');
  assert.equal(snapshot.identityCard.stats.find((item) => item.label === 'Mode')?.value, 'Review-only');
  assert.equal(snapshot.suiteChecks.length, 6);
  assert.equal(snapshot.suiteChecks.find((item) => item.label === 'Selected agent')?.value, '#1');
  assert.equal(snapshot.suiteChecks.find((item) => item.label === 'Cred')?.value, 'Cred 80');
  assert.equal(snapshot.agentThread.agentName, 'Bendr 2.0');
  assert.equal(snapshot.agents.length, 2);
  assert.equal(snapshot.agents[0].selected, true);
  assert.equal(snapshot.lead, undefined);
  assert.doesNotMatch(`${snapshot.headline} ${snapshot.agents.map((agent) => agent.name).join(' ')}`, /looper|legendary/i);
});

test('Multipass Console renderer includes memory missions and runtime checks as reviewed proposals', () => {
  const snapshot = createMultipassConsoleSnapshot({ agents: sampleAgents() });
  const root = render(renderMultipassConsole(snapshot));
  const text = root.textContent;

  assert.ok(root.querySelector('.multipass-console'));
  assert.ok(root.querySelector('.console-basic-shell'));
  assert.ok(root.querySelector('.console-wallet-panel'));
  assert.equal(root.querySelectorAll('.console-sidebar-drawer').length >= 3, true);
  assert.match(root.querySelector('.console-sidebar-drawer summary')?.textContent ?? '', /Console name|Identity profile|My agents|Active agent/);
  assert.equal(root.querySelectorAll('.console-status-strip div').length, 0);
  assert.equal(root.querySelectorAll('.console-flow-panel li').length, 0);
  assert.equal(root.querySelector('.console-trust-rail'), null);
  assert.ok(root.querySelector('.console-identity-card'));
  assert.ok(root.querySelector('[data-action="update-console-agent-name"]'));
  assert.ok(root.querySelector('.console-thread-shell-header'));
  assert.ok(root.querySelector('.console-thread-toolbar'));
  assert.equal(root.querySelector('.console-thread-formatting'), null);
  assert.equal(root.querySelector('.console-trust-graph-card'), null);
  assert.ok(root.querySelector('.console-agent-portrait img[src="/multipass/loopers-console-pfp.png"]'));
  assert.equal(root.querySelector('.console-workspace-sidebar')?.children[1]?.classList.contains('console-identity-card'), true);
  assert.match(root.querySelector('.console-sidebar-header h1')?.textContent ?? '', /Multipass Console/);
  assert.equal(root.querySelector('.console-basic-shell')?.getAttribute('aria-label'), 'Agent console');
  assert.match(text, /Active agent/);
  assert.match(text, /Console name/);
  assert.match(text, /Bendr 2\.0 room/);
  assert.match(text, /Direct thread/);
  assert.match(text, /Today/);
  assert.match(text, /Thread note/);
  assert.match(text, /Memory/);
  assert.match(text, /Send/);
  assert.match(text, /Reset chat/);
  assert.match(text, /Sibyl memory/);
  assert.match(text, /live chat|XMTP ready|XMTP room/i);
  assert.match(text, /Review-only/);
  assert.match(text, /recall/i);
  assert.match(text, /My agents/);
  assert.match(text, /The Console only loads real Helixa agents owned by the connected wallet/);
  assert.doesNotMatch(text, /Agent dossier|Agent Workspace/);
  assert.equal(root.querySelectorAll('[data-action="connect-console-wallet"]').length, 0);
  assert.doesNotMatch(text, /A quieter operator surface for wallet-owned agents|review proposals without the dashboard clutter/i);
  assert.doesNotMatch(text, /Tokenized equities|Vaults|Agent assets|What it&#39;s watching|What it's watching|signals feed/i);
  assert.equal(root.querySelector('[data-action="connect-console-wallet"]'), null);
  assert.equal(root.querySelector('[data-action="send-console-agent-message"] button[type="submit"]')?.disabled, true);
  assert.equal(root.querySelector('[data-action="reset-console-session"]')?.disabled, true);
  assert.equal(root.querySelector('[data-action="select-console-agent"]')?.disabled, true);
  assert.match(root.querySelector('.console-wallet-panel')?.textContent ?? '', /Connect wallet to load your agents\./);
  assert.doesNotMatch(text, /Use the header button|Use the top-right wallet control/i);
  assert.doesNotMatch(root.querySelector('.console-identity-card')?.textContent ?? '', /Wallet required|No wallet connected/i);
  assert.match(text, /Review-only\. Nothing executes without your approval/i);
  assert.match(text, /Lead agent in a direct thread\. Cred 80\. review-only\./i);
  assert.doesNotMatch(text, /Direct line to Quigley|mouthy night-shift/i);
  assert.equal(root.querySelector('.console-thread-room-state'), null);
  assert.equal(root.querySelector('.console-thread-status'), null);
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
        missions: [
          { id: 'mission_watchlist', title: 'Active watchlist', status: 'active', summary: 'Watch NVDAx and Base agent tokens.' },
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
  assert.match(root.querySelector('.console-thread-shell-meta')?.textContent ?? '', /3 messages, 1 queued/);
  assert.ok(root.querySelector('.console-thread-toolbar'));
  assert.match(root.querySelector('.console-thread-member-list')?.textContent ?? '', /Bendr 2\.0/);
  assert.match(root.querySelector('.console-thread-member-list')?.textContent ?? '', /Quigbot/);
  assert.match(root.querySelector('.console-identity-members-list')?.textContent ?? '', /Bendr 2\.0/);
  assert.match(root.querySelectorAll('.console-sidebar-drawer summary')[1]?.textContent ?? '', /Identity profile/);
  assert.match(root.querySelectorAll('.console-sidebar-drawer summary')[2]?.textContent ?? '', /Participants/);
  assert.match(text, /Watch NVDAx/);
  assert.match(text, /Saved/);
  assert.match(text, /Quigbot/);
  assert.match(text, /Review watchlist briefing/);
  assert.match(text, /No transaction authority/);
  assert.match(text, /Room notes/);
  assert.match(text, /Memory loaded/);
  assert.match(text, /Mission active/);
  assert.match(text, /Review queue/);
  assert.match(text, /2 pinned/);
  assert.match(text, /2 memory cues ready/);
  assert.match(text, /2 agents in room/);
  assert.equal(root.querySelector('.console-proposal-list'), null);
  assert.match(root.querySelector('.console-thread-proposal')?.textContent ?? '', /Review gate/);
  assert.match(root.querySelector('.console-thread-context-summary')?.textContent ?? '', /Room notes/);
  assert.equal(root.querySelector('.console-thread-quickfacts'), null);
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

  assert.match(text, /Room notes/);
  assert.match(text, /Session recall/);
  assert.match(text, /I remember this wallet/);
  assert.match(text, /review-only proposals/);
  assert.equal(root.querySelector('.console-signal-grid'), null);
  assert.match(root.querySelector('.console-thread-activity')?.textContent ?? '', /Session recall/);
});
