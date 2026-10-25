import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeSwarmLaunchWorkspaceRequest } from '../../../packages/types/src/swarm-launch.js';
import { deriveSwarmLaunchDraftFromInvitation } from '../../../apps/web/src/missions/swarm-invitations.js';

const artifactUrl = new URL('../../../review-artifacts/swarm-command/multipass-app-store-terms-v1.json', import.meta.url);

async function loadArtifact() {
  return JSON.parse(await readFile(artifactUrl, 'utf8'));
}

test('Multipass App Store terms pin the accepted five-member preparation packet', async () => {
  const artifact = await loadArtifact();
  assert.equal(artifact.schema, 'multipass.swarm-terms.v1');
  assert.equal(artifact.status, 'TERMS_FINALIZED_PENDING_UNANIMOUS_CONSENT');
  assert.deepEqual(artifact.roster.map((member) => member.tokenId), ['2431', '1', '3802', '420', '452']);
  assert.equal(new Set(artifact.roster.map((member) => member.didKey)).size, 5);
  assert.equal(artifact.roster.reduce((sum, member) => sum + member.contributionBps, 0), 10_000);
  assert.ok(artifact.roster.every((member) => member.contributionBps === 2_000));
  assert.equal(artifact.token.name, 'Multipass Apps');
  assert.equal(artifact.token.ticker, 'APPS');
  assert.equal(artifact.token.supply, '1000000000');
  assert.equal(artifact.economics.totalAllocationBps, 10_000);
  assert.equal(artifact.economics.agentVesting.perMemberWholeTokens, '90000000');
  assert.equal(artifact.workspace.repository.visibility, 'PUBLIC');
  assert.equal(artifact.execution.deploymentAuthorized, false);
  assert.equal(artifact.execution.consentProposalCreated, false);
  assert.equal(artifact.execution.transactions, 0);

  const workspace = normalizeSwarmLaunchWorkspaceRequest({
    provider: artifact.workspace.provider,
    repository: {
      slug: artifact.workspace.repository.slug,
      visibility: artifact.workspace.repository.visibility,
    },
    members: artifact.roster.map(({ tokenId, didKey }) => ({ tokenId, didKey })),
    githubMirror: artifact.workspace.githubMirror,
  }, artifact.roster.map(({ tokenId }) => ({ tokenId })));
  assert.equal(workspace.repository.provisioningStatus, 'NOT_PROVISIONED');
  assert.equal(workspace.delegation.capabilityStatus, 'REQUIRED_UNAVAILABLE');
});

test('public preparation packet contains no owner wallets or private key material', async () => {
  const serialized = JSON.stringify(await loadArtifact());
  assert.doesNotMatch(serialized, /0x[0-9a-f]{40}/iu);
  assert.doesNotMatch(serialized, /PRIVATE KEY|BEGIN PRIVATE|private.pem/iu);
});


test('Console accepted-roster handoff matches the canonical review packet', async () => {
  const artifact = await loadArtifact();
  const ids = artifact.roster.map((member) => member.tokenId);
  const draft = {
    lead: { tokenId: ids[0], owner: '0x' + '1'.repeat(40) },
    invites: ids.slice(1).map((tokenId, index) => ({ tokenId, owner: '0x' + String(index + 2).repeat(40), status: 'accepted' })),
  };
  const handoff = deriveSwarmLaunchDraftFromInvitation(draft);
  assert.deepEqual(handoff.members.map(({ tokenId, role, contributionBps }) => ({ tokenId, role, contributionBps })), artifact.roster.map(({ tokenId, role, contributionBps }) => ({ tokenId, role, contributionBps })));
  assert.deepEqual(handoff.workspace.members, artifact.roster.map(({ tokenId, didKey }) => ({ tokenId, didKey })));
  assert.deepEqual(handoff.app, artifact.app);
  assert.deepEqual(handoff.token, { name: artifact.token.name, ticker: artifact.token.ticker, supply: artifact.token.supply, curve: artifact.token.curve });
  assert.equal(handoff.workspace.repository.visibility, artifact.workspace.repository.visibility);
});
