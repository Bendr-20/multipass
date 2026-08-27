import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import {
  getInitialLooperStatusHudVisible,
  LOOPER_STATUS_HUD_STORAGE_KEY,
  normalizeStatus,
  renderLooperStatusCard,
  SAMPLE_LOOPER_STATUS_CARD,
  setLooperStatusHudVisible,
} from '../src/looper-status-card.js';

test('renderLooperStatusCard keeps approved art separate from live HUD data', () => {
  const dom = new JSDOM(renderLooperStatusCard(SAMPLE_LOOPER_STATUS_CARD));
  const root = dom.window.document;

  assert.equal(root.querySelector('.looper-status-art')?.getAttribute('src'), '/loopers/approved-only-agent-14.png');
  assert.match(root.querySelector('.looper-status-hud')?.textContent ?? '', /Active Agent/);
  assert.match(root.querySelector('.looper-status-readout')?.textContent ?? '', /Cred\s*Pending/);
  assert.match(root.querySelector('.looper-status-readout')?.textContent ?? '', /TBA\s*0x12\.\.\.9F/);
  assert.match(root.querySelector('.looper-status-readout')?.textContent ?? '', /Proof\s*Pending/);
  assert.equal(root.querySelector('[data-action="toggle-looper-status-hud"]')?.textContent.trim(), 'Hide status');
});

test('renderLooperStatusCard can render clean art without the HUD layer', () => {
  const dom = new JSDOM(renderLooperStatusCard(SAMPLE_LOOPER_STATUS_CARD, { hudVisible: false }));
  const root = dom.window.document;

  assert.ok(root.querySelector('.looper-status-art'));
  assert.equal(root.querySelector('.looper-status-hud'), null);
  assert.equal(root.querySelector('.looper-status-card')?.dataset.hud, 'hidden');
  assert.equal(root.querySelector('[data-action="toggle-looper-status-hud"]')?.textContent.trim(), 'Show status');
});

test('normalizeStatus clamps Cred and derives the five approved Cred tiers', () => {
  assert.equal(normalizeStatus({ credScore: 0 }).credTier, 'Junk');
  assert.equal(normalizeStatus({ credScore: 26 }).credTier, 'Marginal');
  assert.equal(normalizeStatus({ credScore: 72 }).credTier, 'Qualified');
  assert.equal(normalizeStatus({ credScore: 88 }).credTier, 'Prime');
  assert.equal(normalizeStatus({ credScore: 99 }).credTier, 'Preferred');
  assert.equal(normalizeStatus({ credScore: 999 }).credLabel, '100');
});

test('normalizeStatus refuses to trust Cred when the proof is invalid', () => {
  const status = normalizeStatus({ credScore: 72, proofState: 'invalid', walletValueUsd: '127.44' });

  assert.equal(status.credLabel, 'Proof invalid');
  assert.equal(status.credTier, 'Untrusted');
  assert.equal(status.proofLabel, 'Invalid');
  assert.equal(status.walletValueLabel, '$127.44');
});

test('Looper HUD visibility preference stores locally without requiring chain state', () => {
  const storage = new MapStorage();

  assert.equal(getInitialLooperStatusHudVisible(storage), true);
  setLooperStatusHudVisible(false, storage);
  assert.equal(storage.getItem(LOOPER_STATUS_HUD_STORAGE_KEY), 'hidden');
  assert.equal(getInitialLooperStatusHudVisible(storage), false);
  setLooperStatusHudVisible(true, storage);
  assert.equal(storage.getItem(LOOPER_STATUS_HUD_STORAGE_KEY), 'visible');
  assert.equal(getInitialLooperStatusHudVisible(storage), true);
});

class MapStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}
