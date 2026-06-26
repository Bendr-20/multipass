import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const indexPath = join(webRoot, 'index.html');
const ogImagePath = join(webRoot, 'public', 'og-preview.svg');

test('index contains Multipass portable agent identity share metadata', async () => {
  const html = await readFile(indexPath, 'utf8');

  assert.match(html, /<title>Multipass - Portable Agent Identity<\/title>/);
  assert.match(html, /<meta name="description" content="Identity, proof, custody, Cred, and discovery context for agents and AI-native systems\." \/>/);
  assert.match(html, /<meta property="og:title" content="Multipass - Portable Agent Identity" \/>/);
  assert.match(html, /<meta property="og:description" content="Identity, proof, custody, Cred, and discovery context for agents and AI-native systems\." \/>/);
  assert.match(html, /<meta property="og:image" content="https:\/\/helixa\.xyz\/multipass\/og-preview\.svg" \/>/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/);
  assert.match(html, /<meta name="twitter:title" content="Multipass - Portable Agent Identity" \/>/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/helixa\.xyz\/multipass\/og-preview\.svg" \/>/);
});

test('share preview image exists as a static public asset', () => {
  assert.equal(existsSync(ogImagePath), true);
});
