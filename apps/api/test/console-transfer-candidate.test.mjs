import assert from 'node:assert/strict';
import test from 'node:test';

import { getAddress } from 'viem';

import { getConsoleSkillCatalog } from '../src/console-skill-catalog.js';
import { decodeConsoleLlmEnvelope } from '../src/console-transfer-candidate.js';

const catalog = getConsoleSkillCatalog();
const recipient = '0x1111111111111111111111111111111111111111';
const token = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

function envelope(overrides = {}) {
  return {
    schema_version: '0.1.0',
    assistant_text: 'Send 0.01 ETH to the treasury after review.',
    skill_refs: ['bankr'],
    transfer_candidates: [{
      skill: 'bankr',
      assetType: 'native',
      assetContract: null,
      recipient,
      amountBaseUnits: '10000000000000000',
      rationale: 'Owner-requested treasury funding.',
    }],
    ...overrides,
  };
}

function decode(value, selectedCatalog = catalog) {
  const content = typeof value === 'string' ? value : JSON.stringify(value);
  return decodeConsoleLlmEnvelope(content, { catalog: selectedCatalog });
}

function assertRecursivelyFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertRecursivelyFrozen(child);
}

function assertRejected(value, selectedCatalog = catalog) {
  const content = typeof value === 'string' ? value : JSON.stringify(value);
  const result = decodeConsoleLlmEnvelope(content, { catalog: selectedCatalog });
  assert.deepEqual(result.skillRefs, []);
  assert.deepEqual(result.transferCandidates, []);
  assert.ok(Buffer.byteLength(result.text, 'utf8') <= 4_096);
  assertRecursivelyFrozen(result);
  return result;
}

function frozenCatalog(skills) {
  for (const skill of skills) {
    Object.freeze(skill.enabledCapabilities);
    Object.freeze(skill);
  }
  Object.freeze(skills);
  return Object.freeze({ version: 'test', skills });
}

test('normalizes the exact native transfer envelope into frozen non-authoritative data', () => {
  const result = decode(envelope());

  assert.deepEqual(result, {
    text: 'Send 0.01 ETH to the treasury after review.',
    skillRefs: ['bankr'],
    transferCandidates: [{
      skill: 'bankr',
      assetType: 'native',
      assetContract: null,
      recipient: getAddress(recipient),
      amountBaseUnits: '10000000000000000',
      rationale: 'Owner-requested treasury funding.',
    }],
  });
  assert.deepEqual(Object.keys(result).sort(), ['skillRefs', 'text', 'transferCandidates']);
  assert.deepEqual(Object.keys(result.transferCandidates[0]).sort(), [
    'amountBaseUnits',
    'assetContract',
    'assetType',
    'rationale',
    'recipient',
    'skill',
  ]);
  assertRecursivelyFrozen(result);
});

