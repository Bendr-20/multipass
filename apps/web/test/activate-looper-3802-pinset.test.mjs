import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const BUILDER_PATH = new URL('../scripts/build-activate-looper-3802.mjs', import.meta.url);
const TEMPLATE_PATH = new URL('../owner-tools/activate-looper-3802/index.template.html', import.meta.url);
const PAGE_PATH = new URL('../owner-tools/activate-looper-3802/index.html', import.meta.url);
const INLINE_MARKER = '/*__ACTIVATE_LOOPER_3802_INLINE__*/';
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src https://mainnet.base.org https://base.drpc.org https://base-rpc.publicnode.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
const BUTTON_IDS = ['connect', 'activate', 'resume', 'retry', 'acknowledge'];
const IMMUTABLE_DOM_IDS = [
  'network',
  'connected-wallet',
  'sponsor',
  'holder',
  'loopers-proxy',
  'loopers-implementation',
  'registry',
  'account-implementation',
  'salt',
  'account',
  'account-deployment-state',
  'account-balance',
  'identity-id',
  'identity-uri',
  'identity-controller-status',
  'estimated-gas',
  'estimated-fee',
  'transaction-semantics',
  'status',
  'transaction',
];

test('generated artifact equals the builder output with its sole inline marker replaced', async () => {
  const { buildExpectedHtml } = await import(BUILDER_PATH.href);
  const [template, actual] = await Promise.all([
    readFile(TEMPLATE_PATH, 'utf8'),
    readFile(PAGE_PATH),
  ]);

  assert.equal(template.split(INLINE_MARKER).length - 1, 1, 'template must contain exactly one inline marker');
  assert.equal(actual.includes(Buffer.from(INLINE_MARKER)), false, 'generated artifact must replace the inline marker');
  assert.deepEqual(actual, Buffer.from(await buildExpectedHtml(), 'utf8'));
});

test('static DOM is a noindex, closed-input activation shell', async () => {
  const html = await readFile(PAGE_PATH, 'utf8');
  const dom = new JSDOM(html);
  const { document } = dom.window;

  assert.equal(document.querySelector('meta[name="robots"]')?.content, 'noindex, nofollow, noarchive');
  assert.equal(document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content, CSP);
  assert.equal(document.querySelectorAll('script[src], link[rel="stylesheet"], iframe, object, embed').length, 0);
  assert.equal(document.scripts.length, 1);
  assert.equal(document.querySelectorAll('input, textarea, select, [contenteditable]').length, 0);
  assert.deepEqual([...document.querySelectorAll('button')].map(({ id }) => id), BUTTON_IDS);
  assert.deepEqual([...document.querySelectorAll('[data-contract-output]')].map(({ id }) => id), IMMUTABLE_DOM_IDS);

  for (const id of IMMUTABLE_DOM_IDS) {
    assert.equal(document.querySelectorAll(`#${id}`).length, 1, `expected exactly one #${id}`);
  }
  for (const id of BUTTON_IDS.slice(1)) {
    const button = document.getElementById(id);
    assert.ok(button.disabled || button.hidden, `#${id} must start disabled or hidden`);
  }
});

test('builder enforces its exact manifest, marker count, and LF output', async () => {
  const { GENERATED_BANNER, SOURCE_MANIFEST, renderActivationHtml } = await import(BUILDER_PATH.href);
  assert.deepEqual(SOURCE_MANIFEST, [
    '00-namespace.js',
    '01-pinset-encoding.js',
    '02-public-rpc-transport.js',
    '03-snapshot-validator.js',
    '04-wallet-boundary.js',
    '05-attempt-store.js',
    '06-cross-tab-coordinator.js',
    '07-receipt-trace-verifier.js',
    '08-controller-renderer.js',
    '09-bootstrap.js',
  ]);
  const sourceFiles = Object.fromEntries(SOURCE_MANIFEST.map((name) => [name, `// ${name}\r\n`]));
  const template = `<script>${INLINE_MARKER}</script>\r\n`;

  const rendered = renderActivationHtml({ template, sourceFiles });
  assert.ok(rendered.startsWith(`${GENERATED_BANNER}\n`));
  assert.equal(rendered.includes('\r'), false);
  assert.equal(rendered.includes(INLINE_MARKER), false);
  let previous = -1;
  for (const name of SOURCE_MANIFEST) {
    const position = rendered.indexOf(`// ${name}`);
    assert.ok(position > previous, `${name} must be concatenated in manifest order`);
    previous = position;
  }

  const missing = { ...sourceFiles };
  delete missing[SOURCE_MANIFEST.at(-1)];
  assert.throws(() => renderActivationHtml({ template, sourceFiles: missing }), /manifest/i);
  assert.throws(
    () => renderActivationHtml({ template, sourceFiles: { ...sourceFiles, '10-extra.js': '// no' } }),
    /manifest/i,
  );
  assert.throws(() => renderActivationHtml({ template: '<script></script>', sourceFiles }), /exactly one inline marker/i);
  assert.throws(() => renderActivationHtml({ template: `${template}${template}`, sourceFiles }), /exactly one inline marker/i);
});
