import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import { renderPublicToolsPanel } from '../src/tool-manager.js';

const SAFETY_COPY = 'Discovery metadata only. These cards do not call tools, grant access, release credentials, transfer custody, or prove trust by payment alone.';

function setup(html) {
  const dom = new JSDOM(`<!doctype html><main id="app">${html}</main>`);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  return dom.window.document.querySelector('#app');
}

function bankrTool(overrides = {}) {
  return {
    fragment_id: 'frag_tool_bendr_lookup',
    multipass_id: 'mp_bendr_2',
    tool_id: 'bendr-lookup',
    registry: 'bankr_x402_cloud',
    name: 'Bendr profile lookup',
    description: 'Looks up public Multipass profile context.',
    endpoint_url: 'https://api.bankr.example/tools/bendr/lookup',
    manifest_url: 'https://api.bankr.example/tools/bendr/lookup/manifest.json',
    pricing: { model: 'fixed', amount: '0.02', asset: 'USDC', chain_id: 8453 },
    schemas: { input_summary: 'Multipass slug or Helixa ID.', output_summary: 'Public profile JSON.' },
    verifiability: { tier: 'provider_verified', summary: 'Imported from Bankr x402 Cloud.' },
    status: 'verified',
    assurance_level: 'platform_verified',
    last_checked_at: '2026-06-24T00:05:00Z',
    ...overrides,
  };
}

function openSeaStyleTool(overrides = {}) {
  return {
    fragment_id: 'frag_tool_aura_manifest',
    multipass_id: 'mp_quigbot_81',
    tool_id: 'aura-marketplace-manifest',
    registry: 'opensea_manifest',
    name: 'Agent Aura listing manifest',
    description: 'Public marketplace metadata for the Agent Aura item.',
    endpoint_url: 'https://opensea.io/assets/base/0x2e3b541c59d38b84e3bc54e977200230a204fe60/81',
    manifest_url: 'https://metadata.example.test/agent-aura/81.json',
    manifest_hash: 'sha256:def456',
    creator_address: '0x17d700000000000000000000000000000000bDe4',
    pricing: { model: 'free', amount: null, asset: null, chain_id: null },
    schemas: { input_summary: 'NFT contract and token ID.', output_summary: 'Marketplace listing metadata.' },
    verifiability: { tier: 'registry_backed', summary: 'Creator address and manifest hash are published.' },
    status: 'stale',
    assurance_level: 'issuer_attested',
    ...overrides,
  };
}

test('renderPublicToolsPanel renders Bankr x402 card metadata without execution controls', () => {
  const root = setup(renderPublicToolsPanel({ tools: { tools: [bankrTool()] } }));
  const panel = root.querySelector('.public-tools-panel');
  assert.ok(panel);
  assert.equal(panel.getAttribute('aria-label'), 'Tools and services');
  assert.match(panel.textContent, /Tools and services/);
  assert.match(panel.textContent, /Bendr profile lookup/);
  assert.match(panel.textContent, /api\.bankr\.example\/tools\/bendr\/lookup/);
  assert.match(panel.textContent, /0\.02 USDC on chain 8453/);
  assert.match(panel.textContent, /Multipass slug or Helixa ID/);
  assert.match(panel.textContent, /Public profile JSON/);
  assert.match(panel.textContent, /verified/);
  assert.match(panel.textContent, /platform verified/);
  assert.match(panel.textContent, /provider verified/);
  assert.match(panel.textContent, new RegExp(SAFETY_COPY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(panel.querySelector('button, form, input, textarea, select, [data-action]'), null);
});

test('renderPublicToolsPanel renders OpenSea-style registry manifest metadata', () => {
  const root = setup(renderPublicToolsPanel({ tools: { tools: [openSeaStyleTool()] } }));
  const card = root.querySelector('.public-tool-card');
  assert.ok(card);
  assert.match(card.textContent, /Agent Aura listing manifest/);
  assert.match(card.textContent, /opensea manifest/);
  assert.match(card.textContent, /0x17d700000000000000000000000000000000bDe4/);
  assert.match(card.textContent, /metadata\.example\.test\/agent-aura\/81\.json/);
  assert.match(card.textContent, /registry backed/);
  assert.match(card.textContent, /Creator address and manifest hash are published/);
  assert.equal([...card.querySelectorAll('a')].some((link) => link.href === 'https://metadata.example.test/agent-aura/81.json'), true);
});

test('renderPublicToolsPanel returns an empty string when no public tools are present', () => {
  assert.equal(renderPublicToolsPanel(), '');
  assert.equal(renderPublicToolsPanel({ tools: { tools: [] } }), '');
  assert.equal(renderPublicToolsPanel({ tools: null }), '');
  assert.equal(renderPublicToolsPanel({ tools: { tools: [bankrTool({ visibility: 'private' }), bankrTool({ visibility: 'GATED' }), bankrTool({ visibility: 'hidden' })] } }), '');
});

test('renderPublicToolsPanel safety copy is discovery-only and narrowly negated', () => {
  const root = setup(renderPublicToolsPanel({ tools: { tools: [bankrTool()] } }));
  const panelText = root.textContent;
  assert.match(panelText, /Discovery metadata only/);
  assert.match(panelText, /do not call tools/);
  assert.match(panelText, /grant access/);
  assert.match(panelText, /release credentials/);
  assert.match(panelText, /transfer custody/);
  assert.match(panelText, /prove trust by payment alone/);
  assert.doesNotMatch(panelText, /execute tool|access granted|credentials released|buy trust|trust purchased|custody transferred/i);
});

test('renderPublicToolsPanel does not invent private fields and escapes public values', () => {
  const root = setup(renderPublicToolsPanel({
    tools: {
      tools: [bankrTool({
        name: '<img src=x onerror=alert(1)>',
        description: '<script>alert(1)</script>',
        endpoint_url: 'javascript:alert(1)',
        manifest_url: 'https://safe.example.test/manifest.json',
        private_secret: 'sk_live_should_not_render',
        access: { private_token: 'vault-secret' },
      })],
    },
  }));

  assert.equal(root.querySelector('img, script'), null);
  assert.match(root.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(root.innerHTML, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(root.innerHTML, /sk_live_should_not_render|vault-secret/);
  assert.doesNotMatch(root.innerHTML, /javascript:alert/);
  assert.match(root.textContent, /No safe public endpoint URL published/);
});
