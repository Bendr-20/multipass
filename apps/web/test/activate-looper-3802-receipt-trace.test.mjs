import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeFunctionData } from 'viem';
import { loadActivationUnits } from './activate-looper-3802-fixture.mjs';

async function unit() { return loadActivationUnits(['00-namespace.js','01-pinset-encoding.js','07-receipt-trace-verifier.js']); }
const word = (value) => BigInt(value).toString(16).padStart(64, '0');
const addressTopic = (address) => `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;

function registryLog(ns, index = 0) { return { address: ns.PINSET.identities.registry.address, logIndex: `0x${index.toString(16)}`, topics: [ns.TOPICS.erc6551AccountCreated, addressTopic(ns.PINSET.identities.accountImplementation.address), addressTopic(ns.PINSET.identities.loopers.address), `0x${word(ns.PINSET.tokenId)}`], data: `0x${ns.addressWord(ns.PINSET.account)}${ns.PINSET.salt.slice(2)}${word(ns.PINSET.chainId)}` }; }
function postState(ns, overrides = {}) { return { blockNumber: 16, blockHash: `0x${'cd'.repeat(32)}`, accountCode: ns.EXPECTED_ACCOUNT_RUNTIME, accountBalance: '0x0', tokenResult: `0x${word(ns.PINSET.chainId)}${ns.addressWord(ns.PINSET.identities.loopers.address)}${word(ns.PINSET.tokenId)}`, ownerResult: `0x${ns.addressWord(ns.PINSET.holder)}`, stateResult: `0x${word(0)}`, validSignerResult: ns.SELECTORS.accountIsValidSigner, invariantsValid: true, ...overrides }; }
function revertedState(overrides = {}) { return { blockNumber: 16, blockHash: `0x${'cd'.repeat(32)}`, accountCode: '0x', accountBalance: '0x0', invariantsValid: true, ...overrides }; }

test('direct transaction requires exact envelope event and canonical post-state', async () => {
  const ns = await unit(); const hash = `0x${'ab'.repeat(32)}`; const log = registryLog(ns);
  const transaction = { hash, chainId: '0x2105', from: ns.PINSET.identities.sponsor.address, to: ns.PINSET.identities.registry.address, input: ns.EXACT_CALLDATA, value: '0x0', blockNumber: '0x10', blockHash: `0x${'cd'.repeat(32)}`, transactionIndex: '0x0' };
  const receipt = { transactionHash: hash, status: '0x1', blockNumber: transaction.blockNumber, blockHash: transaction.blockHash, transactionIndex: transaction.transactionIndex, logs: [log] };
  const result = await ns.verifyReceiptEvidence({ requestedHash: hash, transaction, receipt, postState: postState(ns) });
  assert.equal(result.classification, 'confirmed_attributed'); assert.equal(result.registryLog.receiptArrayIndex, 0); assert.equal(result.registryLog.logIndex, '0x0');
  assert.equal((await ns.verifyReceiptEvidence({ requestedHash: hash, transaction: { ...transaction, input: '0x' }, receipt, postState: postState(ns) })).classification, 'observed_unattributed');
  assert.equal((await ns.verifyReceiptEvidence({ requestedHash: hash, transaction, receipt: { ...receipt, logs: [log, { ...log, logIndex: '0x1' }] }, postState: postState(ns) })).classification, 'observed_unattributed');
});

test('valid deployed post-state without attributable receipt is observed_unattributed', async () => {
  const ns = await unit(); const hash = `0x${'ab'.repeat(32)}`;
  const transaction = { hash, chainId: '0x2105', from: ns.PINSET.identities.sponsor.address, to: ns.PINSET.identities.registry.address, input: '0x', value: '0x0', blockNumber: '0x10', blockHash: `0x${'cd'.repeat(32)}`, transactionIndex: '0x0' };
  const receipt = { transactionHash: hash, status: '0x1', blockNumber: transaction.blockNumber, blockHash: transaction.blockHash, transactionIndex: transaction.transactionIndex, logs: [] };
  const result = await ns.verifyReceiptEvidence({ requestedHash: hash, transaction, receipt, postState: postState(ns) }); assert.equal(result.classification, 'observed_unattributed');
});

test('reverted receipt is terminal only with full canonical undeployed state', async () => {
  const ns = await unit(); const hash = `0x${'ab'.repeat(32)}`;
  const transaction = { hash, chainId: '0x2105', from: ns.PINSET.identities.sponsor.address, to: ns.PINSET.identities.registry.address, input: ns.EXACT_CALLDATA, value: '0x0', blockNumber: '0x10', blockHash: `0x${'cd'.repeat(32)}`, transactionIndex: '0x0' };
  const receipt = { transactionHash: hash, status: '0x0', blockNumber: transaction.blockNumber, blockHash: transaction.blockHash, transactionIndex: transaction.transactionIndex, logs: [] };
  assert.equal((await ns.verifyReceiptEvidence({ requestedHash: hash, transaction, receipt, postState: null, revertedState: revertedState() })).classification, 'reverted');
  assert.equal((await ns.verifyReceiptEvidence({ requestedHash: hash, transaction, receipt, postState: postState(ns), revertedState: null })).classification, 'observed_unattributed');
  assert.equal((await ns.verifyReceiptEvidence({ requestedHash: hash, transaction, receipt, postState: null, revertedState: revertedState({ invariantsValid: false }) })).classification, 'uncertain_hashed');
});

test('wrapped handleOps decoding selects exact v0.6 operation and rejects replayable wallet selector', async () => {
  const ns = await unit();
  const operation = { sender: ns.PINSET.identities.sponsor.address, nonce: 7n, initCode: '0x', callData: '0x1234', callGasLimit: 100000n, verificationGasLimit: 90000n, preVerificationGas: 21000n, maxFeePerGas: 2n, maxPriorityFeePerGas: 1n, paymasterAndData: '0x', signature: '0x123456' };
  const abi = [{ type: 'function', name: 'handleOps', stateMutability: 'nonpayable', inputs: [{ name: 'ops', type: 'tuple[]', components: [{name:'sender',type:'address'},{name:'nonce',type:'uint256'},{name:'initCode',type:'bytes'},{name:'callData',type:'bytes'},{name:'callGasLimit',type:'uint256'},{name:'verificationGasLimit',type:'uint256'},{name:'preVerificationGas',type:'uint256'},{name:'maxFeePerGas',type:'uint256'},{name:'maxPriorityFeePerGas',type:'uint256'},{name:'paymasterAndData',type:'bytes'},{name:'signature',type:'bytes'}]},{name:'beneficiary',type:'address'}], outputs: [] }];
  const input = encodeFunctionData({ abi, functionName: 'handleOps', args: [[operation], ns.PINSET.holder] });
  const decoded = ns.decodeHandleOps(input); assert.equal(decoded.operations.length, 1); assert.equal(decoded.operations[0].nonce, 7n); assert.equal(decoded.operations[0].callData, '0x1234');
  assert.throws(() => ns.decodeWalletEnvelope(`${ns.SELECTORS.executeWithoutChainIdValidation}${'00'.repeat(64)}`), /replayable|forbidden/i);
});

test('trace receipt ordinal remains distinct from block-global logIndex', async () => {
  const ns = await unit(); const log = registryLog(ns, 7); const decoded = ns.decodeRegistryLog(log, 0); assert.equal(decoded.receiptArrayIndex, 0); assert.equal(decoded.logIndex, '0x7');
  assert.throws(() => ns.decodeRegistryLog({ ...log, logIndex: '0x00' }, 0), /indices|quantity/i);
});

test('UserOperationEvent must be emitted by EntryPoint and trace plumbing is zero-value successful delegation only', async () => {
  const ns = await unit();
  const operation = { sender: ns.PINSET.identities.sponsor.address.toLowerCase(), nonce: 1n };
  const userOpHash = `0x${'44'.repeat(32)}`;
  const event = { address: ns.PINSET.identities.entryPoint.address, logIndex: '0x0', topics: [ns.TOPICS.userOperationEvent, userOpHash, addressTopic(operation.sender), addressTopic('0x0000000000000000000000000000000000000000')], data: `0x${word(1)}${word(1)}${word(0)}${word(0)}` };
  assert.doesNotThrow(() => ns.decodeUserOperationEvent({ logs: [event] }, operation, userOpHash));
  assert.throws(() => ns.decodeUserOperationEvent({ logs: [{ ...event, address: ns.PINSET.identities.registry.address }] }, operation, userOpHash), /EntryPoint|event/i);

  const receiptLog = registryLog(ns, 9);
  const selected = { type: 'CALL', from: ns.PINSET.identities.entryPoint.address, to: ns.PINSET.identities.sponsor.address, input: '0x1234', value: '0x0', calls: [{ type: 'DELEGATECALL', from: ns.PINSET.identities.sponsor.address, to: ns.PINSET.identities.sponsorImplementation.address, input: '0x1234', value: '0x0', calls: [{ type: 'CALL', from: ns.PINSET.identities.sponsorImplementation.address, to: ns.PINSET.identities.registry.address, input: ns.EXACT_CALLDATA, value: '0x0', logs: [{ ...receiptLog, index: 0 }] }] }] };
  const trace = { from: ns.PINSET.holder, to: ns.PINSET.identities.entryPoint.address, input: '0xfeed', value: '0x0', type: 'CALL', calls: [selected] };
  assert.equal(ns.findTraceAttribution(trace, '0x1234', { logs: [receiptLog] }).receiptArrayIndex, 0);
  const bad = structuredClone(trace); bad.calls[0].calls[0].value = '0x1';
  assert.throws(() => ns.findTraceAttribution(bad, '0x1234', { logs: [receiptLog] }), /zero|value|plumbing/i);
});

test('wallet envelope accepts only one zero-value exact registry activation call', async () => {
  const ns = await unit();
  const executeAbi = [{ type: 'function', name: 'execute', stateMutability: 'payable', inputs: [{name:'dest',type:'address'},{name:'value',type:'uint256'},{name:'func',type:'bytes'}], outputs: [] }];
  const exact = encodeFunctionData({ abi: executeAbi, functionName: 'execute', args: [ns.PINSET.identities.registry.address, 0n, ns.EXACT_CALLDATA] });
  const decoded = ns.decodeWalletEnvelope(exact);
  assert.equal(decoded.value, 0n); assert.equal(decoded.data, ns.EXACT_CALLDATA);
  const wrongValue = encodeFunctionData({ abi: executeAbi, functionName: 'execute', args: [ns.PINSET.identities.registry.address, 1n, ns.EXACT_CALLDATA] });
  assert.throws(() => ns.decodeWalletEnvelope(wrongValue), /outside|pinned/i);
  const wrongTarget = encodeFunctionData({ abi: executeAbi, functionName: 'execute', args: [ns.PINSET.identities.loopers.address, 0n, ns.EXACT_CALLDATA] });
  assert.throws(() => ns.decodeWalletEnvelope(wrongTarget), /outside|pinned/i);
  assert.throws(() => ns.decodeWalletEnvelope(`${exact}00`), /trailing/i);
});

test('encodes the selected v0.6 tuple for the exact onchain getUserOpHash call', async () => {
  const ns = await unit();
  const operation = { sender: ns.PINSET.identities.sponsor.address, nonce: 9n, initCode: '0x1234', callData: '0xabcd', callGasLimit: 100n, verificationGasLimit: 200n, preVerificationGas: 300n, maxFeePerGas: 400n, maxPriorityFeePerGas: 500n, paymasterAndData: '0xcafe' };
  const signature = '0xdeadbeef';
  const abi = [{ type: 'function', name: 'getUserOpHash', stateMutability: 'view', inputs: [{ name: 'userOp', type: 'tuple', components: [{name:'sender',type:'address'},{name:'nonce',type:'uint256'},{name:'initCode',type:'bytes'},{name:'callData',type:'bytes'},{name:'callGasLimit',type:'uint256'},{name:'verificationGasLimit',type:'uint256'},{name:'preVerificationGas',type:'uint256'},{name:'maxFeePerGas',type:'uint256'},{name:'maxPriorityFeePerGas',type:'uint256'},{name:'paymasterAndData',type:'bytes'},{name:'signature',type:'bytes'}]}], outputs: [{type:'bytes32'}] }];
  const oracle = encodeFunctionData({ abi, functionName: 'getUserOpHash', args: [{ ...operation, signature }] });
  assert.equal(ns.encodeGetUserOpHashCall(operation, signature), oracle);
});
