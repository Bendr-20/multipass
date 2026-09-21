import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { scanTree } from '../scripts/scan-activate-looper-3802.mjs';
import { renderActivationHtml, SOURCE_MANIFEST } from '../scripts/build-activate-looper-3802.mjs';

const production = new URL('../owner-tools/activate-looper-3802/', import.meta.url);
const execFileAsync = promisify(execFile);
const roots = [];
async function fixture() { const parent = await mkdtemp(join(tmpdir(), 'activate-scan-')); roots.push(parent); const root = join(parent, 'activate-looper-3802'); await cp(production, root, { recursive: true }); return root; }
async function regenerate(root) { const template = await readFile(join(root, 'index.template.html'), 'utf8'); const sourceFiles = Object.fromEntries(await Promise.all(SOURCE_MANIFEST.map(async (name) => [name, await readFile(join(root, 'src', name), 'utf8')]))); await writeFile(join(root, 'index.html'), renderActivationHtml({ template, sourceFiles })); }
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

test('scanner accepts the approved source tree', async () => { const result = await scanTree(await fixture()); assert.equal(result.status, 'approved'); });
test('scanner rejects a stale generated artifact', async () => { const root = await fixture(); await writeFile(join(root, 'index.html'), 'stale'); await assert.rejects(scanTree(root), /generated artifact is stale/i); });
test('scanner rejects misplaced fetch and provider capabilities', async () => { const root = await fixture(); const path = join(root, 'src', '03-snapshot-validator.js'); await writeFile(path, `${await readFile(path, 'utf8')}\nfetch('https://mainnet.base.org');\n`); await regenerate(root); await assert.rejects(scanTree(root), /misplaced fetch/i); });
test('scanner rejects alternate storage and wallet methods', async () => { const root = await fixture(); const path = join(root, 'src', '05-attempt-store.js'); await writeFile(path, `${await readFile(path, 'utf8')}\nsessionStorage.getItem('other');\nconst forbidden='personal_sign';\n`); await regenerate(root); await assert.rejects(scanTree(root), /alternate browser storage|wallet method/i); });

test('scanner rejects every boundary mutation in its owning file', async (t) => {
  const cases = [
    ['remote script', 'index.template.html', '\n<script src="https://evil.example/x.js"></script>', /inline script|unapproved URL/i],
    ['unknown selector', 'src/01-pinset-encoding.js', "\nconst injectedSelector='0xdeadbeef';", /selector/i],
    ['provider request', 'src/08-controller-renderer.js', "\nprovider.request({method:'eth_sendTransaction'});", /provider request/i],
    ['localStorage', 'src/06-cross-tab-coordinator.js', "\nlocalStorage.getItem('x');", /misplaced localStorage/i],
    ['Web Locks', 'src/05-attempt-store.js', "\nnavigator.locks.request('x');", /Web Locks|navigator/i],
    ['extra wallet method', 'src/04-wallet-boundary.js', "\nconst extraMethod='wallet_watchAsset';", /wallet.*method|method.*wallet/i],
    ['alternate activation key', 'src/05-attempt-store.js', "\nconst otherKey='loopers.walletActivation.8453.3802.v2';", /storage key/i],
    ['batch loop', 'src/08-controller-renderer.js', '\nfor (const token of collectionTokens) activate(token);', /batch loop/i],
  ];
  for (const [name, relative, injected, expected] of cases) await t.test(name, async () => {
    const root = await fixture(); const path = join(root, relative); await writeFile(path, `${await readFile(path, 'utf8')}${injected}\n`); await regenerate(root); await assert.rejects(scanTree(root), expected);
  });
});

test('scanner CLI is independent of caller cwd', async () => {
  const cli = new URL('../scripts/scan-activate-looper-3802.mjs', import.meta.url);
  for (const cwd of [new URL('../../..', import.meta.url).pathname, tmpdir()]) {
    const { stdout } = await execFileAsync(process.execPath, [cli.pathname], { cwd });
    assert.match(stdout, /"status": "approved"/u);
  }
});
