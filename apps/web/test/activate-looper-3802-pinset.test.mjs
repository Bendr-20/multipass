import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { encodeAbiParameters, keccak256 } from 'viem';

const BUILDER_PATH = new URL('../scripts/build-activate-looper-3802.mjs', import.meta.url);
const TEMPLATE_PATH = new URL('../owner-tools/activate-looper-3802/index.template.html', import.meta.url);
const PAGE_PATH = new URL('../owner-tools/activate-looper-3802/index.html', import.meta.url);
const INLINE_MARKER = '/*__ACTIVATE_LOOPER_3802_INLINE__*/';
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src https://mainnet.base.org https://base.drpc.org https://base-rpc.publicnode.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
const BUTTON_IDS = ['connect', 'activate', 'resume', 'retry', 'acknowledge'];
const IMMUTABLE_DOM_IDS = [
  'network',
  'connected-wallet',
  'sponsor',
  'holder',
  'loopers-proxy',
  'loopers-implementation',
  'registry',
  'account-implementation',
  'salt',
  'account',
  'account-deployment-state',
  'account-balance',
  'identity-id',
  'identity-uri',
  'identity-controller-status',
  'estimated-gas',
  'estimated-fee',
  'transaction-semantics',
  'status',
  'transaction',
];

const SOURCE_ROOT = new URL('../owner-tools/activate-looper-3802/src/', import.meta.url);

