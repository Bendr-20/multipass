import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, copyFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';
import { pathToFileURL, fileURLToPath } from 'node:url';

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const generatorPath = join(webRoot, 'scripts', 'generate-share-cards.mjs');
const generatorUrl = pathToFileURL(generatorPath).href;
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function importGenerator() {
  const source = await readFile(generatorPath, 'utf8');
  assert.match(source, /export\s+async\s+function\s+fetchVisualDataUri\b/, 'fetch helper must be importable without running the CLI');
  assert.match(source, /export\s+async\s+function\s+publishGeneratedFiles\b/, 'publish helper must be importable without running the CLI');
  assert.match(source, /export\s+function\s+createTempRoot\b/, 'temp root helper must be importable without running the CLI');
  assert.match(source, /process\.argv\[1\]/, 'CLI main should be guarded so imports have no generation side effects');
  return import(`${generatorUrl}?test=${randomUUID()}`);
}

async function makeTempDir() {
  return mkdtemp(join(tmpdir(), 'multipass-share-generator-'));
}

test('remote visual fetch rejects oversized Content-Length before reading the body', async () => {
  const { fetchVisualDataUri } = await importGenerator();
  let bodyRead = false;
  const fetchImpl = async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal, 'fetch uses an abort signal');
    return {
      ok: true,
      headers: new Headers({
        'content-type': 'image/png',
        'content-length': '9',
      }),
      async arrayBuffer() {
        bodyRead = true;
        return tinyPng;
      },
    };
  };

  const result = await fetchVisualDataUri(
    { name: 'Oversized Bot', visual: { imageUrl: 'https://assets.example.test/oversized.png' } },
    fetchImpl,
    { maxBytes: 8, timeoutMs: 500 },
  );

  assert.equal(result.dataUri, null);
  assert.match(result.warning, /too large/i);
  assert.equal(bodyRead, false, 'oversized declared bodies are not downloaded');
});

test('remote visual fetch enforces streaming byte caps without throwing', async () => {
  const { fetchVisualDataUri } = await importGenerator();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(tinyPng.subarray(0, 8));
      controller.enqueue(tinyPng.subarray(8, 18));
      controller.close();
    },
  });

  const result = await fetchVisualDataUri(
    { name: 'Stream Bot', visual: { imageUrl: 'https://assets.example.test/stream.png' } },
    async () => new Response(stream, { headers: { 'content-type': 'image/png' } }),
    { maxBytes: 12, timeoutMs: 500 },
  );

  assert.equal(result.dataUri, null);
  assert.match(result.warning, /too large/i);
});

