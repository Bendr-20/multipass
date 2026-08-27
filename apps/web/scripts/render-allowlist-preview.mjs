import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, '..');
const logoPath = join(webRoot, 'public', 'loopers-logo.png');
const outputPath = join(webRoot, 'public', 'loopers-allowlist-preview.png');
const jpgOutputPath = join(webRoot, 'public', 'loopers-allowlist-preview-20260826c.jpg');

const logoBytes = await readFile(logoPath);
const logoDataUrl = `data:image/png;base64,${logoBytes.toString('base64')}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',
  args: ['--no-sandbox'],
});

try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });

  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          * { box-sizing: border-box; }
          html,
          body {
            width: 1200px;
            height: 630px;
            margin: 0;
            overflow: hidden;
            background: #050505;
          }

          body {
            display: grid;
            place-items: center;
            background: #050505;
          }

          body::before,
          body::after {
            position: absolute;
            inset: -12%;
            content: "";
            pointer-events: none;
          }

          body::before {
            background: repeating-conic-gradient(from 7deg, #020202 0 5%, #ffffff 0 5.6%, #111111 0 10%, #dddddd 0 10.7%, #070707 0 16%);
            background-size: 8px 8px;
            filter: contrast(300%) brightness(0.72);
            opacity: 0.92;
          }

          body::after {
            background:
              repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.12) 0 1px, transparent 1px 4px, rgba(0, 0, 0, 0.35) 4px 5px),
              radial-gradient(circle at 50% 48%, transparent 0 44%, rgba(0, 0, 0, 0.35) 82%);
            opacity: 0.78;
          }

          .preview {
            position: relative;
            z-index: 1;
            display: grid;
            place-items: center;
            width: 100%;
            height: 100%;
            padding: 92px 96px 86px;
          }

          img {
            display: block;
            width: 790px;
            height: auto;
            filter:
              drop-shadow(5px 0 0 rgba(0, 245, 255, 0.34))
              drop-shadow(-5px 0 0 rgba(255, 0, 128, 0.32))
              drop-shadow(0 20px 16px rgba(0, 0, 0, 0.82));
          }
        </style>
      </head>
      <body>
        <main class="preview">
          <img src="${logoDataUrl}" alt="Loopers" />
        </main>
      </body>
    </html>
  `, { waitUntil: 'load' });

  const clip = { x: 0, y: 0, width: 1200, height: 630 };
  await page.screenshot({ path: outputPath, type: 'png', clip });
  await page.screenshot({ path: jpgOutputPath, type: 'jpeg', quality: 92, clip });
} finally {
  await browser.close();
}
