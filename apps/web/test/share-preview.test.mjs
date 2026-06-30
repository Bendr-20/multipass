import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const indexPath = join(webRoot, 'index.html');
const ogImagePath = join(webRoot, 'public', 'og-preview.png');
const shareRoot = join(webRoot, 'public', 'share');

test('index contains Multipass portable agent identity share metadata', async () => {
  const html = await readFile(indexPath, 'utf8');

  assert.match(html, /<title>Multipass - Portable Agent Identity<\/title>/);
  assert.match(html, /<meta name="description" content="Identity, proof, custody, Cred, and discovery context for agents and AI-native systems\." \/>/);
  assert.match(html, /<meta property="og:title" content="Multipass - Portable Agent Identity" \/>/);
  assert.match(html, /<meta property="og:description" content="Identity, proof, custody, Cred, and discovery context for agents and AI-native systems\." \/>/);
  assert.match(html, /<meta property="og:image" content="https:\/\/helixa\.xyz\/multipass\/og-preview\.png" \/>/);
  assert.match(html, /<meta property="og:image:type" content="image\/png" \/>/);
  assert.match(html, /<meta property="og:image:width" content="1200" \/>/);
  assert.match(html, /<meta property="og:image:height" content="630" \/>/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/);
  assert.match(html, /<meta name="twitter:title" content="Multipass - Portable Agent Identity" \/>/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/helixa\.xyz\/multipass\/og-preview\.png" \/>/);
});

test('share preview image exists as a static public asset', () => {
  assert.equal(existsSync(ogImagePath), true);
});

test('agent share routes expose per-agent X-compatible JPEG social preview metadata', async () => {
  const cases = [
    { tokenId: '1', name: 'Bendr 2.0' },
    { tokenId: '81', name: 'Quigbot' },
  ];

  for (const { tokenId, name } of cases) {
    const htmlPath = join(shareRoot, tokenId, 'index.html');
    const imagePath = join(shareRoot, `${tokenId}.jpg`);
    assert.equal(existsSync(htmlPath), true);
    assert.equal(existsSync(imagePath), true);
    assert.ok(statSync(imagePath).size > 20_000);

    const html = await readFile(htmlPath, 'utf8');
    const shareUrl = `https://helixa.xyz/multipass/share/${tokenId}/`;
    const imageUrl = `https://helixa.xyz/multipass/share/${tokenId}.jpg`;
    assert.ok(html.includes(`<title>${name} Multipass</title>`));
    assert.ok(html.includes(`<link rel="canonical" href="${shareUrl}" />`));
    assert.ok(html.includes(`<meta property="og:title" content="${name} Multipass" />`));
    assert.ok(html.includes(`<meta property="og:image" content="${imageUrl}" />`));
    assert.ok(html.includes(`<meta property="og:image:secure_url" content="${imageUrl}" />`));
    assert.ok(html.includes('<meta property="og:image:type" content="image/jpeg" />'));
    assert.ok(html.includes(`<meta name="twitter:image" content="${imageUrl}" />`));
    assert.ok(html.includes(`<meta name="twitter:image:alt" content="${name} Multipass preview" />`));
    assert.ok(html.includes(`<img src="../${tokenId}.jpg" alt="${name} Multipass preview" />`));
    assert.ok(html.includes(`<a class="open-profile" href="https://helixa.xyz/multipass/?agent=${tokenId}">Open Multipass profile</a>`));
    assert.ok(html.includes(`window.location.replace('https://helixa.xyz/multipass/?agent=${tokenId}')`));
    assert.match(html, /bot|crawl|spider/i);
    assert.doesNotMatch(html, /http-equiv="refresh"/);
  }
});
