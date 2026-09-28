import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import { renderConsoleAgentThread } from '../src/console-agent-thread.js';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromiumPath = process.env.CHROMIUM_PATH || '/snap/bin/chromium';
const png = readFileSync(path.resolve(webRoot, 'public/helixa-logo.png'));

function pageHtml() {
  const initial = renderConsoleAgentThread({
    agentName: 'Looper #617', transport: 'xmtp_group', participants: [{ displayName: 'Looper #617' }], messages: [],
  });
  const response = renderConsoleAgentThread({
    agentName: 'Looper #617', transport: 'xmtp_group', participants: [{ displayName: 'Looper #617' }],
    messages: [
      { id: 'human-image', role: 'human', senderLabel: 'You', text: 'What is in this image?', attachment: { kind: 'image', filename: 'proof.png', mimeType: 'image/png', base64: png.toString('base64') } },
      { id: 'looper-vision', role: 'agent', senderLabel: 'Looper #617', text: 'I can see the uploaded PNG and the caption. No action was executed.', inferenceProvider: 'bankr_llm_gateway' },
    ],
  });
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
  <link rel="stylesheet" href="/src/styles.css"></head><body>
  <main class="record-shell multipass-console-shell"><section class="console-cred-card"><strong>CRED 72</strong><span>QUALIFIED</span></section><div id="thread">${initial}</div></main>
  <script type="module">
    import { prepareConsoleImage, createImagePreview, preparedImageBlob } from '/src/console-image-preparation.js';
    const root = document.querySelector('#thread');
    const form = root.querySelector('[data-action="send-console-agent-message"]');
    const preview = createImagePreview();
    let prepared = null;
    form.querySelector('[data-console-image-input]').addEventListener('change', async (event) => {
      prepared = await prepareConsoleImage(event.target.files[0]);
      const prior = form.querySelector('[data-console-image-preview]');
      prior?.remove();
      const surface = document.createElement('div');
      surface.className = 'console-composer-image-preview';
      surface.dataset.consoleImagePreview = '';
      const image = document.createElement('img');
      image.src = preview.set(preparedImageBlob(prepared));
      image.alt = 'Preview of ' + prepared.filename;
      const label = document.createElement('strong');
      label.textContent = prepared.filename;
      surface.append(image, label);
      form.append(surface);
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!prepared) return;
      preview.clear();
      root.innerHTML = ${JSON.stringify(response)};
    });
  </script></body></html>`;
}

function createServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(pageHtml());
      return;
    }
    if (url.pathname === '/src/styles.css' || url.pathname === '/src/console-image-preparation.js') {
      const file = path.resolve(webRoot, url.pathname.slice(1));
      response.writeHead(200, { 'content-type': file.endsWith('.css') ? 'text/css' : 'text/javascript' });
      response.end(readFileSync(file));
      return;
    }
    response.writeHead(404); response.end();
  });
}

test('production-like Chromium image upload renders preview and mocked Looper vision response without overflow', { timeout: 60_000 }, async (t) => {
  if (!existsSync(chromiumPath)) return t.skip(`Chromium not installed at ${chromiumPath}`);
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox'] });
  try {
    for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
      const attachmentStyles = await page.locator('.console-attachment-button').evaluate((element) => ({
        color: getComputedStyle(element).color,
        backgroundColor: getComputedStyle(element).backgroundColor,
        helpColor: getComputedStyle(document.querySelector('#console-image-help')).color,
      }));
      assert.equal(attachmentStyles.color, 'rgb(248, 243, 236)', `${viewport.name} attachment label contrast`);
      assert.equal(attachmentStyles.backgroundColor, 'rgba(248, 243, 236, 0.06)', `${viewport.name} attachment background`);
      assert.equal(attachmentStyles.helpColor, 'rgba(244, 239, 231, 0.68)', `${viewport.name} attachment help contrast`);
      await page.locator('[data-console-image-input]').setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: png });
      try {
        await page.locator('[data-console-image-preview]').waitFor({ timeout: 8_000 });
      } catch {
        assert.fail(JSON.stringify({ pageErrors, imageError: await page.locator('.console-image-error').textContent() }));
      }
      await page.locator('textarea[name="message"]').fill('What is in this image?');
      await page.locator('.console-send-button').click();
      await page.getByText('I can see the uploaded PNG and the caption.').waitFor();
      const result = await page.evaluate(() => {
        const inline = document.querySelector('.console-message-image img');
        const composer = document.querySelector('.console-thread-composer');
        return {
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          composerOverflow: composer.scrollWidth > composer.clientWidth,
          imageLoaded: Boolean(inline && inline.complete && inline.naturalWidth > 0),
          imageFits: Boolean(inline && inline.getBoundingClientRect().right <= document.documentElement.clientWidth),
          alt: inline?.alt ?? '',
          cred: document.querySelector('.console-cred-card')?.textContent ?? '',
        };
      });
      assert.deepEqual(pageErrors, []);
      assert.equal(result.overflow, false, `${viewport.name} document overflow`);
      assert.equal(result.composerOverflow, false, `${viewport.name} composer overflow`);
      assert.equal(result.imageLoaded, true);
      assert.equal(result.imageFits, true);
      assert.match(result.alt, /Image sent by You: proof.png/);
      assert.match(result.cred, /CRED 72.*QUALIFIED/s);
      await page.screenshot({ path: `/tmp/multipass-image-chat-${viewport.name}.png`, fullPage: true });
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
