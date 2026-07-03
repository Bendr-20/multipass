import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile, copyFile, rename } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { getAgentShareImageUrl } from '../src/share-cards.js';
import { STATIC_DEMO_DATA } from '../src/static-demo-data.js';

const execFileAsync = promisify(execFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = dirname(scriptDir);
const shareRoot = join(webRoot, 'public', 'share');
const manifestPath = join(webRoot, 'src', 'generated-share-cards.js');
const absoluteOrigin = 'https://helixa.xyz';
const fetchUserAgent = 'Mozilla/5.0 MultipassShareCardGenerator/1.0';
const visualFetchTimeoutMs = 15_000;
const visualFetchMaxBytes = 15 * 1024 * 1024;
const defaultFsImpl = { mkdir, readFile, rm, writeFile, copyFile, rename };

let tempRootCounter = 0;

export function createTempRoot(root = shareRoot) {
  tempRootCounter += 1;
  return join(root, `.generated-tmp-${process.pid}-${Date.now()}-${tempRootCounter.toString(36)}`);
}

function parseArgs(argv) {
  return { check: argv.includes('--check') };
}

function numericAgentCards(data) {
  return [...(data.agentCards ?? [])]
    .filter((card) => /^\d+$/.test(String(card.tokenId ?? '')))
    .sort((a, b) => Number(a.tokenId) - Number(b.tokenId));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function assertFfmpegSvgSupport() {
  await execFileAsync('bash', ['-lc', 'command -v ffmpeg']);
  const { stdout: formats } = await execFileAsync('ffmpeg', ['-hide_banner', '-formats']);
  const { stdout: codecs } = await execFileAsync('ffmpeg', ['-hide_banner', '-codecs']);
  if (!/ D\s+svg_pipe\b/.test(formats)) throw new Error('ffmpeg svg_pipe demuxer is unavailable');
  if (!/ D\.V.*\bsvg\b/.test(codecs)) throw new Error('ffmpeg svg decoder is unavailable');
}

function initialsForCard(card) {
  const words = String(card?.name ?? '')
    .match(/[A-Za-z0-9]+/g)
    ?.slice(0, 2) ?? [];
  const initials = words.map((word) => word[0]?.toUpperCase()).join('');
  return initials || 'MP';
}

function sniffImageMime(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

class VisualFetchSizeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VisualFetchSizeError';
  }
}

function cardName(card) {
  return card?.name ?? 'unknown card';
}

function parseContentLength(headers) {
  const value = headers?.get?.('content-length');
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function cancelResponseBody(response) {
  try {
    await response?.body?.cancel?.();
  } catch {
    // Best-effort cleanup only.
  }
}

async function readResponseBytesWithLimit(response, maxBytes) {
  const declaredLength = parseContentLength(response.headers);
  if (declaredLength != null && declaredLength > maxBytes) {
    await cancelResponseBody(response);
    throw new VisualFetchSizeError(`response too large: ${declaredLength} bytes exceeds ${maxBytes} byte cap`);
  }

  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        total += chunk.byteLength;
        if (total > maxBytes) {
          try {
            await reader.cancel?.();
          } catch {
            // Best-effort cleanup only.
          }
          throw new VisualFetchSizeError(`response too large: exceeded ${maxBytes} byte cap while streaming`);
        }
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock?.();
    }
    return Buffer.concat(chunks, total);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) {
    throw new VisualFetchSizeError(`response too large: ${bytes.length} bytes exceeds ${maxBytes} byte cap`);
  }
  return bytes;
}

