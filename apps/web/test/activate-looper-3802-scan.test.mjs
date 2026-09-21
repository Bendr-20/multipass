import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanTree } from '../scripts/scan-activate-looper-3802.mjs';
import { renderActivationHtml, SOURCE_MANIFEST } from '../scripts/build-activate-looper-3802.mjs';

const production = new URL('../owner-tools/activate-looper-3802/', import.meta.url);
const roots = [];
async function fixture() { const parent = await mkdtemp(join(tmpdir(), 'activate-scan-')); roots.push(parent); const root = join(parent, 'activate-looper-3802'); await cp(production, root, { recursive: true }); return root; }
async function regenerate(root) { const template = await readFile(join(root, 'index.template.html'), 'utf8'); const sourceFiles = Object.fromEntries(await Promise.all(SOURCE_MANIFEST.map(async (name) => [name, await readFile(join(root, 'src', name), 'utf8')]))); await writeFile(join(root, 'index.html'), renderActivationHtml({ template, sourceFiles })); }
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

test('scanner accepts the approved source tree', async () => { const result = await scanTree(await fixture()); assert.equal(result.status, 'approved'); });
test('scanner rejects a stale generated artifact', async () => { const root = await fixture(); await writeFile(join(root, 'index.html'), 'stale'); await assert.rejects(scanTree(root), /generated artifact is stale/i); });
test('scanner rejects misplaced fetch and provider capabilities', async () => { const root = await fixture(); const path = join(root, 'src', '03-snapshot-validator.js'); await writeFile(path, `${await readFile(path, 'utf8')}\nfetch('https://mainnet.base.org');\n`); await regenerate(root); await assert.rejects(scanTree(root), /misplaced fetch/i); });
test('scanner rejects alternate storage and wallet methods', async () => { const root = await fixture(); const path = join(root, 'src', '05-attempt-store.js'); await writeFile(path, `${await readFile(path, 'utf8')}\nsessionStorage.getItem('other');\nconst forbidden='personal_sign';\n`); await regenerate(root); await assert.rejects(scanTree(root), /alternate browser storage|forbidden wallet method/i); });
