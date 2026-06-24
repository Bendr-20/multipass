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
