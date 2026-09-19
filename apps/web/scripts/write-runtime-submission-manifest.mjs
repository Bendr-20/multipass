import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RUNTIME_SUBMISSION, buildRuntimeArtifactManifest } from '../src/runtime-submission-data.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '../../..');
const outputPath = join(repoRoot, 'docs/hackathon/bankr-runtime-artifact-manifest.md');

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, buildRuntimeArtifactManifest(RUNTIME_SUBMISSION));
console.log(outputPath);
