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
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.card-track\s*{[\s\S]*grid-auto-columns: minmax\(280px, 88vw\);/);
});


test('mobile resolver keeps a compact single-column hierarchy', async () => {
  const css = await readFile(join(webRoot, 'src/styles.css'), 'utf8');
  const resolverColumnRules = [...css.matchAll(/\.live-resolver form\s*\{[^}]*grid-template-columns:\s*([^;]+);/g)].map((match) => match[1].trim());
  const mobileBlock = css.slice(css.indexOf('@media (max-width: 700px)'));

  assert.equal(resolverColumnRules.at(-1), '1fr', 'the last resolver grid declaration must stay single-column on mobile');
  assert.match(mobileBlock, /h1\s*\{[^}]*font-size:\s*clamp\(2\.2rem, 9\.5vw, 3rem\);/s);
  assert.match(mobileBlock, /\.live-resolver\s*\{[^}]*padding:\s*16px;/s);
  assert.doesNotMatch(mobileBlock, /\.live-resolver form\s*\{[^}]*minmax\(180px, 260px\)[^}]*auto auto/s);
});


test('mobile hero lead copy keeps readable density', async () => {
  const css = await readFile(join(webRoot, 'src/styles.css'), 'utf8');
  const mobileBlock = css.slice(css.indexOf('@media (max-width: 700px)'));
  const leadBlock = mobileBlock.match(/\.lead\s*\{(?<body>[^}]*)\}/s)?.groups.body ?? '';

  assert.match(leadBlock, /font-size:\s*16px;/);
  assert.match(leadBlock, /line-height:\s*1\.5;/);
  assert.match(leadBlock, /margin-bottom:\s*20px;/);
});