export async function fetchVisualDataUri(card, fetchImpl = fetch, options = {}) {
  const imageUrl = card?.visual?.imageUrl;
  if (!imageUrl) return { dataUri: null, warning: null };

  let url;
  try {
    url = new URL(imageUrl);
  } catch {
    return { dataUri: null, warning: `Skipping invalid visual URL for ${cardName(card)}: ${imageUrl}` };
  }

  if (url.protocol !== 'https:') {
    return { dataUri: null, warning: `Skipping non-HTTPS visual URL for ${cardName(card)}: ${imageUrl}` };
  }

  const timeoutMs = options.timeoutMs ?? visualFetchTimeoutMs;
  const maxBytes = options.maxBytes ?? visualFetchMaxBytes;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url.toString(), {
      headers: { 'User-Agent': fetchUserAgent },
      signal: controller.signal,
    });
    if (controller.signal.aborted) {
      return { dataUri: null, warning: `Visual fetch timed out for ${cardName(card)} after ${timeoutMs}ms` };
    }
    if (response.ok === false) {
      return { dataUri: null, warning: `Visual fetch failed for ${cardName(card)}: HTTP ${response.status ?? 'unknown'}` };
    }

    const bytes = await readResponseBytesWithLimit(response, maxBytes);
    if (controller.signal.aborted) {
      return { dataUri: null, warning: `Visual fetch timed out for ${cardName(card)} after ${timeoutMs}ms` };
    }
    if (bytes.length === 0) {
      return { dataUri: null, warning: `Visual fetch returned an empty body for ${cardName(card)}` };
    }

    const declaredMime = response.headers?.get?.('content-type')?.split(';')[0]?.trim().toLowerCase();
    const mime = declaredMime?.startsWith('image/') ? declaredMime : sniffImageMime(bytes);
    if (!mime) {
      return { dataUri: null, warning: `Visual fetch did not return a supported image for ${cardName(card)}` };
    }

    return { dataUri: `data:${mime};base64,${bytes.toString('base64')}`, warning: null };
  } catch (error) {
    if (error?.name === 'AbortError' || controller.signal.aborted) {
      return { dataUri: null, warning: `Visual fetch timed out for ${cardName(card)} after ${timeoutMs}ms` };
    }
    if (error instanceof VisualFetchSizeError) {
      return { dataUri: null, warning: `Visual fetch too large for ${cardName(card)}: ${error.message}` };
    }
    return { dataUri: null, warning: `Unable to fetch visual for ${cardName(card)}: ${error?.message ?? error}` };
  } finally {
    clearTimeout(timeout);
  }
}

function decorativeTexture() {
  const palette = ['#f0b86a', '#a77cff', '#5fc9b8', '#f06f6f', '#f8d38a'];
  const nodes = [];
  for (let i = 0; i < 180; i += 1) {
    const x = (i * 73 + 41) % 1200;
    const y = (i * 191 + 23) % 630;
    const radius = 1.4 + (i % 5) * 0.7;
    const opacity = 0.05 + (i % 7) * 0.01;
    const fill = palette[i % palette.length];
    nodes.push(`<circle cx="${x}" cy="${y}" r="${radius.toFixed(1)}" fill="${fill}" opacity="${opacity.toFixed(2)}" />`);
  }
  return nodes.join('\n      ');
}

