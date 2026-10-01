import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { RestapPolicyNotAuthorizedError, RestapPolicyUnavailableError, authorizeRestap3802Policy, loadRestap3802Policy } from '../src/restap-3802-policy.js';

const FIXTURE = new URL('../fixtures/restap/looper-3802-policy.example.json', import.meta.url);
const OWNER = '0x1111111111111111111111111111111111111111';

async function withPolicy(mutator, run) {
  const directory = await mkdtemp(join(tmpdir(), 'restap-policy-'));
  try {
    const source = JSON.parse(await readFile(FIXTURE, 'utf8'));
    mutator?.(source);
    const path = join(directory, 'policy.json');
    await writeFile(path, JSON.stringify(source, null, 2) + '\n', { mode: 0o600 });
    await run(path, source, directory);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test('loads and freezes the exact protected #3802 policy', async () => {
  await withPolicy((p) => p.newsSenders.push({ id: 'Agent.One', kind: 'evm', enabled: true, signer: OWNER }), async (path) => {
    const policy = await loadRestap3802Policy({ policyPath: path });
    assert.equal(policy.tokenId, '3802');
    assert.equal(policy.newsSenders[0].id, 'agent.one');
    assert.equal(Object.isFrozen(policy), true);
    assert.equal(Object.isFrozen(policy.authority), true);
    assert.equal(Object.isFrozen(policy.newsSenders), true);
  });
});

test('rejects unsafe files, malformed roots, unknown keys, and wrong canary authority', async () => {
  await assert.rejects(() => loadRestap3802Policy({ policyPath: '/definitely/missing/restap.json' }));
  await withPolicy(null, async (path, source, directory) => {
    const link = join(directory, 'link.json');
    await symlink(path, link);
    await assert.rejects(() => loadRestap3802Policy({ policyPath: link }), /symlink|regular/i);
    await chmod(path, 0o622);
    await assert.rejects(() => loadRestap3802Policy({ policyPath: path }), /writable|mode/i);
    await chmod(path, 0o600);
    source.extra = true;
    await writeFile(path, JSON.stringify(source), { mode: 0o600 });
    await assert.rejects(() => loadRestap3802Policy({ policyPath: path }), /unknown/i);
  });
  for (const mutate of [
    (p) => { p.tokenId = '3801'; },
    (p) => { p.authority.chainId = 1; },
    (p) => { p.authority.collection = OWNER; },
    (p) => { p.authority.erc8004Registry = OWNER; },
    (p) => { p.authority.erc8004AgentId = '0'; },
    (p) => { p.publicProfile.displayName = ''; },
  ]) await withPolicy(mutate, async (path) => assert.rejects(() => loadRestap3802Policy({ policyPath: path })));
});

test('rejects normalized sender collisions and invalid ERC-8004 sender metadata', async () => {
  await withPolicy((p) => { p.newsSenders = [
    { id: 'AGENT.ONE', kind: 'evm', enabled: true, signer: OWNER },
    { id: 'agent.one', kind: 'evm', enabled: true, signer: OWNER },
]; }, async (path) => assert.rejects(() => loadRestap3802Policy({ policyPath: path }), /duplicate/i));
  await withPolicy((p) => { p.newsSenders = [{ id: 'agent', kind: 'erc8004', enabled: true, signer: OWNER, erc8004: { chainId: 1, registry: p.authority.erc8004Registry, agentId: '1' } }]; }, async (path) => assert.rejects(() => loadRestap3802Policy({ policyPath: path }), /8453|base/i));
});

test('authorizes only fresh matching authority and Codex canonical identity', async () => {
  await withPolicy(null, async (path) => {
    const policy = await loadRestap3802Policy({ policyPath: path });
    const authorized = await authorizeRestap3802Policy({ policy, resolveAuthority: async () => ({ chainId: 8453, contract: policy.authority.collection, tokenId: '3802', owner: OWNER, erc8004AgentId: '1', controller: OWNER, controllerVerified: true }), loadCodexProfile: async () => ({ identity: { tokenId: 3802, canonicalName: 'Looper #3802', image: { url: 'https://helixa.xyz/loopers/images/3802.png' } } }) });
    assert.deepEqual(authorized.canonicalIdentity, { canonicalName: 'Looper #3802', imageUrl: 'https://helixa.xyz/loopers/images/3802.png' });
    assert.equal(authorized.ownerPublicProfile.displayName, policy.publicProfile.displayName);
    assert.equal(Object.isFrozen(authorized), true);
  });
});

test('fails closed after owner/controller transfer or disabled public conversation', async () => {
  await withPolicy(null, async (path) => {
    const policy = await loadRestap3802Policy({ policyPath: path });
    const codex = async () => ({ identity: { tokenId: 3802, canonicalName: 'Looper #3802', image: { url: 'https://helixa.xyz/i.png' } } });
    for (const authority of [
      { chainId: 8453, contract: policy.authority.collection, tokenId: '3802', owner: '0x2222222222222222222222222222222222222222', erc8004AgentId: '1', controller: OWNER, controllerVerified: true },
      { chainId: 8453, contract: policy.authority.collection, tokenId: '3802', owner: OWNER, erc8004AgentId: '1', controller: '0x2222222222222222222222222222222222222222', controllerVerified: true },
      { chainId: 8453, contract: policy.authority.collection, tokenId: '3802', owner: OWNER, erc8004AgentId: '1', controller: OWNER, controllerVerified: false },
    ]) await assert.rejects(() => authorizeRestap3802Policy({ policy, resolveAuthority: async () => authority, loadCodexProfile: codex }), RestapPolicyNotAuthorizedError);
  });
  await withPolicy((p) => { p.publicProfile.publicConversationEnabled = false; }, async (path) => {
    const policy = await loadRestap3802Policy({ policyPath: path });
    await assert.rejects(() => authorizeRestap3802Policy({ policy, resolveAuthority: async () => ({}), loadCodexProfile: async () => ({}) }), RestapPolicyNotAuthorizedError);
  });
});

test('maps resolver failures to typed unavailable errors', async () => {
  await withPolicy(null, async (path) => {
    const policy = await loadRestap3802Policy({ policyPath: path });
    await assert.rejects(() => authorizeRestap3802Policy({ policy, resolveAuthority: async () => { throw new Error('secret rpc'); }, loadCodexProfile: async () => ({}) }), RestapPolicyUnavailableError);
  });
});
