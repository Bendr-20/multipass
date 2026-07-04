import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import { createOwnerCommandCenterSnapshot, renderOwnerCommandCenterSnapshot } from '../src/command-center.js';

function sampleCommandData() {
  return {
    profile: {
      display_name: 'Saved Bendr',
      owner_summary: { owner_state: 'claimed', verification_status: 'verified', visibility: 'public' },
    },
    tools: {
      tools: [
        { tool_id: 'cred-report', registry: 'bankr_x402_cloud', visibility: 'public', status: 'verified' },
        { tool_id: 'aura-manifest', registry: 'opensea_manifest', visibility: 'public', status: 'stale' },
        { tool_id: 'private-service', registry: 'bankr_x402_cloud', visibility: 'private', status: 'verified' },
      ],
    },
    fragments: {
      fragments: [
        { fragment_id: 'frag_route_primary', fragment_type: 'endpoint', visibility: 'public', status: 'pending', public_value: 'Primary API', endpoint_ref: { url: 'https://api.example.test/bendr', protocol: 'api' } },
        { fragment_id: 'frag_route_hidden', fragment_type: 'endpoint', visibility: 'hidden', status: 'pending', public_value: 'Hidden API', endpoint_ref: { url: 'https://hidden.example.test', protocol: 'api' } },
        { fragment_id: 'frag_receipt_one', fragment_type: 'receipt', visibility: 'public', status: 'historical', public_value: 'Receipt evidence retained.' },
      ],
    },
    receipt: { receipt_id: 'receipt_latest', status: 'settled' },
    changes: { entries: [{ message: 'Route refreshed.' }, { message: 'Tool metadata imported.' }] },
  };
}

function setup(html) {
  const dom = new JSDOM(`<!doctype html><main>${html}</main>`);
  return dom.window.document.querySelector('main');
}

test('owner command center snapshot counts only public product controls', () => {
  const snapshot = createOwnerCommandCenterSnapshot(sampleCommandData(), { claimCsrfToken: 'csrf-1' });

  assert.equal(snapshot.status, 'claimed');
  assert.equal(snapshot.visibility, 'public');
  assert.equal(snapshot.verification, 'verified');
  assert.equal(snapshot.metrics.publicTools.value, 2);
  assert.equal(snapshot.metrics.x402Tools.value, 1);
  assert.equal(snapshot.metrics.publicRoutes.value, 1);
  assert.equal(snapshot.metrics.recentReceipts.value, 3);
  assert.equal(snapshot.canEdit, true);
  assert.match(snapshot.nextAction, /refresh public discovery metadata/i);
});

test('owner command center renderer is product-shaped without execution or custody overclaims', () => {
  const root = setup(renderOwnerCommandCenterSnapshot(createOwnerCommandCenterSnapshot(sampleCommandData(), { claimCsrfToken: 'csrf-1' })));
  const text = root.textContent;

  assert.ok(root.querySelector('.owner-command-metrics'));
  assert.match(text, /Public tools/);
  assert.match(text, /x402 cards/);
  assert.match(text, /Public routes/);
  assert.match(text, /Recent receipts/);
  assert.match(text, /Discovery and display controls only/);
  assert.match(text, /does not call tools/);
  assert.match(text, /does not transfer custody/);
  assert.doesNotMatch(text, /execute tool|access granted|credentials released|buy trust|trust purchased|custody transferred|transfer ownership|grant permissions/i);
});