function renderCardSvg(card, visual) {
  const tokenId = escapeHtml(card.tokenId);
  const name = escapeHtml(card.name);
  const helixaId = escapeHtml(card.helixaId);
  const credScore = escapeHtml(card.credScore);
  const credTier = escapeHtml(card.credTier);
  const initials = escapeHtml(initialsForCard(card));
  const visualMarkup = visual?.dataUri
    ? `<image href="${escapeHtml(visual.dataUri)}" x="770" y="120" width="320" height="320" preserveAspectRatio="xMidYMid slice" clip-path="url(#visualClip)" />`
    : `<rect x="770" y="120" width="320" height="320" rx="72" fill="url(#initialGradient)" clip-path="url(#visualClip)" />
      <text x="930" y="291" text-anchor="middle" dominant-baseline="middle" font-family="Inter, Arial, sans-serif" font-size="116" font-weight="900" fill="#fffaf1">${initials}</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${name} Multipass preview">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff8eb" />
      <stop offset="0.47" stop-color="#f3e4ce" />
      <stop offset="1" stop-color="#dfd1ff" />
    </linearGradient>
    <radialGradient id="glowA" cx="0.12" cy="0.16" r="0.76">
      <stop offset="0" stop-color="#fff1a8" stop-opacity="0.9" />
      <stop offset="1" stop-color="#fff1a8" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="glowB" cx="0.88" cy="0.12" r="0.82">
      <stop offset="0" stop-color="#9b7cff" stop-opacity="0.54" />
      <stop offset="1" stop-color="#9b7cff" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fffaf1" stop-opacity="0.94" />
      <stop offset="1" stop-color="#f7ecdb" stop-opacity="0.9" />
    </linearGradient>
    <linearGradient id="initialGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#191b1c" />
      <stop offset="0.48" stop-color="#6a4cff" />
      <stop offset="1" stop-color="#e8874f" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="24" stdDeviation="24" flood-color="#2c2419" flood-opacity="0.18" />
    </filter>
    <clipPath id="visualClip">
      <rect x="770" y="120" width="320" height="320" rx="72" />
    </clipPath>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <rect width="1200" height="630" fill="url(#glowA)" />
  <rect width="1200" height="630" fill="url(#glowB)" />
  <g opacity="0.85">
      ${decorativeTexture()}
  </g>
  <rect x="58" y="54" width="1084" height="522" rx="48" fill="url(#panel)" stroke="#262018" stroke-opacity="0.12" filter="url(#shadow)" />
  <path d="M100 494 C247 436 363 565 520 505 C658 452 690 370 772 378 C874 389 910 514 1085 448" fill="none" stroke="#191b1c" stroke-opacity="0.08" stroke-width="8" stroke-linecap="round" />
  <g font-family="Inter, Arial, sans-serif" fill="#191b1c">
    <text x="102" y="132" font-size="29" font-weight="900" letter-spacing="5" fill="#6d5c45">MULTIPASS</text>
    <text x="102" y="224" font-size="74" font-weight="950">${name}</text>
    <text x="105" y="280" font-size="30" font-weight="750" fill="#5d5548">Portable agent identity</text>

    <g transform="translate(104 336)">
      <rect width="214" height="112" rx="28" fill="#191b1c" opacity="0.96" />
      <text x="28" y="43" font-size="22" font-weight="850" letter-spacing="3" fill="#f2d095">CRED</text>
      <text x="28" y="91" font-size="52" font-weight="950" fill="#fffaf1">${credScore}</text>
    </g>
    <g transform="translate(342 336)">
      <rect width="286" height="112" rx="28" fill="#fff5e4" stroke="#191b1c" stroke-opacity="0.13" />
      <text x="28" y="43" font-size="22" font-weight="850" letter-spacing="3" fill="#806d50">TIER</text>
      <text x="28" y="86" font-size="36" font-weight="950" fill="#191b1c">${credTier}</text>
    </g>
    <text x="104" y="506" font-size="25" font-weight="780" fill="#5d5548">Helixa ID</text>
    <text x="232" y="506" font-size="27" font-weight="900" fill="#191b1c">${helixaId}</text>
    <text x="104" y="545" font-size="19" font-weight="800" letter-spacing="2" fill="#8a7860">PUBLIC PROFILE · TOKEN #${tokenId}</text>
  </g>
  <g>
    <rect x="742" y="92" width="376" height="376" rx="88" fill="#fffaf1" stroke="#191b1c" stroke-opacity="0.12" stroke-width="2" />
    <rect x="754" y="104" width="352" height="352" rx="80" fill="#191b1c" opacity="0.06" />
    ${visualMarkup}
    <rect x="770" y="120" width="320" height="320" rx="72" fill="none" stroke="#fffaf1" stroke-opacity="0.72" stroke-width="10" />
    <text x="930" y="510" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="900" fill="#5d5548" letter-spacing="3">AGENT CARD</text>
  </g>
</svg>
`;
}

async function rasterizeSvg(svg, { svgPath, pngPath, jpgPath }) {
  await mkdir(dirname(svgPath), { recursive: true });
  await writeFile(svgPath, svg, 'utf8');
  await execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'svg_pipe', '-i', svgPath, '-frames:v', '1', pngPath]);
  await execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'svg_pipe', '-i', svgPath, '-frames:v', '1', '-q:v', '2', jpgPath]);
}

async function shortHashFile(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex').slice(0, 8);
}

async function buildGeneratedCard(card, jpgPath) {
  return {
    tokenId: String(card.tokenId),
    version: await shortHashFile(jpgPath),
    visualSource: card.visual?.imageUrl ?? null,
  };
}