test('remote visual fetch times out and returns the deterministic fallback warning path', async () => {
  const { fetchVisualDataUri } = await importGenerator();
  const fetchImpl = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const error = new Error('operation aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });

  const started = Date.now();
  const result = await fetchVisualDataUri(
    { name: 'Slow Bot', visual: { imageUrl: 'https://assets.example.test/slow.png' } },
    fetchImpl,
    { maxBytes: 1024, timeoutMs: 20 },
  );

  assert.equal(result.dataUri, null);
  assert.match(result.warning, /timed out/i);
  assert.ok(Date.now() - started < 1_000, 'timeout is finite');
});

test('remote visual fetch still accepts valid images under the cap', async () => {
  const { fetchVisualDataUri } = await importGenerator();

  const result = await fetchVisualDataUri(
    { name: 'Tiny Bot', visual: { imageUrl: 'https://assets.example.test/tiny.png' } },
    async () => new Response(tinyPng, { headers: { 'content-type': 'image/png', 'content-length': String(tinyPng.length) } }),
    { maxBytes: tinyPng.length + 1, timeoutMs: 500 },
  );

  assert.equal(result.warning, null);
  assert.match(result.dataUri, /^data:image\/png;base64,/);
});

test('publish stages each file in its destination directory and renames the manifest last', async () => {
  const { publishGeneratedFiles } = await importGenerator();
  const root = await makeTempDir();
  try {
    const sourceDir = join(root, 'source');
    const shareDir = join(root, 'public', 'share');
    const manifestFinalPath = join(root, 'src', 'generated-share-cards.js');
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, 'manifest.js'), 'manifest-v2');
    await writeFile(join(sourceDir, 'card.jpg'), 'jpg-v2');
    await writeFile(join(sourceDir, 'index.html'), 'html-v2');

    const events = [];
    const fsImpl = {
      readFile,
      mkdir,
      copyFile: async (from, to) => {
        events.push({ op: 'copyFile', from, to });
        await copyFile(from, to);
      },
      rename: async (from, to) => {
        events.push({ op: 'rename', from, to });
        await rename(from, to);
      },
      rm,
    };

    await publishGeneratedFiles([
      { tempPath: join(sourceDir, 'manifest.js'), finalPath: manifestFinalPath },
      { tempPath: join(sourceDir, 'card.jpg'), finalPath: join(shareDir, '81.jpg') },
      { tempPath: join(sourceDir, 'index.html'), finalPath: join(shareDir, '81', 'index.html') },
    ], { manifestPath: manifestFinalPath, fsImpl, runId: 'test-run' });

    const copyEvents = events.filter((event) => event.op === 'copyFile');
    const renameEvents = events.filter((event) => event.op === 'rename');
    assert.equal(renameEvents.length, 3);
    for (const event of copyEvents) {
      const matchingRename = renameEvents.find((renameEvent) => renameEvent.from === event.to);
      assert.ok(matchingRename, `copy target ${event.to} is later renamed`);
      assert.equal(dirname(event.to), dirname(matchingRename.to), 'stage file is in the final destination directory');
      assert.notEqual(event.to, matchingRename.to, 'copy never overwrites the final file directly');
      assert.match(basename(event.to), /^\./, 'stage file is hidden/temp-named');
    }
    assert.equal(renameEvents.at(-1).to, manifestFinalPath, 'manifest publish happens last');
    assert.equal(await readFile(join(shareDir, '81.jpg'), 'utf8'), 'jpg-v2');
    assert.equal(await readFile(join(shareDir, '81', 'index.html'), 'utf8'), 'html-v2');
    assert.equal(await readFile(manifestFinalPath, 'utf8'), 'manifest-v2');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('publish removes destination temp files when staging fails', async () => {
  const { publishGeneratedFiles } = await importGenerator();
  const root = await makeTempDir();
  try {
    const sourceDir = join(root, 'source');
    const finalDir = join(root, 'final');
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, 'ok.txt'), 'ok');
    await writeFile(join(sourceDir, 'fail.txt'), 'fail');

    const fsImpl = {
      readFile,
      mkdir,
      copyFile: async (from, to) => {
        await copyFile(from, to);
        if (from.endsWith('fail.txt')) throw new Error('simulated staging failure');
      },
      rename,
      rm,
    };

    await assert.rejects(() => publishGeneratedFiles([
      { tempPath: join(sourceDir, 'ok.txt'), finalPath: join(finalDir, 'ok.txt') },
      { tempPath: join(sourceDir, 'fail.txt'), finalPath: join(finalDir, 'fail.txt') },
    ], { manifestPath: join(finalDir, 'manifest.js'), fsImpl, runId: 'test-run' }), /simulated staging failure/);

    const leftovers = await readdir(finalDir).catch((error) => (error.code === 'ENOENT' ? [] : Promise.reject(error)));
    assert.deepEqual(leftovers.filter((name) => name.includes('test-run')), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('temp output roots are unique per generator run and scoped under share root', async () => {
  const { createTempRoot } = await importGenerator();
  const root = '/tmp/multipass-share-root';
  const first = createTempRoot(root);
  const second = createTempRoot(root);

  assert.notEqual(first, second);
  assert.equal(dirname(first), root);
  assert.equal(dirname(second), root);
  assert.match(basename(first), /^\.generated-tmp-\d+-\d+-[a-z0-9-]+$/);
  assert.match(basename(second), /^\.generated-tmp-\d+-\d+-[a-z0-9-]+$/);
});
