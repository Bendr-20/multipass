import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = join(webRoot, '../..');

const checkedFiles = [
  join(webRoot, 'src/content.js'),
  join(webRoot, 'src/app.js'),
  join(webRoot, 'src/styles.css'),
  join(repoRoot, 'docs/superpowers/specs/2026-06-24-multipass-protocol-artifact-visual-redesign.md'),
  join(repoRoot, 'docs/superpowers/plans/2026-06-24-multipass-protocol-artifact-redesign.md'),
];

const bannedTerms = [
  'pass' + 'port',
  'Multi ' + 'Pass',
  '.' + 'agent',
  'Legen' + 'dary',
  'buy ' + 'reputation',
  'purchase ' + 'reputation',
  'human-owned, ' + 'agent-managed',
];

const emojiPattern = /[\u{1F300}-\u{1FAFF}]/u;

test('Protocol Artifact web copy avoids blocked wording', async () => {
  for (const file of checkedFiles) {
    const text = await readFile(file, 'utf8');
    for (const term of bannedTerms) {
      assert.equal(text.includes(term), false, `${file} contains blocked wording: ${term}`);
    }
    assert.equal(text.includes(String.fromCharCode(8212)), false, `${file} contains em dash`);
    assert.equal(emojiPattern.test(text), false, `${file} contains emoji`);
  }
});
