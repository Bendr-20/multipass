import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, '..');
const distRoot = join(webRoot, 'dist');
const sourcePath = join(distRoot, 'index.html');
const outputPath = join(distRoot, 'allowlist', 'index.html');
const mintOutputPath = join(distRoot, 'mint', 'index.html');
const pauseOutputPath = join(distRoot, 'pause-mint', 'index.html');
const consoleOutputPath = join(distRoot, 'console', 'index.html');
const runtimeOutputPath = join(distRoot, 'runtime', 'index.html');
const theLoopOutputPath = join(distRoot, 'the-loop', 'index.html');

const LOOPERS_DESCRIPTION = 'something new is coming...';
const LOOPERS_MINT_DESCRIPTION = 'Mint Loopers on Base.';
const LOOPERS_SOCIAL_URL = 'https://helixa.xyz/allowlist?x=20260826c';
const LOOPERS_PREVIEW_IMAGE = 'https://helixa.xyz/multipass/loopers-allowlist-preview-20260826c.jpg';
const LOOPERS_MINT_PREVIEW_IMAGE = 'https://helixa.xyz/multipass/loopers-mint-preview-20260910a.jpg';
const CONSOLE_PREVIEW_IMAGE = 'https://helixa.xyz/multipass/multipass-console-preview-20260925a.png';
const THE_LOOP_TITLE = 'The Loop | Activated Loopers on Base';
const THE_LOOP_DESCRIPTION = 'Discover activated Loopers on Base.';
const THE_LOOP_URL = 'https://helixa.xyz/multipass/the-loop?preview=20261008c';
const THE_LOOP_PREVIEW_IMAGE = 'https://helixa.xyz/multipass/the-loop-marketplace-preview-20261008.png?v=20261008c';

const html = await readFile(sourcePath, 'utf8');
const allowlistHtml = html
  .replace(/<title>[\s\S]*?<\/title>/u, '<title>Loopers</title>')
  .replace(/<meta name="description" content="[^"]*" \/>/u, `<meta name="description" content="${LOOPERS_DESCRIPTION}" />`)
  .replace(/<meta property="og:url" content="[^"]*" \/>/u, `<meta property="og:url" content="${LOOPERS_SOCIAL_URL}" />`)
  .replace(/<meta property="og:title" content="[^"]*" \/>/u, '<meta property="og:title" content="Loopers" />')
  .replace(/<meta property="og:description" content="[^"]*" \/>/u, `<meta property="og:description" content="${LOOPERS_DESCRIPTION}" />`)
  .replace(/<meta property="og:image:type" content="[^"]*" \/>/u, '<meta property="og:image:type" content="image/jpeg" />')
  .replace(
    /<meta property="og:image" content="[^"]*" \/>/u,
    `<meta property="og:image" content="${LOOPERS_PREVIEW_IMAGE}" />\n    <meta property="og:image:secure_url" content="${LOOPERS_PREVIEW_IMAGE}" />\n    <meta property="og:image:alt" content="Loopers preview" />`,
  )
  .replace(/<meta name="twitter:title" content="[^"]*" \/>/u, '<meta name="twitter:title" content="Loopers" />')
  .replace(/<meta name="twitter:description" content="[^"]*" \/>/u, `<meta name="twitter:description" content="${LOOPERS_DESCRIPTION}" />`)
  .replace(
    /<meta name="twitter:image" content="[^"]*" \/>/u,
    `<meta name="twitter:image" content="${LOOPERS_PREVIEW_IMAGE}" />\n    <meta name="twitter:image:src" content="${LOOPERS_PREVIEW_IMAGE}" />\n    <meta name="twitter:image:alt" content="Loopers preview" />`,
  );

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, allowlistHtml);
await mkdir(dirname(mintOutputPath), { recursive: true });
await writeFile(mintOutputPath, allowlistHtml
  .replaceAll(LOOPERS_DESCRIPTION, LOOPERS_MINT_DESCRIPTION)
  .replace(LOOPERS_SOCIAL_URL, 'https://helixa.xyz/mint')
  .replaceAll(LOOPERS_PREVIEW_IMAGE, LOOPERS_MINT_PREVIEW_IMAGE));

await mkdir(dirname(pauseOutputPath), { recursive: true });
await writeFile(pauseOutputPath, allowlistHtml
  .replace(/<title>[\s\S]*?<\/title>/u, '<title>Pause Loopers Mint</title>')
  .replaceAll(LOOPERS_DESCRIPTION, 'Emergency owner-only Loopers mint pause.')
  .replace(LOOPERS_SOCIAL_URL, 'https://helixa.xyz/pause-mint')
  .replace(/<meta property="og:title" content="[^"]*" \/>/u, '<meta property="og:title" content="Pause Loopers Mint" />')
  .replace(/<meta name="twitter:title" content="[^"]*" \/>/u, '<meta name="twitter:title" content="Pause Loopers Mint" />')
  .replaceAll(LOOPERS_PREVIEW_IMAGE, LOOPERS_MINT_PREVIEW_IMAGE));

