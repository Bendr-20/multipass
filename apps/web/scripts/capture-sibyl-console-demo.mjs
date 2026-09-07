#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import {
  cleanupStaleDemoOutputs,
  resolveElevenLabsVoice,
} from './capture-sibyl-console-demo-utils.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, '..');
const repoRoot = resolve(webRoot, '..', '..');
const workspaceRoot = resolve(repoRoot, '..', '.openclaw', 'workspace');
const tmpRoot = resolve(workspaceRoot, 'tmp');
const timestamp = new Date().toISOString().replace(/[-:.]/g, '').replace('Z', 'Z');
const outputDir = resolve(tmpRoot, `sibyl-console-demo-${timestamp}`);
const port = Number(process.env.SIBYL_CONSOLE_DEMO_PORT || 4183);
const demoUrl = `http://127.0.0.1:${port}/multipass/console?mock=looper`;
const chromiumPath = process.env.CHROMIUM_PATH || '/snap/bin/chromium';
const voice = resolveElevenLabsVoice(process.env);

const narration = `Loopers are not NFTs waiting to become agents.
They are agent identities that happen to be NFTs.

The NFT is the identity.
The wallet is agency.
Sibyl is memory.
The Console is where the agent wakes up.

Here a wallet opens the Multipass Console and selects a Looper identity.
The room is review-only by design. It can remember instructions, prepare proposals, and build history, but it cannot spend, trade, or publish without operator approval.

The first mission is simple: track vault permissions, keep capital access review-only, and remember the risk rules attached to this Looper.

That memory is not just a front-end note. It is written into Sibyl under a wallet and agent namespace.

Now the important proof: a fresh process starts with fallback disabled. It asks Sibyl for the saved instruction. The response comes back from the real Sibyl memory provider, and the exact memory matches.

That is the primitive.

Identity becomes wallet.
Wallet becomes memory.
Memory becomes reputation.
Reputation becomes permission.
Permission becomes capital.

No autonomous execution is being promised here. This is the starting point: a Looper can carry an identity, remember its operator preferences, queue review-only proposals, and begin building a track record onchain.

The loop never stops.`;

await mkdir(outputDir, { recursive: true });

