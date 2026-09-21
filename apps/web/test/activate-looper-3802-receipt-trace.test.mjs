import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeFunctionData } from 'viem';
import { loadActivationUnits } from './activate-looper-3802-fixture.mjs';

async function unit() { return loadActivationUnits(['00-namespace.js','01-pinset-encoding.js','07-receipt-trace-verifier.js']); }
const word = (value) => BigInt(value).toString(16).padStart(64, '0');
const addressTopic = (address) => `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;

function registryLog(ns, index = 0) { return { address: ns.PINSET.identities.registry.address, logIndex: `0x${index.toString(16)}`, topics: [ns.TOPICS.erc6551AccountCreated, addressTopic(ns.PINSET.identities.accountImplementation.address), addressTopic(ns.PINSET.identities.loopers.address), `0x${word(ns.PINSET.tokenId)}`], data: `0x${ns.addressWord(ns.PINSET.account)}${ns.PINSET.salt.slice(2)}${word(ns.PINSET.chainId)}` }; }
function postState(ns, overrides = {}) { return { accountCode: ns.EXPECTED_ACCOUNT_RUNTIME, accountBalance: '0x0', tokenResult: `0x${word(ns.PINSET.chainId)}${ns.addressWord(ns.PINSET.identities.loopers.address)}${word(ns.PINSET.tokenId)}`, ownerResult: `0x${ns.addressWord(ns.PINSET.holder)}`, stateResult: `0x${word(0)}`, validSignerResult: ns.SELECTORS.accountIsValidSigner, invariantsValid: true, ...overrides }; }

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

test('reverted receipt is terminal only while exact account remains undeployed', async () => {
  const ns = await unit(); const hash = `0x${'ab'.repeat(32)}`;
  const transaction = { hash, chainId: '0x2105', from: ns.PINSET.identities.sponsor.address, to: ns.PINSET.identities.registry.address, input: ns.EXACT_CALLDATA, value: '0x0', blockNumber: '0x10', blockHash: `0x${'cd'.repeat(32)}`, transactionIndex: '0x0' };
  const receipt = { transactionHash: hash, status: '0x0', blockNumber: transaction.blockNumber, blockHash: transaction.blockHash, transactionIndex: transaction.transactionIndex, logs: [] };
  assert.equal((await ns.verifyReceiptEvidence({ requestedHash: hash, transaction, receipt, postState: { ...postState(ns), accountCode: '0x', tokenResult: '0x' } })).classification, 'reverted');
  assert.equal((await ns.verifyReceiptEvidence({ requestedHash: hash, transaction, receipt, postState: postState(ns) })).classification, 'observed_unattributed');
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
