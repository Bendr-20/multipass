import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test('mobile layout does not squeeze fragment cards into narrow desktop columns', async () => {
  const css = await readFile(join(webRoot, 'src/styles.css'), 'utf8');

  assert.equal(css.includes('grid-template-columns: repeat(5, minmax(0, 1fr));'), false);
  assert.match(css, /\.fragment-cards\s*{[^}]*minmax\(280px, 1fr\)/s);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.fragment-cards\s*{[\s\S]*grid-template-columns: 1fr;/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.card-track\s*{[\s\S]*grid-auto-columns:\s*minmax\(0, min\(320px, 82vw\)\);/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.card-track\s*{[\s\S]*scroll-snap-type:\s*x proximity;/);
  assert.doesNotMatch(css, /@media \(max-width: 700px\)[\s\S]*\.card-track\s*{[\s\S]*grid-auto-columns: minmax\(280px, 88vw\);/);
});


test('mobile resolver keeps a compact single-column hierarchy', async () => {
  const css = await readFile(join(webRoot, 'src/styles.css'), 'utf8');
  const resolverColumnRules = [...css.matchAll(/\.live-resolver form\s*\{[^}]*grid-template-columns:\s*([^;]+);/g)].map((match) => match[1].trim());
  const mobileBlock = css.slice(css.indexOf('@media (max-width: 700px)'));

  assert.equal(resolverColumnRules.at(-1), '1fr', 'the last resolver grid declaration must stay single-column on mobile');
  assert.match(css, /\.brand-logo-frame\s*\{[^}]*width:\s*40px;[^}]*height:\s*40px;[^}]*border:\s*1px solid var\(--ink\);/s);
  assert.match(css, /\.brand-stack\s*\{[^}]*display:\s*grid;[^}]*gap:\s*4px;/s);
  assert.match(css, /\.brand-wordmark\s*\{[^}]*min-height:\s*18px;[^}]*align-items:\s*center;/s);
  assert.match(css, /\.brand \.header-meta\s*\{[^}]*line-height:\s*1;/s);
  assert.match(css, /\.site-menu-button\s*\{[^}]*width:\s*40px;[^}]*height:\s*40px;[^}]*border:\s*0;[^}]*background:\s*transparent;/s);
  assert.match(css, /\.site-menu-button span\s*\{[^}]*height:\s*2px;[^}]*background:\s*var\(--ink\);/s);
  assert.match(css, /\.multipass-system-panel\s*\{/s);
  assert.match(css, /\.multipass-system-map\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/s);
  assert.match(css, /\.system-node-core\s*\{/s);
  assert.match(css, /\.multipass-protocol-strip\s*\{/s);
  assert.match(mobileBlock, /\.multipass-system-map\s*\{[^}]*grid-template-columns:\s*1fr;/s);
  assert.doesNotMatch(css, /Wiretap|ClawBank/);
  assert.match(mobileBlock, /\.record-shell\s*\{[^}]*max-width:\s*calc\(100vw - 24px\);[^}]*overflow-x:\s*clip;/s);
  assert.match(mobileBlock, /h1\s*\{[^}]*font-size:\s*clamp\(2rem, 8\.8vw, 2\.7rem\);/s);
  assert.match(mobileBlock, /\.profile-visual-strip\s*\{[^}]*max-width:\s*100%;[^}]*overflow:\s*hidden;[^}]*margin-top:\s*12px;/s);
  assert.doesNotMatch(css, /\.visual-card-viewport\s*\{/s);
  assert.match(css, /\.visual-card-track\s*\{[^}]*display:\s*flex;[^}]*overflow-x:\s*auto;[^}]*scroll-snap-type:\s*x mandatory;[^}]*-webkit-overflow-scrolling:\s*touch;/s);
  assert.doesNotMatch(css, /\.visual-card-track\s*\{[^}]*transform:\s*translate/s);
  assert.match(css, /\.visual-card-button\s*\{[^}]*flex:\s*0 0 min\(300px, 86%\);[^}]*grid-template-rows:\s*auto auto auto;[^}]*scroll-snap-align:\s*start;[^}]*border-radius:\s*18px;/s);
  assert.match(css, /\.visual-card-button \.profile-card-visual\s*\{[^}]*aspect-ratio:\s*1 \/ 1;[^}]*border-radius:\s*12px;/s);
  assert.match(css, /\.visual-card-button \.profile-card-visual img\s*\{[^}]*object-fit:\s*contain;/s);
  assert.doesNotMatch(css, /\.product-hero > \.live-resolver\s*\{/s);
  assert.match(css, /\.product-home-shell \.live-resolver\s*\{[^}]*width:\s*min\(100%, 1040px\);[^}]*margin:\s*28px auto;/s);
  assert.match(css, /\.product-home-shell \.live-resolver form\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(240px, 320px\);/s);
  assert.match(css, /\.live-resolver-actions\s*\{[^}]*display:\s*grid;[^}]*gap:\s*10px;/s);
  assert.doesNotMatch(css, /\.product-home-shell \.live-resolver\s*\{[^}]*min-height:\s*560px;/s);
  assert.match(mobileBlock, /\.profile-visual-strip \.visual-card-button\s*\{[^}]*grid-template-rows:\s*auto auto auto;/s);
  assert.match(mobileBlock, /\.product-hero-copy \.visual-card-button\s*\{[^}]*flex-basis:\s*min\(300px, 86%\);/s);
  assert.match(mobileBlock, /\.product-hero-copy\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(mobileBlock, /\.card-carousel\s*\{[^}]*max-width:\s*100%;[^}]*overflow:\s*hidden;/s);
  assert.match(mobileBlock, /\.card-track\s*\{[^}]*width:\s*100%;[^}]*grid-auto-columns:\s*minmax\(0, min\(320px, 82vw\)\);[^}]*overflow-x:\s*auto;[^}]*scroll-snap-type:\s*x proximity;/s);
  assert.match(mobileBlock, /\.profile-card\.card-button\s*\{[^}]*min-height:\s*300px;[^}]*grid-template-rows:\s*150px 1fr;[^}]*scroll-snap-align:\s*start;/s);
  assert.doesNotMatch(mobileBlock, /grid-auto-columns: minmax\(280px, 88vw\);/s);
  assert.match(mobileBlock, /\.homepage-proof-panel h2\s*\{[^}]*font-size:\s*clamp\(1\.45rem, 7vw, 2\.15rem\);/s);
  assert.match(mobileBlock, /\.homepage-proof-grid\s*\{[^}]*grid-template-columns:\s*1fr;/s);
  assert.doesNotMatch(mobileBlock, /\.homepage-proof-panel h2,\s*\.homepage-proof-grid\s*\{[^}]*display:\s*none;/s);
  assert.match(mobileBlock, /\.live-resolver\s*\{[^}]*padding:\s*16px;/s);
  assert.match(mobileBlock, /\.product-home-shell \.live-resolver\s*\{[^}]*width:\s*100%;[^}]*margin:\s*22px 0;/s);
  assert.match(mobileBlock, /\.product-home-shell \.live-resolver form\s*\{[^}]*grid-template-columns:\s*1fr;/s);
  assert.match(mobileBlock, /\.product-home-shell \.multipass-system-panel\s*\{[^}]*width:\s*100%;[^}]*margin:\s*22px 0 0;/s);
  assert.doesNotMatch(mobileBlock, /\.live-resolver form\s*\{[^}]*minmax\(180px, 260px\)[^}]*auto auto/s);
});


