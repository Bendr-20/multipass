import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const RUNBOOK = new URL('../../../docs/loopers/active-looper-restap-network.md', import.meta.url);
const README = new URL('../../../docs/loopers/README.md', import.meta.url);

test('runbook contains every required operational and privacy section', async () => {
  const text = await readFile(RUNBOOK, 'utf8');
  for (const heading of ['Architecture', 'Secrets, key rotation, and compromise', 'Database, WAL, and backup privacy', 'Gate dependency matrix', 'Roster hashing', 'One-shot and daily pilot', 'Metrics and alerts', 'Seven-day evidence queries', 'Unrouted canary', 'Promotion', 'Rollback', 'Emergency stop', 'Custody rebuild', 'Unknown-charge reconciliation', '#3802 isolation', 'Approval boundaries']) assert.equal(text.includes('## ' + heading + '\n'), true, heading);
  const index = await readFile(README, 'utf8');
  assert.match(index, /Active Looper RESTAP Network/u);
  assert.match(index, /active-looper-restap-network\.md/u);
});

test('runbook pins complete local canary promotion and rollback arguments without embedding secrets', async () => {
  const text = await readFile(RUNBOOK, 'utf8');
  for (const value of ['--release <IMMUTABLE_RELEASE>', '--release-sha <REVIEWED_SHA>', '--artifact <CODEX_ARTIFACT>', '--key-registry <ROOT_0600_KEY_REGISTRY>', '--policy <ROOT_0600_POLICY>', '--database <RESTAP_NETWORK_DB>', '--unit <NETWORK_UNIT>', '--static-root <STATIC_ROOT>', '--backup-root <BACKUP_ROOT>', '--proof-root <PROOF_ROOT>', '--expected-gates 0,0,0,0,0,0,0,0', '--fixture-key-ref signer=<ROOT_0600_SIGNING_KEY>', '--rehearsal-proof <REHEARSAL_PROOF>', '--rollback']) assert.equal(text.includes(value), true, value);
  assert.doesNotMatch(text, /BEGIN (?:PRIVATE KEY|OPENSSH PRIVATE KEY)|bk_[A-Za-z0-9]{12,}|0x[0-9a-f]{64}/iu);
  assert.match(text, /placeholders only/iu);
});

test('seven-day evidence queries prove all zero-failure invariants with expected shapes', async () => {
  const text = await readFile(RUNBOOK, 'utf8');
  for (const invariant of ['duplicate delivery', 'commit after epoch/policy/gate change', 'cap overrun', 'plaintext/private sentinel hit', 'bounded provider cost', 'reviewed key/gate/roster hashes', 'one worker holder', 'unexplained restart']) assert.equal(text.toLowerCase().includes(invariant.toLowerCase()), true, invariant);
  assert.ok((text.match(/Expected: 0 rows/gu) ?? []).length >= 5);
  assert.match(text, /80%.*100%/su);
  assert.match(text, /seven-day|7-day/iu);
});

test('approval boundaries are separate and no later phase is chained into an earlier command', async () => {
  const text = await readFile(RUNBOOK, 'utf8');
  const approvals = ['Phase 0 foundation', 'internal discovery', 'one-shot initiation', 'daily schedules', 'replies', 'beta roster expansion', 'GA roster removal'];
  for (const approval of approvals) assert.equal(text.toLowerCase().includes(('Approval: ' + approval).toLowerCase()), true, approval);
  for (const line of text.split('\n').filter((entry) => entry.includes('Approval:'))) assert.doesNotMatch(line, /&&|;|\|/u);
  assert.match(text, /No later phase command may be appended or chained/iu);
});
