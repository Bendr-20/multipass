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
