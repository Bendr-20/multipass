import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import test from 'node:test';

import { createApp } from '../src/app.js';

const dataUrl = new URL('../src/runtime-submission-data.js', import.meta.url);
const rendererUrl = new URL('../src/runtime-submission.js', import.meta.url);
const manifestUrl = new URL('../../../docs/hackathon/bankr-runtime-artifact-manifest.md', import.meta.url);
const manifestScriptUrl = new URL('../scripts/write-runtime-submission-manifest.mjs', import.meta.url);

function setupDom(url) {
  const dom = new JSDOM('<!doctype html><html><head><meta name="description" content=""><meta property="og:url" content=""><meta property="og:title" content=""><meta property="og:description" content=""><meta name="twitter:title" content=""><meta name="twitter:description" content=""></head><body><main id="app"></main></body></html>', { url });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  return dom.window.document.querySelector('#app');
}

test('RUNTIME submission modules and deterministic manifest exist', async () => {
  assert.equal(existsSync(dataUrl), true, 'structured public submission data must exist');
  assert.equal(existsSync(rendererUrl), true, 'public submission renderer must exist');
  assert.equal(existsSync(manifestScriptUrl), true, 'artifact manifest writer must exist');
  assert.equal(existsSync(manifestUrl), true, 'generated public artifact manifest must exist');

  const { RUNTIME_SUBMISSION, buildRuntimeArtifactManifest } = await import(dataUrl);
  assert.equal(RUNTIME_SUBMISSION.links.console, 'https://helixa.xyz/multipass/console');
  assert.equal(RUNTIME_SUBMISSION.links.repository, 'https://github.com/Bendr-20/multipass');
  assert.equal(RUNTIME_SUBMISSION.form.projectSummary.length <= 2000, true);
  assert.deepEqual(RUNTIME_SUBMISSION.proofs.map((proof) => proof.label), [
    'Bankr gateway',
    'XMTP live',
    'Sibyl memory',
    'ERC-8004 identity',
    'Review-only',
  ]);
  const serialized = JSON.stringify(RUNTIME_SUBMISSION);
  assert.doesNotMatch(serialized, /(?:cookie|csrf|private key|api key)/i);
  assert.doesNotMatch(serialized, /(?:conversationId|messageId|inboxId)/i);
  assert.equal(readFileSync(manifestUrl, 'utf8'), buildRuntimeArtifactManifest(RUNTIME_SUBMISSION));
});

test('public RUNTIME route explains the product without wallet or private API access', async () => {
  const root = setupDom('https://helixa.xyz/multipass/runtime');
  const app = createApp({
    root,
    fetchImpl: async () => { throw new Error('public packet must not fetch private runtime data'); },
  });

  await app.start();

  const packet = root.querySelector('.runtime-submission-shell');
  assert.ok(packet);
  assert.match(packet.textContent, /Loopers Runtime Console/);
  assert.match(packet.textContent, /Bankr gateway/);
  assert.match(packet.textContent, /XMTP live/);
  assert.match(packet.textContent, /Sibyl memory/);
  assert.match(packet.textContent, /ERC-8004 identity/);
  assert.match(packet.textContent, /Review-only/);
  assert.equal(packet.querySelector('form, input, textarea, [data-action="connect-console-wallet"]'), null);
  assert.equal(packet.querySelector('a[href="https://helixa.xyz/multipass/console"]')?.textContent.trim(), 'Open live Console');
  assert.equal(document.title, 'Loopers Runtime Console | Bankr RUNTIME');
  assert.equal(document.querySelector('meta[property="og:url"]')?.content, 'https://helixa.xyz/multipass/runtime');
});