test('unwraps one exact JSON markdown fence without leaking the schema envelope into chat', () => {
  const content = `\`\`\`json\n${JSON.stringify(envelope({
    assistant_text: 'Bankr can read current BTC, ETH, SOL, and USDC prices and draft review-only transfers.',
    transfer_candidates: [],
  }))}\n\`\`\``;

  const result = decode(content);

  assert.deepEqual(result, {
    text: 'Bankr can read current BTC, ETH, SOL, and USDC prices and draft review-only transfers.',
    skillRefs: ['bankr'],
    transferCandidates: [],
  });
  assert.doesNotMatch(result.text, /```|schema_version|assistant_text|skill_refs|transfer_candidates/);
  assertRecursivelyFrozen(result);
});

test('normalizes an ERC-20 candidate address while preserving canonical amount text', () => {
  const value = envelope({
    transfer_candidates: [{
      skill: 'bankr',
      assetType: 'erc20',
      assetContract: token,
      recipient,
      amountBaseUnits: '1',
      rationale: 'A reviewed token transfer.',
    }],
  });
  const candidate = decode(value).transferCandidates[0];

  assert.equal(candidate.assetContract, getAddress(token));
  assert.equal(candidate.recipient, getAddress(recipient));
  assert.equal(candidate.amountBaseUnits, '1');
});

test('accepts zero candidates and up to four unique known bounded skill references', () => {
  const selectedCatalog = frozenCatalog([
    { id: 'bankr', enabledCapabilities: ['explain', 'propose_transfer'] },
    { id: 'alpha', enabledCapabilities: ['explain'] },
    { id: 'beta', enabledCapabilities: ['explain'] },
    { id: 'gamma', enabledCapabilities: ['explain'] },
    { id: 'delta', enabledCapabilities: ['explain'] },
  ]);
  const result = decode({
    schema_version: '0.1.0',
    assistant_text: 'No transfer requested.',
    skill_refs: ['bankr', 'alpha', 'beta', 'gamma'],
    transfer_candidates: [],
  }, selectedCatalog);

  assert.deepEqual(result, {
    text: 'No transfer requested.',
    skillRefs: ['bankr', 'alpha', 'beta', 'gamma'],
    transferCandidates: [],
  });
  assertRecursivelyFrozen(result);
});

test('turns malformed, mixed, duplicate-key, empty, and non-string content into safe fallback text', () => {
  for (const content of [
    '  ordinary assistant prose  ',
    'prefix {"schema_version":"0.1.0"}',
    '{"schema_version":"0.1.0",',
    '{"schema_version":"0.1.0","schema_version":"evil"}',
  ]) {
    const result = decodeConsoleLlmEnvelope(content, { catalog });
    assert.equal(result.text, content.trim());
    assert.deepEqual(result.skillRefs, []);
    assert.deepEqual(result.transferCandidates, []);
    assertRecursivelyFrozen(result);
  }

  for (const content of ['', '   ', null, undefined, 0, false, {}]) {
    assert.deepEqual(decodeConsoleLlmEnvelope(content, { catalog }), {
      text: '',
      skillRefs: [],
      transferCandidates: [],
    });
  }
});

test('truncates malformed fallback text to 4096 UTF-8 bytes on a valid boundary', () => {
  const content = `  ${'a'.repeat(4_095)}💸trailing  `;
  const result = decodeConsoleLlmEnvelope(content, { catalog });

  assert.equal(result.text, 'a'.repeat(4_095));
  assert.equal(Buffer.byteLength(result.text, 'utf8'), 4_095);
  assert.doesNotMatch(result.text, /�/);
  assert.deepEqual(result.skillRefs, []);
  assert.deepEqual(result.transferCandidates, []);
});

test('rejects unknown envelope and candidate keys including authority and transaction fields', () => {
  const forbidden = [
    'id',
    'status',
    'scope',
    'approval',
    'execution',
    'chainId',
    'account',
    'owner',
    'decimals',
    'expiresAt',
    'revision',
    'lifecycle',
    'authority',
    'calldata',
    'router',
    'spender',
    'slippage',
    'signature',
    'rawTransaction',
    'raw_transaction',
  ];

  for (const key of forbidden) {
    assertRejected({ ...envelope(), [key]: 'attacker-controlled' });
    assertRejected(envelope({
      transfer_candidates: [{ ...envelope().transfer_candidates[0], [key]: 'attacker-controlled' }],
    }));
  }
  assertRejected({ ...envelope(), unexpected: true });
  assertRejected(envelope({ transfer_candidates: [{ ...envelope().transfer_candidates[0], unexpected: true }] }));
});

test('rejects wrong envelope shape, version, types, and more than one candidate', () => {
  const base = envelope();
  assertRejected({ ...base, schema_version: '0.2.0' });
  assertRejected({ ...base, assistant_text: 1 });
  assertRejected({ ...base, skill_refs: 'bankr' });
  assertRejected({ ...base, transfer_candidates: {} });
  assertRejected({ ...base, transfer_candidates: [base.transfer_candidates[0], base.transfer_candidates[0]] });
  assertRejected({ schema_version: '0.1.0', assistant_text: 'missing arrays' });
});

test('rejects duplicate, unknown, overlong, empty, or excessive skill references', () => {
  const selectedCatalog = frozenCatalog([
    { id: 'bankr', enabledCapabilities: ['explain', 'propose_transfer'] },
    { id: 'alpha', enabledCapabilities: ['explain'] },
    { id: 'beta', enabledCapabilities: ['explain'] },
    { id: 'gamma', enabledCapabilities: ['explain'] },
    { id: 'delta', enabledCapabilities: ['explain'] },
  ]);
  assertRejected(envelope({ skill_refs: ['bankr', 'bankr'] }), selectedCatalog);
  assertRejected(envelope({ skill_refs: ['unknown'] }), selectedCatalog);
  assertRejected(envelope({ skill_refs: [''] }), selectedCatalog);
  assertRejected(envelope({ skill_refs: ['💸'.repeat(9)] }), selectedCatalog);
  assertRejected(envelope({ skill_refs: ['bankr', 'alpha', 'beta', 'gamma', 'delta'] }), selectedCatalog);
});

test('rejects unsupported or unreferenced candidate skills', () => {
  const selectedCatalog = frozenCatalog([
    { id: 'bankr', enabledCapabilities: ['explain', 'propose_transfer'] },
    { id: 'research', enabledCapabilities: ['explain'] },
  ]);
  assertRejected(envelope({
    skill_refs: ['research'],
    transfer_candidates: [{ ...envelope().transfer_candidates[0], skill: 'research' }],
  }), selectedCatalog);
  assertRejected(envelope({ skill_refs: [], transfer_candidates: envelope().transfer_candidates }), selectedCatalog);
});

test('rejects assistant and rationale text over their UTF-8 limits', () => {
  assertRejected(envelope({ assistant_text: '💸'.repeat(1_025) }));
  assertRejected(envelope({
    transfer_candidates: [{ ...envelope().transfer_candidates[0], rationale: '💸'.repeat(129) }],
  }));
  assertRejected(envelope({
    transfer_candidates: [{ ...envelope().transfer_candidates[0], rationale: 42 }],
  }));
});

test('accepts only canonical positive uint256 decimal transfer amounts', () => {
  const maximum = ((1n << 256n) - 1n).toString(10);
  const accepted = decode(envelope({
    transfer_candidates: [{ ...envelope().transfer_candidates[0], amountBaseUnits: maximum }],
  }));
  assert.equal(accepted.transferCandidates[0].amountBaseUnits, maximum);

  for (const amountBaseUnits of [
    1,
    '',
    '0',
    '00',
    '01',
    '+1',
    '-1',
    '1.0',
    '1e3',
    '0x1',
    ' 1',
    '1 ',
    (1n << 256n).toString(10),
  ]) {
    assertRejected(envelope({
      transfer_candidates: [{ ...envelope().transfer_candidates[0], amountBaseUnits }],
    }));
  }
});

test('rejects invalid and zero recipient or contract addresses', () => {
  for (const invalidRecipient of [null, '', '0x1234', '0x0000000000000000000000000000000000000000']) {
    assertRejected(envelope({
      transfer_candidates: [{ ...envelope().transfer_candidates[0], recipient: invalidRecipient }],
    }));
  }
  for (const invalidContract of [null, '', '0x1234', '0x0000000000000000000000000000000000000000']) {
    assertRejected(envelope({
      transfer_candidates: [{
        ...envelope().transfer_candidates[0],
        assetType: 'erc20',
        assetContract: invalidContract,
      }],
    }));
  }
});

test('enforces closed native and ERC-20 asset-contract cross-field rules', () => {
  assertRejected(envelope({
    transfer_candidates: [{ ...envelope().transfer_candidates[0], assetContract: token }],
  }));
  assertRejected(envelope({
    transfer_candidates: [{ ...envelope().transfer_candidates[0], assetType: 'erc20', assetContract: null }],
  }));
  assertRejected(envelope({
    transfer_candidates: [{ ...envelope().transfer_candidates[0], assetType: 'nft' }],
  }));
});

test('requires a recursively frozen server catalog and never reads request-supplied skill descriptors', () => {
  const mutableCatalog = {
    version: 'mutable',
    skills: [{ id: 'bankr', enabledCapabilities: ['propose_transfer'] }],
  };
  assert.throws(() => decodeConsoleLlmEnvelope(JSON.stringify(envelope()), { catalog: mutableCatalog }), /frozen catalog/i);
  assert.throws(() => decodeConsoleLlmEnvelope(JSON.stringify(envelope()), {}), /frozen catalog/i);
});
