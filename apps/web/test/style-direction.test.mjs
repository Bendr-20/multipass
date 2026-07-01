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


test('desktop Multipass profile uses a tighter polished profile layout', async () => {
  const css = await readFile(join(webRoot, 'src/styles.css'), 'utf8');
  const desktopBlock = css.slice(css.indexOf('@media (min-width: 901px)'));

  assert.match(desktopBlock, /\.multipass-profile-page > \.aura-card\s*{[^}]*grid-template-columns:\s*minmax\(300px, 380px\) minmax\(0, 1fr\);/s);
  assert.match(desktopBlock, /\.multipass-profile-page > \.aura-card \.aura-asset-frame\s*{[^}]*max-width:\s*380px;[^}]*justify-self:\s*start;/s);
  assert.match(desktopBlock, /\.multipass-profile-page > \.aura-card \.aura-item-meta\s*{[^}]*min-height:\s*0;[^}]*align-self:\s*stretch;[^}]*align-content:\s*center;/s);
  assert.match(desktopBlock, /\.profile-detail-drawers\s*{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s);
  assert.match(desktopBlock, /\.profile-detail-drawer\[open\]\s*{[^}]*grid-column:\s*1 \/ -1;/s);
});

test('change review ledger tones only the review state column', async () => {
  const css = await readFile(join(webRoot, 'src/styles.css'), 'utf8');

  assert.match(css, /\.change-review-row\.tone-verified > div:last-child strong/);
  assert.match(css, /\.change-review-row\.tone-review > div:last-child strong/);
  assert.match(css, /\.change-review-row\.tone-paused > div:last-child strong/);
  assert.doesNotMatch(css, /\.change-review-row\.tone-verified strong:last-child/);
});

test('desktop product homepage hero keeps carousel inside first-screen rhythm', async () => {
  const css = await readFile(join(webRoot, 'src/styles.css'), 'utf8');

  assert.match(css, /\.product-hero-copy\s*\{[^}]*min-height:\s*clamp\(560px, calc\(100vh - 100px\), 760px\);[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 0\.92fr\) minmax\(360px, 0\.68fr\);[^}]*align-items:\s*center;/s);
  assert.match(css, /\.product-hero-main\s*\{[^}]*max-width:\s*680px;/s);
  assert.match(css, /\.product-hero-copy \.profile-visual-strip\s*\{[^}]*min-width:\s*0;[^}]*margin-top:\s*0;/s);
  assert.match(css, /\.product-hero-copy \.visual-card-button\s*\{[^}]*flex-basis:\s*clamp\(190px, 17vw, 230px\);/s);
  assert.doesNotMatch(css, /\.product-hero-copy\s*\{[^}]*justify-content:\s*space-between;/s);
});
