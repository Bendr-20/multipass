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

test('desktop product homepage hero is left-aligned and stretched across the card', async () => {
  const css = await readFile(join(webRoot, 'src/styles.css'), 'utf8');

  assert.match(css, /\.product-hero-copy\s*\{[^}]*min-height:\s*clamp\(460px, 58vh, 620px\);[^}]*display:\s*grid;[^}]*grid-template-columns:\s*1fr;[^}]*align-items:\s*start;/s);
  assert.match(css, /\.product-hero-main\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;[^}]*justify-self:\s*stretch;[^}]*text-align:\s*left;/s);
  assert.match(css, /\.product-hero-main h1\s*\{[^}]*max-width:\s*min\(100%, 1080px\);[^}]*margin-left:\s*0;[^}]*margin-right:\s*0;/s);
  assert.match(css, /\.product-hero-main \.lead\s*\{[^}]*max-width:\s*760px;[^}]*margin-left:\s*0;[^}]*margin-right:\s*0;/s);
  assert.match(css, /\.product-hero-main \.homepage-actions\s*\{[^}]*justify-content:\s*flex-start;/s);
  assert.match(css, /\.product-hero-copy \.profile-visual-strip\s*\{[^}]*min-width:\s*0;[^}]*width:\s*100%;[^}]*margin-top:\s*clamp\(14px, 2vw, 22px\);/s);
  assert.match(css, /\.product-hero-copy \.visual-card-button\s*\{[^}]*flex:\s*0 0 calc\(\(100% - 24px\) \/ 3\);/s);
  assert.match(css, /\.product-hero-copy \.visual-card-button \.profile-card-visual\s*\{[^}]*aspect-ratio:\s*4 \/ 3;/s);
  assert.doesNotMatch(css, /\.product-hero-main\s*\{[^}]*justify-self:\s*center;[^}]*text-align:\s*center;/s);
  assert.doesNotMatch(css, /\.product-hero-main h1,\s*\.product-hero-main \.lead\s*\{[^}]*margin-left:\s*auto;[^}]*margin-right:\s*auto;/s);
  assert.doesNotMatch(css, /\.product-hero-main \.homepage-actions\s*\{[^}]*justify-content:\s*center;/s);
});

test('product homepage resolver sits below the system panel as a wide desktop activation panel', async () => {
  const css = await readFile(join(webRoot, 'src/styles.css'), 'utf8');

  assert.match(css, /\.product-home-shell \.live-resolver\s*\{[^}]*width:\s*min\(100%, 1180px\);[^}]*margin:\s*28px auto 0;[^}]*padding:\s*clamp\(22px, 3vw, 30px\);/s);
  assert.match(css, /\.product-home-shell \.live-resolver form\s*\{[^}]*grid-template-columns:\s*minmax\(310px, 0\.85fr\) minmax\(260px, 1fr\) minmax\(170px, 220px\);[^}]*gap:\s*18px;[^}]*align-items:\s*end;/s);
  assert.match(css, /\.product-home-shell \.live-resolver \.live-resolver-copy\s*\{[^}]*align-self:\s*center;[^}]*max-width:\s*430px;/s);
  assert.match(css, /\.product-home-shell \.live-resolver \.live-resolver-copy h2\s*\{[^}]*font-size:\s*clamp\(1\.9rem, 3vw, 3\.2rem\);[^}]*line-height:\s*0\.96;[^}]*letter-spacing:\s*-0\.055em;/s);
  assert.match(css, /\.product-home-shell \.multipass-system-panel\s*\{[^}]*width:\s*min\(100%, 1180px\);[^}]*margin:\s*28px auto 0;[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(260px, 0\.62fr\) minmax\(0, 1\.38fr\);[^}]*align-items:\s*center;/s);
  assert.match(css, /\.product-home-shell \.multipass-system-panel \.system-panel-copy\s*\{[^}]*max-width:\s*380px;[^}]*margin:\s*0;[^}]*text-align:\s*left;/s);
  assert.match(css, /\.product-home-shell \.multipass-system-panel \.system-panel-copy h2\s*\{[^}]*max-width:\s*380px;[^}]*font-size:\s*clamp\(1\.9rem, 3vw, 3\.1rem\);[^}]*margin-left:\s*0;[^}]*margin-right:\s*0;/s);
  assert.match(css, /\.multipass-system-map\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/s);
  assert.match(css, /\.product-home-shell \.multipass-system-panel \.multipass-protocol-strip\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*justify-content:\s*center;/s);
  assert.doesNotMatch(css, /\.product-home-shell \.live-resolver\s*\{[^}]*width:\s*min\(100%, 1040px\);/s);
  assert.doesNotMatch(css, /\.product-home-shell \.live-resolver form\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(240px, 320px\);/s);
  assert.doesNotMatch(css, /\.multipass-system-map\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\);/s);
});
