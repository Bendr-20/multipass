import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, '..');
const distRoot = join(webRoot, 'dist');
const sourcePath = join(distRoot, 'index.html');
const outputPath = join(distRoot, 'allowlist', 'index.html');
const mintOutputPath = join(distRoot, 'mint', 'index.html');

const LOOPERS_DESCRIPTION = 'something new is coming...';
const LOOPERS_MINT_DESCRIPTION = 'Mint Loopers on Base.';
const LOOPERS_SOCIAL_URL = 'https://helixa.xyz/allowlist?x=20260826c';
const LOOPERS_PREVIEW_IMAGE = 'https://helixa.xyz/multipass/loopers-allowlist-preview-20260826c.jpg';

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
  .replace(LOOPERS_SOCIAL_URL, 'https://helixa.xyz/mint'));
