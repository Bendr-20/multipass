import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { GENERATED_SHARE_CARDS } from '../src/generated-share-cards.js';
import { getAgentShareImageUrl } from '../src/share-cards.js';
import { STATIC_DEMO_DATA } from '../src/static-demo-data.js';

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const indexPath = join(webRoot, 'index.html');
const ogImagePath = join(webRoot, 'public', 'og-preview.png');
const shareRoot = join(webRoot, 'public', 'share');
const STALE_QUIGBOT_AURA_SHARE_JPEG_SHA256 = '038840a1d3474d9c9f5079fe6218634f2cfc111d30d679fd55709a7a8c655262';

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function imageSizeFromFile(path) {
  const bytes = readFileSync(path);
  if (bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG') {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), type: 'png' };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5), type: 'jpeg' };
      }
      offset += 2 + length;
    }
  }
  throw new Error(`Unsupported image header: ${path}`);
}

function numericStaticAgentCards() {
  return STATIC_DEMO_DATA.agentCards.filter((card) => /^\d+$/.test(String(card.tokenId ?? '')));
}

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
  for (const card of numericStaticAgentCards()) {
    const tokenId = String(card.tokenId);
    const htmlPath = join(shareRoot, tokenId, 'index.html');
    const jpgPath = join(shareRoot, `${tokenId}.jpg`);
    const pngPath = join(shareRoot, `${tokenId}.png`);
    const generated = GENERATED_SHARE_CARDS[tokenId];

    assert.ok(generated, `missing generated share manifest for ${tokenId}`);
    assert.equal(generated.tokenId, tokenId);
    assert.equal(generated.version, sha256File(jpgPath).slice(0, generated.version.length));
    assert.equal(generated.visualSource ?? null, card.visual?.imageUrl ?? null);

    assert.equal(existsSync(htmlPath), true);
    assert.equal(existsSync(jpgPath), true);
    assert.equal(existsSync(pngPath), true);
    assert.deepEqual(imageSizeFromFile(jpgPath), { width: 1200, height: 630, type: 'jpeg' });
    assert.deepEqual(imageSizeFromFile(pngPath), { width: 1200, height: 630, type: 'png' });
    assert.ok(statSync(jpgPath).size > 20_000);

    const html = await readFile(htmlPath, 'utf8');
    const shareUrl = `https://helixa.xyz/multipass/share/${tokenId}/`;
    const expectedImageUrl = getAgentShareImageUrl(generated, 'https://helixa.xyz');
    assert.ok(html.includes(`<title>${card.name} Multipass</title>`));
    assert.ok(html.includes(`<link rel="canonical" href="${shareUrl}" />`));
    assert.ok(html.includes(`<meta property="og:title" content="${card.name} Multipass" />`));
    assert.ok(html.includes(`<meta property="og:image" content="${expectedImageUrl}" />`));
    assert.ok(html.includes(`<meta property="og:image:secure_url" content="${expectedImageUrl}" />`));
    assert.ok(html.includes('<meta property="og:image:type" content="image/jpeg" />'));
    assert.ok(html.includes(`<meta name="twitter:image" content="${expectedImageUrl}" />`));
    assert.ok(html.includes(`<meta name="twitter:image:alt" content="${card.name} Multipass preview" />`));
    assert.ok(html.includes(`<img src="../${tokenId}.jpg" alt="${card.name} Multipass preview" />`));
    assert.ok(html.includes(`<a class="open-profile" href="https://helixa.xyz/multipass/?agent=${tokenId}">Open Multipass profile</a>`));
    assert.ok(html.includes(`window.location.replace('https://helixa.xyz/multipass/?agent=${tokenId}')`));

    if (card.visual?.imageUrl) {
      assert.ok(html.includes(`<meta name="multipass:visual-source" content="${card.visual.imageUrl}" />`));
    } else {
      assert.doesNotMatch(html, /multipass:visual-source/);
    }

    assert.match(html, /bot|crawl|spider/i);
    assert.doesNotMatch(html, /http-equiv="refresh"/);
  }
});

test('Bendr share preview uses the public Helixa aura image instead of initials fallback', async () => {
  const generated = GENERATED_SHARE_CARDS['1'];
  const html = await readFile(join(shareRoot, '1', 'index.html'), 'utf8');

  assert.equal(generated.visualSource, 'https://api.helixa.xyz/api/v2/aura/1.png');
  assert.match(html, /<meta name="multipass:visual-source" content="https:\/\/api\.helixa\.xyz\/api\/v2\/aura\/1\.png" \/>/);
});

test('Quigbot share preview image is not the stale Agent Aura card', () => {
  const imagePath = join(shareRoot, '81.jpg');

  assert.notEqual(sha256File(imagePath), STALE_QUIGBOT_AURA_SHARE_JPEG_SHA256);
});
