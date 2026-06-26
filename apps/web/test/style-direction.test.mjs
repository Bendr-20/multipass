import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test('visual direction keeps the original warm Multipass palette', async () => {
  const css = await readFile(join(webRoot, 'src/styles.css'), 'utf8');

  assert.match(css, /--canvas: #f4efe6;/);
  assert.match(css, /--paper: #fffaf1;/);
  assert.match(css, /--ink: #191b1c;/);
  assert.equal(css.includes('--canvas: #090b12;'), false);
  assert.equal(css.includes('--paper: #111724;'), false);
  assert.equal(css.includes('linear-gradient(135deg, var(--blue), #b490ff)'), false);
});


test('share panel is styled as a share card instead of an input form on mobile', async () => {
  const css = await readFile(join(webRoot, 'src/styles.css'), 'utf8');

  assert.match(css, /\.share-url\s*{/);
  assert.match(css, /\.share-hint\s*{/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.share-panel[\s\S]*grid-template-columns: 1fr;/);
  assert.doesNotMatch(css, /\.share-panel input/);
});


test('change review ledger tones only the review state column', async () => {
  const css = await readFile(join(webRoot, 'src/styles.css'), 'utf8');

  assert.match(css, /\.change-review-row\.tone-verified > div:last-child strong/);
  assert.match(css, /\.change-review-row\.tone-review > div:last-child strong/);
  assert.match(css, /\.change-review-row\.tone-paused > div:last-child strong/);
  assert.doesNotMatch(css, /\.change-review-row\.tone-verified strong:last-child/);
});