await mkdir(dirname(consoleOutputPath), { recursive: true });
await writeFile(consoleOutputPath, html
  .replace(/<title>[\s\S]*?<\/title>/u, '<title>Multipass Console</title>')
  .replace(/<meta name="description" content="[^"]*" \/>/u, '<meta name="description" content="Persistent operating console for onchain agents." />')
  .replace(/<meta property="og:title" content="[^"]*" \/>/u, '<meta property="og:title" content="Multipass Console" />')
  .replace(/<meta property="og:description" content="[^"]*" \/>/u, '<meta property="og:description" content="Persistent operating console for onchain agents." />')
  .replace(/<meta property="og:url" content="[^"]*" \/>/u, '<meta property="og:url" content="https://helixa.xyz/multipass/console" />')
  .replace(
    /<meta property="og:image" content="[^"]*" \/>/u,
    `<meta property="og:image" content="${CONSOLE_PREVIEW_IMAGE}" />\n    <meta property="og:image:secure_url" content="${CONSOLE_PREVIEW_IMAGE}" />\n    <meta property="og:image:alt" content="Multipass Console preview" />`,
  )
  .replace(/<meta name="twitter:title" content="[^"]*" \/>/u, '<meta name="twitter:title" content="Multipass Console" />')
  .replace(/<meta name="twitter:description" content="[^"]*" \/>/u, '<meta name="twitter:description" content="Persistent operating console for onchain agents." />')
  .replace(
    /<meta name="twitter:image" content="[^"]*" \/>/u,
    `<meta name="twitter:image" content="${CONSOLE_PREVIEW_IMAGE}" />\n    <meta name="twitter:image:src" content="${CONSOLE_PREVIEW_IMAGE}" />\n    <meta name="twitter:image:alt" content="Multipass Console preview" />`,
  ));

const runtimeTitle = 'Loopers Runtime Console | Bankr RUNTIME';
const runtimeDescription = 'A wallet-owned Looper becomes a memory-bearing Bankr agent with XMTP messaging, Sibyl recall, and holder-reviewed actions.';
await mkdir(dirname(runtimeOutputPath), { recursive: true });
await writeFile(runtimeOutputPath, html
  .replace(/<title>[\s\S]*?<\/title>/u, `<title>${runtimeTitle}</title>`)
  .replace(/<meta name="description" content="[^"]*" \/>/u, `<meta name="description" content="${runtimeDescription}" />`)
  .replace(/<meta property="og:title" content="[^"]*" \/>/u, `<meta property="og:title" content="${runtimeTitle}" />`)
  .replace(/<meta property="og:description" content="[^"]*" \/>/u, `<meta property="og:description" content="${runtimeDescription}" />`)
  .replace(/<meta property="og:url" content="[^"]*" \/>/u, '<meta property="og:url" content="https://helixa.xyz/multipass/runtime" />')
  .replace(/<meta name="twitter:title" content="[^"]*" \/>/u, `<meta name="twitter:title" content="${runtimeTitle}" />`)
  .replace(/<meta name="twitter:description" content="[^"]*" \/>/u, `<meta name="twitter:description" content="${runtimeDescription}" />`));

await mkdir(dirname(theLoopOutputPath), { recursive: true });
await writeFile(theLoopOutputPath, html
  .replace(/<title>[\s\S]*?<\/title>/u, `<title>${THE_LOOP_TITLE}</title>`)
  .replace(/<meta name="description" content="[^"]*" \/>/u, `<meta name="description" content="${THE_LOOP_DESCRIPTION}" />`)
  .replace(/<meta property="og:title" content="[^"]*" \/>/u, `<meta property="og:title" content="${THE_LOOP_TITLE}" />`)
  .replace(/<meta property="og:description" content="[^"]*" \/>/u, `<meta property="og:description" content="${THE_LOOP_DESCRIPTION}" />`)
  .replace(/<meta property="og:url" content="[^"]*" \/>/u, `<meta property="og:url" content="${THE_LOOP_URL}" />`)
  .replace(
    /<meta property="og:image" content="[^"]*" \/>/u,
    `<meta property="og:image" content="${THE_LOOP_PREVIEW_IMAGE}" />\n    <meta property="og:image:secure_url" content="${THE_LOOP_PREVIEW_IMAGE}" />\n    <meta property="og:image:alt" content="The Loop marketplace preview" />`,
  )
  .replace(/<meta name="twitter:title" content="[^"]*" \/>/u, `<meta name="twitter:title" content="${THE_LOOP_TITLE}" />`)
  .replace(/<meta name="twitter:description" content="[^"]*" \/>/u, `<meta name="twitter:description" content="${THE_LOOP_DESCRIPTION}" />`)
  .replace(
    /<meta name="twitter:image" content="[^"]*" \/>/u,
    `<meta name="twitter:image" content="${THE_LOOP_PREVIEW_IMAGE}" />\n    <meta name="twitter:image:src" content="${THE_LOOP_PREVIEW_IMAGE}" />\n    <meta name="twitter:image:alt" content="The Loop marketplace preview" />`,
  ));
