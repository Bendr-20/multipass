#!/usr/bin/env node
import { readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { readJsonFile } from '../src/index.js';

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printUsage();
  process.exit(0);
}

const required = ['metadataDir', 'imagesDir', 'outputPath'];
for (const key of required) {
  if (!args[key]) throw new Error(`Missing required option --${toFlag(key)}`);
}

const sampleSize = args.sampleSize ? Number(args.sampleSize) : 48;
if (!Number.isInteger(sampleSize) || sampleSize <= 0) throw new Error('--sample-size must be a positive integer');

const tokens = await readTokens(args.metadataDir);
const traitCounts = countVisualTraits(tokens);
const scored = tokens
  .map((token) => ({
    token,
    rarity_score: scoreRarity(token, traitCounts),
    non_none_optional_count: countNonNoneOptionals(token),
  }))
  .sort((a, b) => b.rarity_score - a.rarity_score);

const selected = new Map();
addSample(selected, tokens.find((token) => token.id === 1), 'edge:first');
addSample(selected, tokens.find((token) => token.id === 777), 'edge:777');
addSample(selected, tokens.find((token) => token.id === 1777), 'edge:1777');
addSample(selected, tokens.find((token) => token.id === 3777), 'edge:3777');
addSample(selected, tokens.find((token) => token.id === 5777), 'edge:5777');
addSample(selected, tokens.find((token) => token.id === 7777), 'edge:last');

for (const item of scored.slice(0, sampleSize)) addSample(selected, item.token, 'rare-score');

for (const layer of ['Background', 'Outfit', 'Skin', 'Eyes', 'Head Layer', 'Eyewear', 'Held Object', 'Artifact', 'Overlay']) {
  const rareValues = Object.entries(traitCounts[layer] ?? {})
    .filter(([value]) => value !== 'None')
    .sort((a, b) => a[1] - b[1])
    .slice(0, 5)
    .map(([value]) => value);
  for (const value of rareValues) {
    const token = tokens.find((candidate) => getTrait(candidate, layer) === value);
    addSample(selected, token, `rare-${layer}:${value}`);
  }
}

const classes = new Set(tokens.map((token) => token.agent_class));
for (const agentClass of classes) {
  const token = scored.find((candidate) => candidate.token.agent_class === agentClass)?.token;
  addSample(selected, token, `class:${agentClass}`);
}

const report = {
  generated_at: new Date().toISOString(),
  source_metadata_dir: args.metadataDir,
  source_images_dir: args.imagesDir,
  token_count: tokens.length,
  sample_count: selected.size,
  samples: [...selected.values()]
    .sort((a, b) => a.id - b.id)
    .map((sample) => ({
      id: sample.id,
      reasons: [...sample.reasons].sort(),
      rarity_score: Number(sample.rarity_score.toFixed(6)),
      agent_class: sample.agent_class,
      secondary_class: sample.secondary_class,
      optional_trait_count: sample.non_none_optional_count,
      traits: Object.fromEntries(sample.visual_traits.map((trait) => [trait.trait_type, trait.value])),
      image_path: join(args.imagesDir, `${sample.id}.png`),
      metadata_path: join(args.metadataDir, `${sample.id}.json`),
    })),
};

await mkdir(dirname(args.outputPath), { recursive: true });
await writeFile(args.outputPath, `${JSON.stringify(report, null, 2)}\n`);

if (args.htmlPath) {
  await mkdir(dirname(args.htmlPath), { recursive: true });
  await writeFile(args.htmlPath, renderHtml(report, args.htmlPath), 'utf8');
}

console.log(`Selected ${report.sample_count} QA samples from ${report.token_count} Loopers`);
console.log(`Report: ${args.outputPath}`);
if (args.htmlPath) console.log(`Review page: ${args.htmlPath}`);

async function readTokens(metadataDir) {
  const ids = (await readdir(metadataDir))
    .filter((file) => /^\d+\.json$/.test(file))
    .map((file) => Number(file.slice(0, -5)))
    .sort((a, b) => a - b);
  const items = [];
  for (const id of ids) {
    const token = await readJsonFile(join(metadataDir, `${id}.json`));
    items.push({
      id,
      ...token,
      visual_traits: token.attributes.filter((attribute) =>
        ['Background', 'Outfit', 'Skin', 'Eyes', 'Mouth', 'Head Layer', 'Eyewear', 'Held Object', 'Foreground Scraps', 'Artifact', 'Overlay'].includes(attribute.trait_type),
      ),
    });
  }
  return items;
}