test('mobile hero lead copy keeps tight first-screen density', async () => {
  const css = await readFile(join(webRoot, 'src/styles.css'), 'utf8');
  const mobileBlock = css.slice(css.indexOf('@media (max-width: 700px)'));
  const leadBlock = mobileBlock.match(/\.lead\s*\{(?<body>[^}]*)\}/s)?.groups.body ?? '';

  assert.match(leadBlock, /font-size:\s*14px;/);
  assert.match(leadBlock, /line-height:\s*1\.35;/);
  assert.match(leadBlock, /margin-bottom:\s*12px;/);
});

test('marketplace listing uses responsive marketplace-card grids', async () => {
  const css = await readFile(join(webRoot, 'src/styles.css'), 'utf8');

  assert.match(css, /\.marketplace-listing\s*{[^}]*border:[^}]*1px solid/s);
  assert.match(css, /\.listing-shell\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s);
  assert.match(css, /\.listing-routes\s*{[^}]*grid-template-columns:\s*repeat\(auto-fit, minmax\(180px, 1fr\)\);/s);
  assert.match(css, /\.listing-proof-strip\s*{[^}]*grid-template-columns:\s*repeat\(auto-fit, minmax\(150px, 1fr\)\);/s);
});

test('mobile marketplace listing collapses to one readable column', async () => {
  const css = await readFile(join(webRoot, 'src/styles.css'), 'utf8');
  const mobileBlock = css.slice(css.indexOf('@media (max-width: 700px)'));

  assert.match(mobileBlock, /\.marketplace-listing\s*{[^}]*padding:\s*18px;/s);
  assert.match(mobileBlock, /\.listing-shell\s*{[^}]*grid-template-columns:\s*1fr;/s);
  assert.match(mobileBlock, /\.listing-identity\s*{[^}]*grid-template-columns:\s*1fr;/s);
  assert.match(mobileBlock, /\.listing-sections\s*{[^}]*grid-template-columns:\s*1fr;/s);
});

test('profile-first layout and drawers have dedicated responsive selectors', async () => {
  const css = await readFile(join(webRoot, 'src/styles.css'), 'utf8');
  const mobileBlock = css.slice(css.indexOf('@media (max-width: 700px)'));

  assert.match(css, /\.multipass-profile-page\s*\{/s);
  assert.match(css, /\.profile-detail-drawers\s*\{/s);
  assert.match(css, /\.profile-detail-drawer\s*\{/s);
  assert.match(css, /\.profile-detail-drawer summary\s*\{/s);
  assert.match(css, /\.profile-detail-drawer-body\s*\{/s);
  assert.match(mobileBlock, /\.multipass-profile-page\s*\{[^}]*grid-template-columns:\s*1fr;/s);
});