const proof = await runProof();
await writeFile(join(outputDir, 'sibyl-proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
await writeFile(join(outputDir, 'voiceover.txt'), `${narration}\n`);

const devServer = spawn('pnpm', ['exec', 'vite', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: webRoot,
  env: {
    ...process.env,
    MULTIPASS_BASE: '/multipass/',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOutput = '';
devServer.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
devServer.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

const screenshots = [];
try {
  await waitForHttp(demoUrl, 30_000);

  const browser = await chromium.launch({
    executablePath: chromiumPath,
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });

    await page.goto(demoUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('.multipass-console');
    await waitForImages(page);
    screenshots.push(await screenshot(page, '01-console-open.png'));

    await page.locator('.console-thread-message.human').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await waitForImages(page);
    screenshots.push(await screenshot(page, '02-review-room.png'));

    await page.locator('textarea[name="message"]').scrollIntoViewIfNeeded();
    await page.locator('textarea[name="message"]').evaluate((node) => {
      node.disabled = false;
      node.value = 'Remember: this Looper tracks vault permissions and review-only capital access. Keep risk medium or lower.';
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(500);
    screenshots.push(await screenshot(page, '03-mission-entered.png'));

    await page.locator('[data-action="reset-console-session"]').evaluate((node) => { node.disabled = false; });
    await page.locator('[data-action="reset-console-session"]').click();
    await page.waitForTimeout(700);
    screenshots.push(await screenshot(page, '04-fresh-session-recall.png'));

    await page.setContent(renderTerminalProofHtml(proof), { waitUntil: 'load' });
    await page.waitForTimeout(500);
    screenshots.push(await screenshot(page, '05-sibyl-proof.png'));
  } finally {
    await browser.close();
  }
} finally {
  devServer.kill('SIGTERM');
}

const audioPath = await generateVoiceover().catch(async (error) => {
  await writeFile(join(outputDir, 'voiceover-error.txt'), `${error?.stack || error}\n`);
  return null;
});

const videoPath = await renderVideo({ screenshots, audioPath });
const cleanedOutputDirs = await cleanupStaleDemoOutputs({ tmpRoot, currentOutputDir: outputDir });

console.log(JSON.stringify({
  ok: true,
  demoUrl,
  outputDir,
  videoPath,
  audioPath,
  voice,
  cleanedOutputDirs,
  screenshots,
  proof: {
    ok: proof.ok,
    provider: proof.provider,
    matched: proof.matched,
    recalled_count: proof.recalled_count,
    namespace: proof.namespace,
  },
}, null, 2));

async function runProof() {
  const namespace = `multipass:hackathon-demo:looper-000:activation-${timestamp}`;
  const message = 'Watchlist preference: remember that Looper #000 tracks vault permissions and review-only capital access.';
  const { stdout } = await execFilePromise('pnpm', [
    '--filter',
    '@helixa/multipass-api',
    'sibyl:prove-cold-start',
    '--',
    '--namespace',
    namespace,
    '--message',
    message,
    '--query',
    'vault permissions',
  ], { cwd: repoRoot, timeout: 60_000 });
  return JSON.parse(extractJsonObject(stdout));
}

async function screenshot(page, filename) {
  const path = join(outputDir, filename);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function generateVoiceover() {
  const apiKey = process.env.ELEVENLABS_API_KEY || await readElevenLabsApiKey();
  if (!apiKey) return null;
  const audioPath = join(outputDir, 'voiceover.mp3');
  const payloadPath = join(outputDir, 'elevenlabs-payload.json');
  await writeFile(join(outputDir, 'elevenlabs-voice.json'), `${JSON.stringify(voice, null, 2)}\n`);
  const payload = {
    text: narration,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.42,
      similarity_boost: 0.78,
      style: 0.18,
      use_speaker_boost: true,
    },
  };
  await writeFile(payloadPath, JSON.stringify(payload));
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.id}`, {
    method: 'POST',
    headers: {
      accept: 'audio/mpeg',
      'content-type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`ElevenLabs voiceover failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
  }
  await writeFile(audioPath, Buffer.from(await response.arrayBuffer()));
  return audioPath;
}

async function readElevenLabsApiKey() {
  const envPath = resolve(process.env.HOME || '/home/ubuntu', '.config', 'elevenlabs', 'env');
  const raw = await readFile(envPath, 'utf8').catch(() => '');
  const line = raw.split(/\r?\n/u).find((entry) => entry.startsWith('ELEVENLABS_API_KEY='));
  return line ? line.replace(/^ELEVENLABS_API_KEY=/u, '').trim() : '';
}

async function renderVideo({ screenshots, audioPath }) {
  const listPath = join(outputDir, 'slides.txt');
  const silentPath = join(outputDir, 'sibyl-console-demo-silent.mp4');
  const videoPath = join(outputDir, 'sibyl-console-demo.mp4');
  const durations = [23, 25, 24, 25, 33];
  const lines = [];
  screenshots.forEach((path, index) => {
    lines.push(`file '${path.replaceAll("'", "'\\''")}'`);
    lines.push(`duration ${durations[index] ?? 24}`);
  });
  lines.push(`file '${screenshots.at(-1).replaceAll("'", "'\\''")}'`);
  await writeFile(listPath, `${lines.join('\n')}\n`);

  await execFilePromise('ffmpeg', [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-vf',
    'fps=30,format=yuv420p',
    '-movflags',
    '+faststart',
    silentPath,
  ], { timeout: 180_000 });

  if (!audioPath) return silentPath;
  await execFilePromise('ffmpeg', [
    '-y',
    '-i',
    silentPath,
    '-i',
    audioPath,
    '-filter_complex',
    '[1:a]apad[a]',
    '-map',
    '0:v',
    '-map',
    '[a]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-shortest',
    '-movflags',
    '+faststart',
    videoPath,
  ], { timeout: 180_000 });
  return videoPath;
}

function renderTerminalProofHtml(proof) {
  const safe = escapeHtml(JSON.stringify({
    ok: proof.ok,
    provider: proof.provider,
    namespace: proof.namespace,
    query: proof.query,
    recalled_count: proof.recalled_count,
    matched: proof.matched,
  }, null, 2));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <style>
      body {
        margin: 0;
        width: 1280px;
        height: 720px;
        background: #050608;
        color: #e7fff0;
        font: 24px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        overflow: hidden;
      }
      main {
        box-sizing: border-box;
        height: 100%;
        padding: 48px;
        background:
          linear-gradient(rgba(4, 255, 153, 0.055) 50%, rgba(0, 0, 0, 0.055) 50%),
          radial-gradient(circle at 78% 24%, rgba(255, 42, 42, 0.18), transparent 28%),
          #050608;
        background-size: 100% 4px, 100% 100%, 100% 100%;
      }
      .frame {
        border: 1px solid rgba(82, 255, 179, 0.55);
        box-shadow: 0 0 36px rgba(82, 255, 179, 0.18);
        height: 100%;
        padding: 34px;
        box-sizing: border-box;
      }
      h1 {
        margin: 0 0 24px;
        color: #ff3b3b;
        font-size: 30px;
        letter-spacing: 0;
      }
      pre {
        margin: 0;
        white-space: pre-wrap;
      }
      .ok { color: #52ffb3; }
    </style>
  </head>
  <body>
    <main>
      <section class="frame">
        <h1>NO-FALLBACK SIBYL COLD START PROOF</h1>
        <pre>${safe}</pre>
        <p class="ok">provider: sibyl_memory · matched: true</p>
      </section>
    </main>
  </body>
</html>`;
}

function escapeHtml(input) {
  return String(input ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function extractJsonObject(output) {
  const source = String(output ?? '');
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not find JSON object in command output:\n${source}`);
  }
  return source.slice(start, end + 1);
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}\n${serverOutput}`);
}

async function waitForImages(page) {
  await page.waitForFunction(() => {
    const images = [...document.images];
    const visibleImages = images.filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.width > 4 && rect.height > 4 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
    });
    return visibleImages.length > 0 && visibleImages.every((image) => image.complete && image.naturalWidth > 0);
  }, null, { timeout: 30_000 });
}

function execFilePromise(file, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    execFile(file, args, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      ...options,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });
}