function escapeJavaScriptSingleQuoted(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n').replaceAll('\r', '\\r');
}

async function writeShareHtml(card, generatedCard, htmlPath) {
  const tokenId = String(generatedCard.tokenId);
  const encodedTokenId = encodeURIComponent(tokenId);
  const title = `${card.name} Multipass`;
  const description = `Portable agent identity profile for ${card.name}.`;
  const shareUrl = `${absoluteOrigin}/multipass/share/${encodedTokenId}/`;
  const profileUrl = `${absoluteOrigin}/multipass/?agent=${encodedTokenId}`;
  const imageUrl = getAgentShareImageUrl(generatedCard, absoluteOrigin);
  const visualSource = generatedCard.visualSource
    ? `    <meta name="multipass:visual-source" content="${escapeHtml(generatedCard.visualSource)}" />\n`
    : '';

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(shareUrl)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(shareUrl)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
    <meta name="twitter:image:alt" content="${escapeHtml(title)} preview" />
${visualSource}    <script>
      (() => {
        const crawlerPattern = /bot|crawl|spider|slurp|facebookexternalhit|twitterbot|telegrambot|discordbot|whatsapp|linkedinbot|embedly|quora link preview|pinterest|vkshare|slackbot/i;
        if (!crawlerPattern.test(navigator.userAgent || '')) {
          window.location.replace('${escapeJavaScriptSingleQuoted(profileUrl)}');
        }
      })();
    </script>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8f2e8; color: #191b1c; }
      * { box-sizing: border-box; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 28px; background: radial-gradient(circle at 80% 10%, rgba(180,144,255,.32), transparent 34%), linear-gradient(135deg, #fffaf1, #efe4d2); }
      main { width: min(100%, 860px); }
      .card { border: 1px solid rgba(46,40,30,.16); border-radius: 34px; background: rgba(255,250,241,.82); box-shadow: 0 28px 80px rgba(46,40,30,.16); padding: clamp(18px, 4vw, 34px); }
      img { display: block; width: 100%; border-radius: 24px; border: 1px solid rgba(46,40,30,.12); box-shadow: 0 18px 48px rgba(46,40,30,.12); }
      .copy { display: flex; gap: 18px; align-items: center; justify-content: space-between; margin-top: 22px; flex-wrap: wrap; }
      p { margin: 0; color: #5c5344; font-weight: 750; }
      .open-profile { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; border-radius: 999px; padding: 0 20px; background: #191b1c; color: #fffaf1; text-decoration: none; font-weight: 900; }
    </style>
  </head>
  <body>
    <main>
      <section class="card" aria-label="${escapeHtml(title)} share preview">
        <img src="../${escapeHtml(tokenId)}.jpg" alt="${escapeHtml(title)} preview" />
        <div class="copy">
          <p>${escapeHtml(description)}</p>
          <a class="open-profile" href="${escapeHtml(profileUrl)}">Open Multipass profile</a>
        </div>
      </section>
    </main>
  </body>
</html>
`;

  await mkdir(dirname(htmlPath), { recursive: true });
  await writeFile(htmlPath, html, 'utf8');
}

function jsString(value) {
  return `'${String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')}'`;
}

function buildManifestSource(generatedCards) {
  const sortedCards = [...generatedCards].sort((a, b) => Number(a.tokenId) - Number(b.tokenId) || a.tokenId.localeCompare(b.tokenId));
  const lines = ['export const GENERATED_SHARE_CARDS = Object.freeze({'];
  for (const card of sortedCards) {
    lines.push(`  ${jsString(card.tokenId)}: Object.freeze({`);
    lines.push(`    tokenId: ${jsString(card.tokenId)},`);
    lines.push(`    version: ${jsString(card.version)},`);
    lines.push(`    visualSource: ${card.visualSource == null ? 'null' : jsString(card.visualSource)},`);
    lines.push('  }),');
  }
  lines.push('});');
  lines.push('');
  return lines.join('\n');
}

async function renderAllCards(cards, tempRoot) {
  const rendered = [];
  for (const card of cards) {
    const tokenId = String(card.tokenId);
    const visual = await fetchVisualDataUri(card);
    if (visual.warning) console.warn(`Warning: ${visual.warning}`);
    const svg = renderCardSvg(card, visual);
    const svgPath = join(tempRoot, `${tokenId}.svg`);
    const pngPath = join(tempRoot, `${tokenId}.png`);
    const jpgPath = join(tempRoot, `${tokenId}.jpg`);
    await rasterizeSvg(svg, { svgPath, pngPath, jpgPath });
    rendered.push({ card, generatedCard: await buildGeneratedCard(card, jpgPath), pngPath, jpgPath });
  }
  return rendered;
}

async function writeAllGeneratedOutputs(generated, tempRoot) {
  const files = [];
  const generatedCards = [];

  for (const item of generated) {
    const tokenId = String(item.generatedCard.tokenId);
    const htmlPath = join(tempRoot, tokenId, 'index.html');
    await writeShareHtml(item.card, item.generatedCard, htmlPath);
    generatedCards.push(item.generatedCard);
    files.push({ tempPath: htmlPath, finalPath: join(shareRoot, tokenId, 'index.html') });
    files.push({ tempPath: item.pngPath, finalPath: join(shareRoot, `${tokenId}.png`) });
    files.push({ tempPath: item.jpgPath, finalPath: join(shareRoot, `${tokenId}.jpg`) });
  }

  const tempManifestPath = join(tempRoot, 'generated-share-cards.js');
  await writeFile(tempManifestPath, buildManifestSource(generatedCards), 'utf8');
  files.push({ tempPath: tempManifestPath, finalPath: manifestPath });

  return files;
}

function relativePath(path) {
  return relative(process.cwd(), path) || path;
}

async function checkGeneratedFiles(files) {
  const changed = [];
  for (const file of files) {
    const tempBytes = await readFile(file.tempPath);
    let finalBytes;
    try {
      finalBytes = await readFile(file.finalPath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        changed.push(relativePath(file.finalPath));
        continue;
      }
      throw error;
    }

    if (!tempBytes.equals(finalBytes)) changed.push(relativePath(file.finalPath));
  }

  if (changed.length > 0) {
    console.error('Generated share-card files are out of date:');
    for (const path of changed.sort()) console.error(path);
    process.exitCode = 1;
  }
}

function makeDestinationTempPath(finalPath, runId, index) {
  return join(dirname(finalPath), `.${basename(finalPath)}.${runId}.${index}.tmp`);
}

async function publishOneGeneratedFile(file, index, { fsImpl, runId }) {
  const tempFinalPath = makeDestinationTempPath(file.finalPath, runId, index);
  try {
    await fsImpl.mkdir(dirname(file.finalPath), { recursive: true });
    await fsImpl.copyFile(file.tempPath, tempFinalPath);
    await fsImpl.rename(tempFinalPath, file.finalPath);
  } catch (error) {
    try {
      await fsImpl.rm(tempFinalPath, { force: true });
    } catch {
      // Best-effort cleanup only; preserve the original publish failure.
    }
    throw error;
  }
}

export async function publishGeneratedFiles(files, options = {}) {
  const fsImpl = options.fsImpl ?? defaultFsImpl;
  const manifestFinalPath = options.manifestPath ?? manifestPath;
  const runId = options.runId ?? `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const orderedFiles = [
    ...files.filter((file) => file.finalPath !== manifestFinalPath),
    ...files.filter((file) => file.finalPath === manifestFinalPath),
  ];

  await Promise.all(files.map((file) => fsImpl.readFile(file.tempPath)));
  for (const [index, file] of orderedFiles.entries()) {
    await publishOneGeneratedFile(file, index, { fsImpl, runId });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const tempRoot = createTempRoot();
  await assertFfmpegSvgSupport();
  const cards = numericAgentCards(STATIC_DEMO_DATA);
  if (cards.length === 0) throw new Error('No numeric static agent cards found');

  await mkdir(tempRoot, { recursive: true });
  try {
    const generated = await renderAllCards(cards, tempRoot);
    const files = await writeAllGeneratedOutputs(generated, tempRoot);
    if (options.check) await checkGeneratedFiles(files);
    else await publishGeneratedFiles(files);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
