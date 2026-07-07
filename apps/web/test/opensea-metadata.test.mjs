import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const metadataPath = new URL('../public/opensea/helixa-agentdna-tool.json', import.meta.url);

test('OpenSea tool metadata publishes a feature image and public tool references', async () => {
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));

  assert.equal(metadata.name, 'Helixa AgentDNA');
  assert.match(metadata.description, /public agent identity and trust/i);
  assert.equal(metadata.image, 'https://helixa.xyz/multipass/share/1.jpg');
  assert.equal(metadata.external_url, 'https://helixa.xyz/multipass/?agent=1');
  assert.equal(metadata.properties.kind, 'agent_tool_metadata');
  assert.equal(metadata.properties.agent_card_url, 'https://helixa.xyz/api/multipass/bendr-2-1/agent-card');
  assert.equal(metadata.properties.tools_url, 'https://helixa.xyz/api/multipass/bendr-2-1/tools');
  assert.equal(metadata.properties.multipass_url, 'https://helixa.xyz/api/multipass/bendr-2-1');
  assert.equal(metadata.properties.image_alt, 'Multipass feature card for Bendr 2.0 showing Cred 80, Preferred tier, Helixa ID 8453:1, and public profile token 1.');
  assert.ok(Array.isArray(metadata.attributes));
  assert.ok(metadata.attributes.some((attribute) => attribute.trait_type === 'Platform' && attribute.value === 'Helixa'));
  assert.ok(metadata.attributes.some((attribute) => attribute.trait_type === 'Tool Type' && attribute.value === 'Agent identity and trust lookup'));
});
