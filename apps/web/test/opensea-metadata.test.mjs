import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const metadataPath = new URL('../public/opensea/helixa-agentdna-tool.json', import.meta.url);
const imagePath = new URL('../public/opensea/helixa-agentdna-tool.jpg', import.meta.url);
const sourceSvgPath = new URL('../public/opensea/helixa-agentdna-tool.svg', import.meta.url);

function readJpegSize(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('expected JPEG image');
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error('invalid JPEG marker');
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  throw new Error('JPEG dimensions not found');
}

test('OpenSea tool metadata publishes a feature image and public tool references', async () => {
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));

  assert.equal(metadata.name, 'Helixa AgentDNA');
  assert.match(metadata.description, /public agent identity and trust/i);
  assert.equal(metadata.image, 'https://helixa.xyz/multipass/opensea/helixa-agentdna-tool.jpg');
  assert.equal(metadata.external_url, 'https://helixa.xyz/multipass/?agent=1');
  assert.equal(metadata.properties.kind, 'agent_tool_metadata');
  assert.equal(metadata.properties.agent_card_url, 'https://helixa.xyz/api/multipass/bendr-2-1/agent-card');
  assert.equal(metadata.properties.tools_url, 'https://helixa.xyz/api/multipass/bendr-2-1/tools');
  assert.equal(metadata.properties.multipass_url, 'https://helixa.xyz/api/multipass/bendr-2-1');
  assert.equal(metadata.properties.image_alt, 'Helixa AgentDNA OpenSea feature image for Bendr 2.0 showing agent identity, public tools, trust signals, and Base AgentDNA ID 8453:1.');
  assert.ok(Array.isArray(metadata.attributes));
  assert.ok(metadata.attributes.some((attribute) => attribute.trait_type === 'Platform' && attribute.value === 'Helixa'));
  assert.ok(metadata.attributes.some((attribute) => attribute.trait_type === 'Tool Type' && attribute.value === 'Agent identity and trust lookup'));
});

test('OpenSea feature image is a dedicated 1200x630 generated asset', async () => {
  const [jpgBytes, svgSource] = await Promise.all([
    readFile(imagePath),
    readFile(sourceSvgPath, 'utf8'),
  ]);

  assert.deepEqual(readJpegSize(jpgBytes), { width: 1200, height: 630 });
  assert.match(svgSource, /Helixa AgentDNA/);
  assert.match(svgSource, /Agent Tool Registry/);
  assert.match(svgSource, /Bendr 2\.0/);
  assert.doesNotMatch(svgSource, /[\u{1F300}-\u{1FAFF}]/u);
});
