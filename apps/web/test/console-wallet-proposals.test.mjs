import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import {
  createConsoleCapabilityViewModel,
  createUnverifiedTransferSuggestion,
  renderConsoleCapabilitySurface,
  renderUnverifiedTransferSuggestion,
} from '../src/console-wallet-proposals.js';

const capabilities = {
  version: `sha256:${'a'.repeat(64)}`,
  skills: [{
    id: 'bankr',
    name: 'Bankr',
    summary: 'Crypto market, wallet, trading, and token-operation specialist.',
    capabilities: ['price_read', 'transfer'],
    enabledCapabilities: ['explain', 'propose_transfer'],
    execution: 'human_review',
    credentialAccess: false,
    constraints: ['No Bankr wallet is used for Looper funds.'],
  }],
};

const messages = [
  { id: 'published-1', role: 'agent', participantId: 'agent:1', senderLabel: 'Bendr', text: 'One suggestion.' },
  { id: 'published-2', role: 'agent', participantId: 'agent:2', senderLabel: 'Quigbot', text: 'Another suggestion.' },
];
const participants = [
  { participantId: 'agent:1', displayName: 'Bendr' },
  { participantId: 'agent:2', displayName: 'Quigbot' },
];
const candidate = {
  skill: 'bankr',
  assetType: 'erc20',
  assetContract: '0x1111111111111111111111111111111111111111',
  recipient: '0x2222222222222222222222222222222222222222',
  amountBaseUnits: '1234567890123456789',
  rationale: 'Model-supplied rationale for operator review.',
  sourceMessageId: 'published-2',
  participantId: 'agent:2',
  sourceOrdinal: 0,
  skillRefs: ['bankr'],
};

function parse(html) {
  return new JSDOM(`<!doctype html><main>${html}</main>`).window.document.querySelector('main');
}

function assertDeepFrozen(value) {
  if (value && typeof value === 'object') {
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) assertDeepFrozen(child);
  }
}

test('builds an exact, UTF-8-bounded, recursively frozen unverified transfer view model', () => {
  const model = createUnverifiedTransferSuggestion(candidate, { capabilities, messages, participants });

  assert.deepEqual(model, {
    heading: 'Unverified transfer suggestion — awaiting server verification',
    assetType: 'erc20',
    assetContract: candidate.assetContract,
    recipient: candidate.recipient,
    amountBaseUnits: candidate.amountBaseUnits,
    rationale: candidate.rationale,
    skill: { id: 'bankr', name: 'Bankr' },
    participant: { id: 'agent:2', label: 'Quigbot' },
    sourceMessage: { id: 'published-2' },
  });
  assertDeepFrozen(model);
  for (const forbidden of ['chain', 'chainId', 'account', 'owner', 'decimals', 'formattedAmount', 'expiry', 'expiresAt', 'revision', 'lifecycle', 'state', 'authority', 'verified']) {
    assert.equal(forbidden in model, false);
  }
});

test('rejects unknown authority or lifecycle fields and invalid provenance instead of repairing them', () => {
  for (const [key, value] of [['chainId', 8453], ['owner', candidate.recipient], ['decimals', 18], ['formattedAmount', '1.23'], ['expiresAt', 'tomorrow'], ['revision', 1], ['state', 'draft'], ['authority', 'browser']]) {
    assert.throws(
      () => createUnverifiedTransferSuggestion({ ...candidate, [key]: value }, { capabilities, messages, participants }),
      /unknown or missing fields/i,
    );
  }
  assert.throws(
    () => createUnverifiedTransferSuggestion({ ...candidate, participantId: 'agent:1' }, { capabilities, messages, participants }),
    /provenance/i,
  );
  assert.throws(
    () => createUnverifiedTransferSuggestion({ ...candidate, sourceMessageId: 'missing' }, { capabilities, messages, participants }),
    /provenance/i,
  );
  assert.throws(
    () => createUnverifiedTransferSuggestion({ ...candidate, rationale: '🧬'.repeat(129) }, { capabilities, messages, participants }),
    /UTF-8 bytes/i,
  );
  assert.throws(
    () => createUnverifiedTransferSuggestion({ ...candidate, sourceOrdinal: 1 }, { capabilities, messages, participants }),
    /sourceOrdinal/i,
  );
  assert.throws(
    () => createUnverifiedTransferSuggestion({ ...candidate, skillRefs: ['bankr', 'unknown'] }, { capabilities, messages, participants }),
    /skill provenance/i,
  );
  assert.throws(
    () => createUnverifiedTransferSuggestion({ ...candidate, amountBaseUnits: '9'.repeat(79) }, { capabilities, messages, participants }),
    /UTF-8 bytes/i,
  );
});

test('renders only a read-only suggestion with complete model-supplied values and no wallet linkage', () => {
  const model = createUnverifiedTransferSuggestion(candidate, { capabilities, messages, participants });
  const root = parse(renderUnverifiedTransferSuggestion(model));
  const surface = root.querySelector('.console-unverified-transfer');

  assert.ok(surface);
  assert.match(surface.textContent, /Unverified transfer suggestion — awaiting server verification/);
  assert.match(surface.textContent, /erc20/);
  assert.match(surface.textContent, new RegExp(candidate.assetContract));
  assert.match(surface.textContent, new RegExp(candidate.recipient));
  assert.match(surface.textContent, new RegExp(candidate.amountBaseUnits));
  assert.match(surface.textContent, /Model-supplied rationale/);
  assert.match(surface.textContent, /Bankr/);
  assert.match(surface.textContent, /Quigbot/);
  assert.match(surface.textContent, /published-2/);
  assert.equal(surface.querySelectorAll('button, input, textarea, select, form, [data-action], [data-wallet], [data-provider], [data-calldata], [contenteditable="true"]').length, 0);
  assert.doesNotMatch(surface.innerHTML, /calldata|provider|wallet-controller|send-looper-agent-wallet|console-looper-wallet-send|\bverified transfer|approve|submit/i);
  assert.doesNotMatch(surface.textContent, /chain|owner|account|decimals|formatted|expiry|revision|lifecycle|authority/i);
});

test('native suggestions display the model-supplied null contract without inventing an address', () => {
  const model = createUnverifiedTransferSuggestion({ ...candidate, assetType: 'native', assetContract: null }, { capabilities, messages, participants });
  const root = parse(renderUnverifiedTransferSuggestion(model));

  assert.match(root.querySelector('.console-unverified-transfer')?.textContent ?? '', /Asset contract\s*None \(native\)/i);
  assert.equal(root.querySelectorAll('.console-unverified-transfer code').length, 3);
});

test('renders bounded capability knowledge only from a valid enabled catalog', () => {
  const model = createConsoleCapabilityViewModel(capabilities);
  assertDeepFrozen(model);
  const root = parse(renderConsoleCapabilitySurface(model));
  const surface = root.querySelector('.console-skill-capabilities');

  assert.ok(surface);
  assert.match(surface.textContent, /Understands/);
  assert.match(surface.textContent, /Current USD price/);
  assert.doesNotMatch(surface.textContent, /Market research|Portfolio read|Swap|Token launch/);
  assert.match(surface.textContent, /Can propose/);
  assert.match(surface.textContent, /Transfer/);
  assert.match(surface.textContent, /Cannot execute directly/);
  assert.match(surface.textContent, /catalog knowledge/i);
  assert.equal(surface.querySelectorAll('button, input, form, [data-action]').length, 0);
  assert.throws(() => createConsoleCapabilityViewModel({ ...capabilities, authority: 'browser' }), /unknown or missing fields/i);
});