function countVisualTraits(tokens) {
  const counts = {};
  for (const token of tokens) {
    for (const trait of token.visual_traits) {
      counts[trait.trait_type] ??= {};
      counts[trait.trait_type][trait.value] = (counts[trait.trait_type][trait.value] ?? 0) + 1;
    }
  }
  return counts;
}

function scoreRarity(token, traitCounts) {
  let score = 0;
  for (const trait of token.visual_traits) {
    const count = traitCounts[trait.trait_type]?.[trait.value] ?? 1;
    if (trait.value !== 'None') score += Math.log(token.visual_traits.length + 7777 / count);
  }
  return score + countNonNoneOptionals(token) * 2;
}

function countNonNoneOptionals(token) {
  return token.visual_traits.filter((trait) =>
    ['Eyewear', 'Held Object', 'Foreground Scraps', 'Artifact', 'Overlay'].includes(trait.trait_type) && trait.value !== 'None',
  ).length;
}

function getTrait(token, layer) {
  return token.visual_traits.find((trait) => trait.trait_type === layer)?.value ?? null;
}

function addSample(selected, token, reason) {
  if (!token) return;
  if (!selected.has(token.id)) {
    selected.set(token.id, {
      ...token,
      reasons: new Set(),
      rarity_score: scoreRarity(token, traitCounts),
      non_none_optional_count: countNonNoneOptionals(token),
    });
  }
  const sample = selected.get(token.id);
  sample.reasons.add(reason);
}

function renderHtml(report, htmlPath) {
  const escapeHtml = (value) =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const cards = report.samples
    .map((sample) => {
      const relativeImage = relative(dirname(htmlPath), sample.image_path);
      const traits = Object.entries(sample.traits)
        .map(([layer, value]) => `<li><span>${escapeHtml(layer)}</span>${escapeHtml(value)}</li>`)
        .join('');
      return `<article>
  <img src="${escapeHtml(relativeImage)}" alt="Looper #${sample.id}">
  <h2>Looper #${sample.id}</h2>
  <p>${escapeHtml(sample.reasons.join(' | '))}</p>
  <p>${escapeHtml(sample.agent_class)}${sample.secondary_class ? ` / ${escapeHtml(sample.secondary_class)}` : ''}</p>
  <ul>${traits}</ul>
</article>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Loopers Private QA Samples</title>
  <style>
    body { margin: 0; font: 14px/1.4 system-ui, sans-serif; background: #111; color: #eee; }
    header { position: sticky; top: 0; z-index: 1; padding: 16px 20px; background: #111; border-bottom: 1px solid #333; }
    main { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; padding: 12px; }
    article { border: 1px solid #333; background: #181818; padding: 10px; }
    img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; background: #000; }
    h2 { margin: 8px 0 4px; font-size: 16px; }
    p { margin: 4px 0; color: #bbb; }
    ul { margin: 8px 0 0; padding: 0; list-style: none; font-size: 12px; }
    li { display: flex; justify-content: space-between; gap: 8px; border-top: 1px solid #2a2a2a; padding: 4px 0; }
    li span { color: #888; }
  </style>
</head>
<body>
  <header>
    <strong>Loopers Private QA Samples</strong>
    <span>${report.sample_count} samples from ${report.token_count} tokens, generated ${escapeHtml(report.generated_at)}</span>
  </header>
  <main>${cards}</main>
</body>
</html>
`;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    parsed[toCamel(arg.slice(2))] = argv[index + 1];
    index += 1;
  }
  return parsed;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function toFlag(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function printUsage() {
  console.log(`Usage:
  node packages/loopers-metadata/scripts/select-loopers-qa-samples.js \\
    --metadata-dir /private/final-loopers-metadata/metadata \\
    --images-dir /private/hashlips/build/images \\
    --output-path /private/final-loopers-metadata/qa-samples.json \\
    --html-path /private/final-loopers-metadata/qa-samples.html \\
    --sample-size 48`);
}