async function loadPinsetUnit() {
  const context = vm.createContext({ crypto: webcrypto, TextDecoder, TextEncoder, Uint8Array });
  for (const name of ['00-namespace.js', '01-pinset-encoding.js']) {
    vm.runInContext(await readFile(new URL(name, SOURCE_ROOT), 'utf8'), context, { filename: name });
  }
  return context.ActivateLooper3802;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('generated artifact equals the builder output with its sole inline marker replaced', async () => {
  const { buildExpectedHtml } = await import(BUILDER_PATH.href);
  const [template, actual] = await Promise.all([
    readFile(TEMPLATE_PATH, 'utf8'),
    readFile(PAGE_PATH),
  ]);

  assert.equal(template.split(INLINE_MARKER).length - 1, 1, 'template must contain exactly one inline marker');
  assert.equal(actual.includes(Buffer.from(INLINE_MARKER)), false, 'generated artifact must replace the inline marker');
  assert.deepEqual(actual, Buffer.from(await buildExpectedHtml(), 'utf8'));
});

test('static DOM is a noindex, closed-input activation shell', async () => {
  const html = await readFile(PAGE_PATH, 'utf8');
  const dom = new JSDOM(html);
  const { document } = dom.window;

  assert.equal(document.querySelector('meta[name="robots"]')?.content, 'noindex, nofollow, noarchive');
  assert.equal(document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content, CSP);
  assert.equal(document.querySelectorAll('script[src], link[rel="stylesheet"], iframe, object, embed').length, 0);
  assert.equal(document.scripts.length, 1);
  assert.equal(document.querySelectorAll('input, textarea, select, [contenteditable]').length, 0);
  assert.deepEqual([...document.querySelectorAll('button')].map(({ id }) => id), BUTTON_IDS);
  assert.deepEqual([...document.querySelectorAll('[data-contract-output]')].map(({ id }) => id), IMMUTABLE_DOM_IDS);

  for (const id of IMMUTABLE_DOM_IDS) {
    assert.equal(document.querySelectorAll(`#${id}`).length, 1, `expected exactly one #${id}`);
  }
  for (const id of BUTTON_IDS.slice(1)) {
    const button = document.getElementById(id);
    assert.ok(button.disabled || button.hidden, `#${id} must start disabled or hidden`);
  }
});

test('builder enforces its exact manifest, marker count, and LF output', async () => {
  const { GENERATED_BANNER, SOURCE_MANIFEST, renderActivationHtml } = await import(BUILDER_PATH.href);
  assert.deepEqual(SOURCE_MANIFEST, [
    '00-namespace.js',
    '01-pinset-encoding.js',
    '02-public-rpc-transport.js',
    '03-snapshot-validator.js',
    '04-wallet-boundary.js',
    '05-attempt-store.js',
    '06-cross-tab-coordinator.js',
    '07-receipt-trace-verifier.js',
    '08-controller-renderer.js',
    '09-bootstrap.js',
  ]);
  const sourceFiles = Object.fromEntries(SOURCE_MANIFEST.map((name) => [name, `// ${name}\r\n`]));
  const template = `<script>${INLINE_MARKER}</script>\r\n`;

  const rendered = renderActivationHtml({ template, sourceFiles });
  assert.ok(rendered.startsWith(`${GENERATED_BANNER}\n`));
  assert.equal(rendered.includes('\r'), false);
  assert.equal(rendered.includes(INLINE_MARKER), false);
  let previous = -1;
  for (const name of SOURCE_MANIFEST) {
    const position = rendered.indexOf(`// ${name}`);
    assert.ok(position > previous, `${name} must be concatenated in manifest order`);
    previous = position;
  }

  const missing = { ...sourceFiles };
  delete missing[SOURCE_MANIFEST.at(-1)];
  assert.throws(() => renderActivationHtml({ template, sourceFiles: missing }), /manifest/i);
  assert.throws(
    () => renderActivationHtml({ template, sourceFiles: { ...sourceFiles, '10-extra.js': '// no' } }),
    /manifest/i,
  );
  assert.throws(() => renderActivationHtml({ template: '<script></script>', sourceFiles }), /exactly one inline marker/i);
  assert.throws(() => renderActivationHtml({ template: `${template}${template}`, sourceFiles }), /exactly one inline marker/i);
});

test('pinset contains every approved execution identity and fixed boundary', async () => {
  const { PINSET, RPC_ORIGINS, SELECTORS, TOPICS } = await loadPinsetUnit();
  const identities = {
    loopers: ['0x1649CD37f4748807b4882FC48765bA0B2aFfa94a', 177, '0x6ea05616ee3e471f1a4890f75aebac2410a44a0beb0110821f74e6a977e59662', '0x00000000000000000000000068f22e3563891167d37c86391c4a83449c83e908'],
    loopersImplementation: ['0x68F22e3563891167D37C86391c4a83449c83e908', 23210, '0x46c2bf5bca689ba1994f06a6b85971e68392e2fc458a1ed09ff20022399644ec', null],
    registry: ['0x000000006551c19487814612e58FE06813775758', 571, '0xd7df998352f46d061e9e27c6a17d5108d7439482cb136c45e0f0733c7bd3da56', null],
    accountImplementation: ['0x1e3787bC9B2E6D7763de1DcCF10E9d062f3b43bF', 685, '0x7994cd119e7aaecf6b8d467e9152cfd0659753fa4919de19be4ff83116d92ee5', null],
    adapter: ['0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27', 163, '0xa0dc663d4134b47e77e38495310804146fac6b5ae1bc86b485be4f73314cb017', '0x0000000000000000000000000f81bd4edd4879734361a1a44460264cbf6f94c9'],
    adapterImplementation: ['0x0f81bd4EDD4879734361A1A44460264CBf6F94c9', 12732, '0x550ba6b2ab513da8e16b5b23c476c4a9f6ea87b897ba721ddae58410baf094be', null],
    identityRegistry: ['0x8004A169FB4a3325136EB29fA0ceB6D2e539a432', 130, '0xe3b1c1b4c04b34f90557a867aaef6bf2d57c5674e7a9f24994ae498ffd0f6f85', '0x0000000000000000000000007274e874ca62410a93bd8bf61c69d8045e399c02'],
    identityRegistryImplementation: ['0x7274e874CA62410a93Bd8bf61c69d8045E399c02', 14474, '0x201b7634af2de088c58868052856922ea8534c47e2837f19529460e2fafb4ff1', null],
    sponsor: ['0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE', 23, '0xe2b8058ebac7d6b7f1496596a6508894891adab1c1ef9712a4a5d50ff32e5267', '0x000000000000000000000000000100abaad02f1cfc8bbe32bd5a564817339e72'],
    sponsorDelegate: ['0x7702cb554e6bFb442cb743A7dF23154544a7176C', 3318, '0x97497b31483a21567c1c520851c6e8e65e6ce906dc9236843668a21c3cd691e3', null],
    sponsorImplementation: ['0x000100abaad02f1cfC8Bbe32bD5a564817339E72', 18002, '0xa7dba5dc36ffc7d92796b2d17cd61f4e89d7ace44ff953def7e39e444c278bfa', null],
    entryPoint: ['0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789', 23689, '0x009b0281380fb08973d2b8e55936c0d55f5a1d65ddc5713944420e119455620c', null],
  };
  for (const [name, [address, bytes, sha256, implementationSlot]] of Object.entries(identities)) {
    assert.deepEqual(plain(PINSET.identities[name]), { address, bytes, sha256, implementationSlot });
  }
  assert.deepEqual(plain({
    chainId: PINSET.chainId,
    chainIdHex: PINSET.chainIdHex,
    tokenId: PINSET.tokenId,
    holder: PINSET.holder,
    account: PINSET.account,
    salt: PINSET.salt,
    identityId: PINSET.identityId,
    identityIdHex: PINSET.identityIdHex,
    identityUri: PINSET.identityUri,
    sponsorDesignator: PINSET.sponsorDesignator,
    eip1967Slot: PINSET.eip1967Slot,
    storageKey: PINSET.storageKey,
    lockName: PINSET.lockName,
    gasCap: PINSET.gasCap,
  }), {
    chainId: 8453,
    chainIdHex: '0x2105',
    tokenId: '3802',
    holder: '0x17d7DfA154dc0828AdE4115B9EB8a0A91C0fbDe4',
    account: '0x88a30C57f5780F1a8112E6b486b5bFBe89Ac9a38',
    salt: '0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee',
    identityId: '90994',
    identityIdHex: '0x16372',
    identityUri: 'https://arweave.net/wC0L6LR_IGsS_SgAQFrSbnzsjVgAbOlwZcV_lbrp_v8/3802.json',
    sponsorDesignator: '0xef01007702cb554e6bfb442cb743a7df23154544a7176c',
    eip1967Slot: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
    storageKey: 'loopers.walletActivation.8453.3802.v1',
    lockName: 'loopers.walletActivation.8453.3802.submit.v1',
    gasCap: 150000,
  });
  assert.deepEqual(plain(RPC_ORIGINS), [
    'https://mainnet.base.org',
    'https://base.drpc.org',
    'https://base-rpc.publicnode.com',
  ]);
  assert.equal(TOPICS.erc6551AccountCreated, '0x79f19b3655ee38b1ce526556b7731a20c8f218fbda4a3990b6cc4172fdf88722');
  assert.equal(TOPICS.userOperationEvent, '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f');
  assert.deepEqual(plain(SELECTORS), {
    owner: '0x8da5cb5b', ownerOf: '0x6352211e', erc6551Registry: '0x056d5afe',
    erc6551Implementation: '0xb3dd12a2', erc6551Salt: '0x0df783f8', tokenBoundAccount: '0x0be76ed6',
    registryAccount: '0x246a0021', erc8004BoundByLooper: '0x5adbbdce', erc8004AgentIdByLooper: '0x4c4a2696',
    erc8004AgentURI: '0xf195e791', identityRegistry: '0x134e18f4', bindingOf: '0x4d69ebc2',
    isController: '0x158e711d', tokenURI: '0xc87b56dd', sponsorImplementation: '0x5c60da1b',
    sponsorEntryPoint: '0xb0d691fe', accountToken: '0xfc0c546a', accountOwner: '0x8da5cb5b',
    accountState: '0xc19d93fb', accountIsValidSigner: '0x523e3260', execute: '0xb61d27f6',
    executeBatch: '0x34fcd5be', executeWithoutChainIdValidation: '0x2c2abd1e', handleOps: '0x1fad948c',
    getUserOpHash: '0xa6193531', createAccount: '0x8a54c52f',
  });
  assert.ok(Object.isFrozen(PINSET));
  assert.ok(Object.isFrozen(PINSET.identities));
});

test('pinset preserves every exact raw call fixture before decoding', async () => {
  const { CALLS } = await loadPinsetUnit();
  const uint3802 = '0000000000000000000000000000000000000000000000000000000000000eda';
  const uriResult = '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000004968747470733a2f2f617277656176652e6e65742f7743304c364c525f494773535f53674151467253626e7a736a566741624f6c775a63565f6c6272705f76382f333830322e6a736f6e0000000000000000000000000000000000000000000000';
  assert.equal(CALLS.loopersOwner.calldata, '0x8da5cb5b');
  assert.equal(CALLS.loopersOwner.result, '0x000000000000000000000000709d8d528d2c0c8a408107e74b38a01fa14e44ae');
  assert.equal(CALLS.loopersRegistry.result, '0x000000000000000000000000000000006551c19487814612e58fe06813775758');
  assert.equal(CALLS.loopersAccountImplementation.result, '0x0000000000000000000000001e3787bc9b2e6d7763de1dccf10e9d062f3b43bf');
  assert.equal(CALLS.loopersSalt.result, '0xff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee');
  assert.equal(CALLS.loopersOwnerOf.calldata, `0x6352211e${uint3802}`);
  assert.equal(CALLS.loopersOwnerOf.result, '0x00000000000000000000000017d7dfa154dc0828ade4115b9eb8a0a91c0fbde4');
  assert.equal(CALLS.loopersTokenBoundAccount.result, '0x00000000000000000000000088a30c57f5780f1a8112e6b486b5bfbe89ac9a38');
  assert.equal(CALLS.registryAccount.result, CALLS.loopersTokenBoundAccount.result);
  assert.equal(CALLS.loopersBound.result, `0x${'0'.repeat(63)}1`);
  assert.equal(CALLS.loopersIdentityId.result, `0x${'0'.repeat(59)}16372`);
  assert.equal(CALLS.loopersIdentityUri.result, uriResult);
  assert.equal(CALLS.adapterIdentityRegistry.result, '0x0000000000000000000000008004a169fb4a3325136eb29fa0ceb6d2e539a432');
  assert.equal(CALLS.adapterBinding.result, '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000001649cd37f4748807b4882fc48765ba0b2affa94a0000000000000000000000000000000000000000000000000000000000000eda');
  assert.equal(CALLS.adapterController.result, `0x${'0'.repeat(63)}1`);
  assert.equal(CALLS.identityOwner.result, '0x000000000000000000000000270d25d2c59a8bca1b0f40ad95ff7806c0025c27');
  assert.equal(CALLS.identityTokenUri.result, uriResult);
  assert.equal(CALLS.sponsorImplementation.result, '0x000000000000000000000000000100abaad02f1cfc8bbe32bd5a564817339e72');
  assert.equal(CALLS.sponsorEntryPoint.result, '0x0000000000000000000000005ff137d4b0fdcd49dca30c7cf57e578a026d2789');
  assert.ok(Object.values(CALLS).every(Object.isFrozen));
});

test('exact activation calldata runtime hashes and transaction are pinned', async () => {
  const unit = await loadPinsetUnit();
  const expectedCalldata = '0x8a54c52f0000000000000000000000001e3787bc9b2e6d7763de1dccf10e9d062f3b43bfff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee00000000000000000000000000000000000000000000000000000000000021050000000000000000000000001649cd37f4748807b4882fc48765ba0b2affa94a0000000000000000000000000000000000000000000000000000000000000eda';
  const expectedRuntime = '0x363d3d373d3d3d363d731e3787bc9b2e6d7763de1dccf10e9d062f3b43bf5af43d82803e903d91602b57fd5bf3ff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee00000000000000000000000000000000000000000000000000000000000021050000000000000000000000001649cd37f4748807b4882fc48765ba0b2affa94a0000000000000000000000000000000000000000000000000000000000000eda';
  assert.equal(unit.EXACT_CALLDATA, expectedCalldata);
  assert.equal(unit.EXACT_CALLDATA_HASH, '0xa6b969253d21114fb839051bbdff1b46a66a0427e181eabee4bf0dd1ccf02def');
  assert.equal(unit.EXPECTED_ACCOUNT_RUNTIME, expectedRuntime);
  assert.equal((expectedRuntime.length - 2) / 2, 173);
  assert.equal(unit.EXPECTED_ACCOUNT_RUNTIME_SHA256, '0xf711d4661ab10b810b9409543a1e219774af23f67f8f7f0a3db6d6545d4f3b8a');
  assert.equal(await unit.sha256Hex(expectedRuntime), unit.EXPECTED_ACCOUNT_RUNTIME_SHA256);
  assert.equal(await unit.sha256Hex(expectedCalldata), '0xa42579ef68c4872f9c08ed5b67e9875c230fde1b0808a3df7401fe3ed65a19e8');
  assert.deepEqual(Object.keys(unit.EXACT_TRANSACTION), ['chainId', 'from', 'to', 'data', 'value']);
  assert.deepEqual(plain(unit.EXACT_TRANSACTION), {
    chainId: '0x2105',
    from: '0x709D8d528D2c0C8A408107E74b38a01Fa14e44aE',
    to: '0x000000006551c19487814612e58FE06813775758',
    data: expectedCalldata,
    value: '0x0',
  });
  assert.equal(unit.validateExactTransaction(unit.EXACT_TRANSACTION), true);
  for (const key of Object.keys(unit.EXACT_TRANSACTION)) {
    assert.throws(() => unit.validateExactTransaction({ ...unit.EXACT_TRANSACTION, [key]: key === 'value' ? '0x1' : '0x00' }), /transaction/i);
  }
  for (const key of ['gas', 'gasPrice', 'maxFeePerGas', 'maxPriorityFeePerGas', 'nonce', 'accessList']) {
    assert.throws(() => unit.validateExactTransaction({ ...unit.EXACT_TRANSACTION, [key]: '0x0' }), /transaction/i);
  }
});

test('strict ABI and canonical hex codecs reject malformed representations', async () => {
  const unit = await loadPinsetUnit();
  assert.equal(unit.canonicalQuantity(0n), '0x0');
  assert.equal(unit.canonicalQuantity(8453n), '0x2105');
  assert.equal(unit.decodeUint256(`0x${'0'.repeat(60)}2105`), 8453n);
  assert.equal(unit.decodeAddress('0x00000000000000000000000017d7dfa154dc0828ade4115b9eb8a0a91c0fbde4'), '0x17d7dfa154dc0828ade4115b9eb8a0a91c0fbde4');
  assert.equal(unit.decodeBool(`0x${'0'.repeat(63)}1`), true);
  assert.equal(unit.decodeString((await loadPinsetUnit()).CALLS.identityTokenUri.result), unit.PINSET.identityUri);
  assert.deepEqual(plain(unit.decodeBinding(unit.CALLS.adapterBinding.result)), {
    standard: 0,
    tokenContract: '0x1649cd37f4748807b4882fc48765ba0b2affa94a',
    tokenId: '3802',
  });
  for (const malformed of ['0X00', '0x0', '0xGG', '0xAa', '00']) assert.throws(() => unit.hexToBytes(malformed), /hex/i);
  for (const malformed of ['0x00', '0x01', '0x01a', '0X1', '1']) assert.throws(() => unit.parseQuantity(malformed), /quantity/i);
  assert.equal(unit.parseQuantity('0x0'), 0n);
  assert.equal(unit.parseQuantity('0x1a'), 26n);
  assert.throws(() => unit.decodeAddress(`0x01${'0'.repeat(62)}`), /address/i);
  assert.throws(() => unit.decodeAddress('0x00'), /length/i);
  assert.throws(() => unit.decodeBool(`0x${'0'.repeat(62)}02`), /bool/i);
  assert.throws(() => unit.decodeBool(`0x${'0'.repeat(63)}1aa`), /length|hex/i);
  const validString = unit.CALLS.identityTokenUri.result;
  assert.throws(() => unit.decodeString(`${validString}00`), /trailing|length|padding/i);
  assert.throws(() => unit.decodeString(`0x${'0'.repeat(62)}40${validString.slice(66)}`), /offset/i);
  assert.throws(() => unit.decodeString(validString.slice(0, -2)), /length|padding|trunc/i);
  assert.throws(() => unit.decodeString(`${validString.slice(0, -2)}01`), /padding/i);
});

test('Keccak vectors match the independent viem oracle', async () => {
  const { keccak256Hex } = await loadPinsetUnit();
  const vectors = [
    '0x',
    '0x616263',
    '0x8a54c52f0000000000000000000000001e3787bc9b2e6d7763de1dccf10e9d062f3b43bfff28549509272e76f1d1c6ef7d6976d848c5ff6cb5068b2183c8d52f4cbe2bee00000000000000000000000000000000000000000000000000000000000021050000000000000000000000001649cd37f4748807b4882fc48765ba0b2affa94a0000000000000000000000000000000000000000000000000000000000000eda',
    ...Array.from({ length: 12 }, (_, length) => `0x${Array.from({ length: length * 17 + 1 }, (__, index) => ((index * 37 + length * 11) & 255).toString(16).padStart(2, '0')).join('')}`),
  ];
  for (const vector of vectors) assert.equal(keccak256Hex(vector), keccak256(vector));
});

test('UserOperation v0.6 hashing matches viem and its hard-coded fixture', async () => {
  const { hashUserOperationV06, PINSET } = await loadPinsetUnit();
  const operation = {
    sender: PINSET.identities.sponsor.address,
    nonce: 7n,
    initCode: '0x1234',
    callData: '0xb61d27f6deadbeef',
    callGasLimit: 123456n,
    verificationGasLimit: 234567n,
    preVerificationGas: 34567n,
    maxFeePerGas: 456789n,
    maxPriorityFeePerGas: 56789n,
    paymasterAndData: '0xaabbcc',
  };
  const packed = encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bytes32' }],
    [operation.sender, operation.nonce, keccak256(operation.initCode), keccak256(operation.callData), operation.callGasLimit, operation.verificationGasLimit, operation.preVerificationGas, operation.maxFeePerGas, operation.maxPriorityFeePerGas, keccak256(operation.paymasterAndData)],
  );
  const oracle = keccak256(encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }],
    [keccak256(packed), PINSET.identities.entryPoint.address, 8453n],
  ));
  assert.equal(oracle, '0xc13627d3786d808fe3f8d32da5631a4b1dfa79e03d3798bfbdaa4dc0a34e8bcb');
  assert.equal(hashUserOperationV06(operation), oracle);
  assert.throws(() => hashUserOperationV06({ ...operation, extra: 1n }), /UserOperation/i);
  assert.throws(() => hashUserOperationV06({ ...operation, initCode: '0x0' }), /hex/i);
});
