import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import { renderConsoleAgentThread } from '../src/console-agent-thread.js';

const capabilities = {
  version: `sha256:${'b'.repeat(64)}`,
  skills: [{
    id: 'bankr', name: 'Bankr', summary: 'Bounded catalog knowledge.',
    capabilities: ['price_read', 'transfer'], enabledCapabilities: ['explain', 'price_read', 'propose_transfer'],
    execution: 'human_review', credentialAccess: false, constraints: ['No direct execution.'],
  }],
};

const messages = [
  { id: 'message-a', role: 'agent', participantId: 'agent-a', senderLabel: 'Agent A', text: 'First response.' },
  { id: 'message-b', role: 'agent', participantId: 'agent-b', senderLabel: 'Agent B', text: 'Second response.' },
];
const participants = [
  { participantId: 'agent-a', displayName: 'Agent A' },
  { participantId: 'agent-b', displayName: 'Agent B' },
];
const proposalCandidates = [{
  skill: 'bankr', assetType: 'native', assetContract: null,
  recipient: '0x2222222222222222222222222222222222222222', amountBaseUnits: '9',
  rationale: 'Exact current-message suggestion.', sourceMessageId: 'message-b', participantId: 'agent-b',
  sourceOrdinal: 0, skillRefs: ['bankr'],
}];

function render(thread) {
  return new JSDOM(`<!doctype html><main>${renderConsoleAgentThread(thread)}</main>`).window.document.querySelector('main');
}

test('places each unverified candidate directly beside only its exact published agent message', () => {
  const root = render({ agentName: 'Agent A', messages, participants, capabilities, proposalCandidates });
  const candidate = root.querySelector('.console-unverified-transfer');
  const secondMessage = root.querySelector('[data-console-message-identity="id:message-b"]');

  assert.ok(candidate);
  assert.equal(secondMessage?.nextElementSibling, candidate);
  assert.equal(root.querySelector('[data-console-message-identity="id:message-a"]')?.nextElementSibling, secondMessage);
  assert.equal(candidate.tagName, 'DETAILS');
  assert.equal(candidate.open, false);
  assert.match(candidate.textContent, /Agent B/);
  assert.match(candidate.textContent, /message-b/);
  assert.equal(root.querySelectorAll('.console-unverified-transfer').length, 1);
});

test('withholds invalid or stale candidate provenance without moving it to another matching-looking message', () => {
  const stale = { ...proposalCandidates[0], sourceMessageId: 'old-message' };
  const wrongParticipant = { ...proposalCandidates[0], participantId: 'agent-a' };
  const root = render({ agentName: 'Agent A', messages, participants, capabilities, proposalCandidates: [stale, wrongParticipant] });

  assert.equal(root.querySelector('.console-unverified-transfer'), null);
  assert.doesNotMatch(root.textContent, /Unverified transfer suggestion/);

  const duplicateMessageRoot = render({
    agentName: 'Agent A',
    messages: [...messages, { ...messages[1] }],
    participants,
    capabilities,
    proposalCandidates,
  });
  assert.equal(duplicateMessageRoot.querySelector('.console-unverified-transfer'), null);
});

test('shows skill capability copy only inside collapsed room details when an enabled response supplies both capability fields', () => {
  const enabled = render({ agentName: 'Agent A', messages, participants, capabilities, proposalCandidates: [] });
  const roomDetails = enabled.querySelector('.console-thread-secondary-details');
  const capabilitySurface = enabled.querySelector('.console-skill-capabilities');
  assert.ok(roomDetails);
  assert.equal(roomDetails.open, false);
  assert.equal(roomDetails.contains(capabilitySurface), true);
  assert.match(capabilitySurface?.textContent ?? '', /Understands.*Can propose.*Cannot execute directly/s);

  for (const thread of [
    { agentName: 'Agent A', messages, participants },
    { agentName: 'Agent A', messages, participants, capabilities },
    { agentName: 'Agent A', messages, participants, proposalCandidates: [] },
  ]) {
    const root = render(thread);
    assert.equal(root.querySelector('.console-skill-capabilities'), null);
    assert.doesNotMatch(root.textContent, /Cannot execute directly/);
  }
});

test('candidate surface itself has no control or generic wallet-form prefill linkage', () => {
  const root = render({ agentName: 'Agent A', messages, participants, capabilities, proposalCandidates });
  const candidate = root.querySelector('.console-unverified-transfer');

  assert.ok(candidate);
  assert.equal(candidate.querySelectorAll('button, input, textarea, select, form, [data-action], [data-wallet], [data-provider], [data-calldata]').length, 0);
  assert.equal(candidate.closest('.console-looper-wallet-send'), null);
  assert.equal(candidate.onclick, null);
});

test('renders accessible image controls, escaped captions, inline images, and safe placeholders', () => {
  const root = render({
    agentName: 'Image Looper',
    attachment: {
      prepared: { filename: 'preview.png', byteLength: 1024 },
      previewUrl: 'blob:https://helixa.test/preview',
    },
    messages: [
      {
        id: 'image-1', role: 'human', senderLabel: 'You', text: '<script>caption</script>',
        attachment: { filename: 'proof.png', mimeType: 'image/png', base64: 'iVBORw0KGgo=' },
      },
      {
        id: 'image-2', role: 'human', senderLabel: 'You', text: '',
        attachment: { kind: 'unsupported', filename: '<bad>.svg', unavailable: true },
      },
    ],
  });
  const input = root.querySelector('input[type="file"]');
  assert.equal(input.accept, 'image/jpeg,image/png,image/webp,image/gif');
  assert.ok(root.querySelector('[data-console-image-dropzone]'));
  assert.equal(root.querySelector('[data-action="remove-console-image"]')?.getAttribute('aria-label'), 'Remove attached image');
  const image = root.querySelector('.console-message-image img');
  assert.equal(image.src, 'data:image/png;base64,iVBORw0KGgo=');
  assert.match(image.alt, /Image sent by You: proof.png/);
  assert.match(root.textContent, /<script>caption<\/script>/);
  assert.equal(root.querySelector('script'), null);
  assert.match(root.querySelector('.console-message-image-placeholder')?.textContent ?? '', /Image unavailable/);
  assert.doesNotMatch(root.innerHTML, /<bad>\.svg/);

  const preparing = render({ agentName: 'Image Looper', attachment: { status: 'preparing' }, messages: [] });
  assert.equal(preparing.querySelector('form')?.getAttribute('aria-busy'), 'true');
  assert.match(preparing.querySelector('[role="status"]')?.textContent ?? '', /Preparing image/);
  assert.equal(preparing.querySelector('.console-send-button')?.disabled, true);
});
