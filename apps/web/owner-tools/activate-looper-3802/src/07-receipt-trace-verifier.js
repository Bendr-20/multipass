'use strict';

(() => {
  const ns = globalThis.ActivateLooper3802;
  const WORD = 64;
  const HASH = /^0x[0-9a-f]{64}$/u;
  const QUANTITY = /^(?:0x0|0x[1-9a-f][0-9a-f]*)$/u;
  const lower = (value) => typeof value === 'string' ? value.toLowerCase() : value;
  const sameAddress = (a, b) => lower(a) === lower(b);
  const strip = (hex) => { ns.hexToBytes(hex); return hex.slice(2); };
  function word(hex, index) { const body = strip(hex); const start = index * WORD; if (start + WORD > body.length) throw new Error('ABI word is truncated.'); return `0x${body.slice(start, start + WORD)}`; }
  function safeNumber(value, label) { const n = ns.decodeUint256(value); if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} is unsafe.`); return Number(n); }
  function decodeDynamicBytes(bodyHex, baseByte, offsetWord, label) {
    const body = strip(bodyHex); const offset = safeNumber(offsetWord, `${label} offset`); if (offset % 32 !== 0) throw new Error(`${label} offset is unaligned.`);
    const lengthPosition = (baseByte + offset) * 2; if (lengthPosition + WORD > body.length) throw new Error(`${label} offset is out of bounds.`);
    const length = safeNumber(`0x${body.slice(lengthPosition, lengthPosition + WORD)}`, `${label} length`); const dataStart = lengthPosition + WORD; const padded = Math.ceil(length / 32) * 64; const end = dataStart + padded;
    if (end > body.length) throw new Error(`${label} is truncated.`); if (!/^0*$/u.test(body.slice(dataStart + length * 2, end))) throw new Error(`${label} padding is nonzero.`);
    return { value: `0x${body.slice(dataStart, dataStart + length * 2)}`, endByte: end / 2 };
  }

  function decodeUserOperationTuple(fullHex, tupleByte) {
    const body = strip(fullHex); const start = tupleByte * 2; if (start + 11 * WORD > body.length) throw new Error('UserOperation tuple is truncated.');
    const get = (index) => `0x${body.slice(start + index * WORD, start + (index + 1) * WORD)}`;
    const dynamic = [[2,'initCode'],[3,'callData'],[9,'paymasterAndData'],[10,'signature']];
    const decoded = Object.create(null); let expectedOffset = 11 * 32; let endByte = tupleByte + expectedOffset;
    for (const [index, label] of dynamic) {
      if (safeNumber(get(index), `${label} offset`) !== expectedOffset) throw new Error(`${label} offset is noncanonical or overlapping.`);
      decoded[label] = decodeDynamicBytes(fullHex, tupleByte, get(index), label); endByte = decoded[label].endByte; expectedOffset = endByte - tupleByte;
    }
    return { operation: ns.deepFreeze({ sender: ns.decodeAddress(get(0)), nonce: ns.decodeUint256(get(1)), initCode: decoded.initCode.value, callData: decoded.callData.value, callGasLimit: ns.decodeUint256(get(4)), verificationGasLimit: ns.decodeUint256(get(5)), preVerificationGas: ns.decodeUint256(get(6)), maxFeePerGas: ns.decodeUint256(get(7)), maxPriorityFeePerGas: ns.decodeUint256(get(8)), paymasterAndData: decoded.paymasterAndData.value }), signature: decoded.signature.value, endByte };
  }
  function decodeHandleOps(input) {
    if (!input.startsWith(ns.SELECTORS.handleOps)) throw new Error('Top-level selector is not handleOps.');
    const args = `0x${input.slice(10)}`; const body = strip(args); if (body.length < 2 * WORD) throw new Error('handleOps head is truncated.');
    const arrayOffset = safeNumber(word(args, 0), 'UserOperation array offset'); if (arrayOffset !== 64) throw new Error('UserOperation array offset is noncanonical.'); const beneficiary = ns.decodeAddress(word(args, 1));
    const lengthWordAt = arrayOffset * 2; const count = safeNumber(`0x${body.slice(lengthWordAt, lengthWordAt + WORD)}`, 'UserOperation count'); if (count > 32) throw new Error('UserOperation count exceeds bound.');
    const offsetBaseByte = arrayOffset + 32; const offsetsStart = offsetBaseByte * 2; if (offsetsStart + count * WORD > body.length) throw new Error('UserOperation offsets are truncated.');
    const operations = []; const signatures = []; let endByte = offsetBaseByte + count * 32; let expectedRelative = count * 32;
    for (let index = 0; index < count; index += 1) {
      const relative = safeNumber(`0x${body.slice(offsetsStart + index * WORD, offsetsStart + (index + 1) * WORD)}`, 'UserOperation tuple offset'); if (relative !== expectedRelative) throw new Error('UserOperation tuple offsets are noncanonical or overlapping.');
      const decoded = decodeUserOperationTuple(args, offsetBaseByte + relative); operations.push(decoded.operation); signatures.push(decoded.signature); endByte = decoded.endByte; expectedRelative = endByte - offsetBaseByte;
    }
    if (endByte * 2 !== body.length) throw new Error('handleOps has trailing or overlapping bytes.'); return ns.deepFreeze({ operations, signatures, beneficiary });
  }

  function encodeDynamicBytes(value) {
    const body = strip(value); const length = body.length / 2; return `${ns.uint256Word(length)}${body.padEnd(Math.ceil(length / 32) * 64, '0')}`;
  }
  function encodeGetUserOpHashCall(operation, signature) {
    const dynamics = [operation.initCode, operation.callData, operation.paymasterAndData, signature]; let offset = 11 * 32; const tails = []; const offsets = [];
    for (const value of dynamics) { const encoded = encodeDynamicBytes(value); offsets.push(offset); tails.push(encoded); offset += encoded.length / 2; }
    const tuple = `${ns.addressWord(operation.sender)}${ns.uint256Word(operation.nonce)}${ns.uint256Word(offsets[0])}${ns.uint256Word(offsets[1])}${ns.uint256Word(operation.callGasLimit)}${ns.uint256Word(operation.verificationGasLimit)}${ns.uint256Word(operation.preVerificationGas)}${ns.uint256Word(operation.maxFeePerGas)}${ns.uint256Word(operation.maxPriorityFeePerGas)}${ns.uint256Word(offsets[2])}${ns.uint256Word(offsets[3])}${tails.join('')}`;
    return `${ns.SELECTORS.getUserOpHash}${ns.uint256Word(32)}${tuple}`;
  }

  function decodeExecute(callData) {
    if (!callData.startsWith(ns.SELECTORS.execute)) throw new Error('Wallet call is not execute.'); const args = `0x${callData.slice(10)}`;
    if (ns.hexToBytes(args).length < 96) throw new Error('execute is truncated.'); const target = ns.decodeAddress(word(args, 0)); const value = ns.decodeUint256(word(args, 1)); const data = decodeDynamicBytes(args, 0, word(args, 2), 'execute data');
    if (data.endByte !== ns.hexToBytes(args).length || safeNumber(word(args, 2), 'execute data offset') !== 96) throw new Error('execute has trailing bytes or noncanonical offset.');
    return ns.deepFreeze({ target, value, data: data.value });
  }
  function decodeExecuteBatch(callData) {
    if (!callData.startsWith(ns.SELECTORS.executeBatch)) throw new Error('Wallet call is not executeBatch.'); const args = `0x${callData.slice(10)}`; if (safeNumber(word(args, 0), 'batch offset') !== 32) throw new Error('Batch offset is noncanonical.');
    const body = strip(args); const count = safeNumber(`0x${body.slice(64, 128)}`, 'batch count'); if (count !== 1) throw new Error('Batch must contain exactly one call.'); const relative = safeNumber(`0x${body.slice(128, 192)}`, 'batch tuple offset'); if (relative !== 32) throw new Error('Batch tuple offset is noncanonical.'); const tupleByte = 64 + relative; const startWord = tupleByte / 32;
    const target = ns.decodeAddress(word(args, startWord)); const value = ns.decodeUint256(word(args, startWord + 1)); const data = decodeDynamicBytes(args, tupleByte, word(args, startWord + 2), 'batch data'); if (data.endByte !== ns.hexToBytes(args).length) throw new Error('Batch has trailing bytes.'); return ns.deepFreeze({ target, value, data: data.value });
  }
  function decodeWalletEnvelope(callData) {
    if (callData.startsWith(ns.SELECTORS.executeWithoutChainIdValidation)) throw new Error('Replayable wallet execution is forbidden.');
    const decoded = callData.startsWith(ns.SELECTORS.executeBatch) ? decodeExecuteBatch(callData) : decodeExecute(callData);
    if (!sameAddress(decoded.target, ns.PINSET.identities.registry.address) || decoded.value !== 0n || decoded.data !== ns.EXACT_CALLDATA) throw new Error('Wallet envelope is outside the pinned activation call.'); return decoded;
  }

  function decodeRegistryLog(log, receiptIndex) {
    if (!log || !sameAddress(log.address, ns.PINSET.identities.registry.address) || !Array.isArray(log.topics) || log.topics.length !== 4 || log.topics[0] !== ns.TOPICS.erc6551AccountCreated) throw new Error('Registry event shape mismatch.');
    if (!QUANTITY.test(log.logIndex) || !Number.isInteger(receiptIndex) || receiptIndex < 0) throw new Error('Registry event indices are invalid.');
    const implementation = ns.decodeAddress(log.topics[1]); const tokenContract = ns.decodeAddress(log.topics[2]); const tokenId = ns.decodeUint256(log.topics[3]); const data = log.data;
    if (ns.hexToBytes(data).length !== 96) throw new Error('Registry event data length mismatch.'); const account = ns.decodeAddress(word(data, 0)); const salt = word(data, 1); const chainId = ns.decodeUint256(word(data, 2));
    if (!sameAddress(account, ns.PINSET.account) || !sameAddress(implementation, ns.PINSET.identities.accountImplementation.address) || salt !== ns.PINSET.salt || chainId !== BigInt(ns.PINSET.chainId) || !sameAddress(tokenContract, ns.PINSET.identities.loopers.address) || tokenId !== BigInt(ns.PINSET.tokenId)) throw new Error('Registry event values mismatch.');
    return ns.deepFreeze({ receiptArrayIndex: receiptIndex, logIndex: log.logIndex, address: lower(log.address), topics: log.topics, data: log.data });
  }
  function exactHashes(requestedHash, transaction, receipt) { if (!HASH.test(requestedHash) || lower(transaction?.hash) !== requestedHash || lower(receipt?.transactionHash) !== requestedHash) throw new Error('Transaction/receipt/requested hash mismatch.'); }
  function validateReceiptCoordinates(transaction, receipt) { if (!QUANTITY.test(receipt.blockNumber) || !HASH.test(receipt.blockHash) || transaction.blockNumber !== receipt.blockNumber || transaction.blockHash !== receipt.blockHash || transaction.transactionIndex !== receipt.transactionIndex) throw new Error('Transaction and receipt block coordinates disagree.'); }
  function uniqueLogIndices(logs) { const seen = new Set(); for (const log of logs) { if (!QUANTITY.test(log.logIndex) || seen.has(log.logIndex)) throw new Error('Receipt logIndex values are invalid or duplicate.'); seen.add(log.logIndex); } }
  function directAttribution(transaction, receipt) {
    if (transaction.chainId !== ns.PINSET.chainIdHex || !sameAddress(transaction.from, ns.PINSET.identities.sponsor.address) || !sameAddress(transaction.to, ns.PINSET.identities.registry.address) || transaction.input !== ns.EXACT_CALLDATA || transaction.value !== '0x0') throw new Error('Direct transaction is not exact.');
    const matches = receipt.logs.map((log, index) => ({ log, index })).filter(({ log }) => sameAddress(log.address, ns.PINSET.identities.registry.address) && log.topics?.[0] === ns.TOPICS.erc6551AccountCreated); if (matches.length !== 1) throw new Error('Expected exactly one registry creation event.'); return decodeRegistryLog(matches[0].log, matches[0].index);
  }
  function decodeUserOperationEvent(receipt, operation, userOpHash) {
    const matches = receipt.logs.filter((log) => sameAddress(log.address, ns.PINSET.identities.entryPoint.address) && log.topics?.length === 4 && log.topics[0] === ns.TOPICS.userOperationEvent && log.topics[1] === userOpHash && sameAddress(ns.decodeAddress(log.topics[2]), operation.sender));
    if (matches.length !== 1) throw new Error('Expected exactly one selected EntryPoint UserOperationEvent.');
    const log = matches[0];
    if (!QUANTITY.test(log.logIndex) || ns.hexToBytes(log.data).length !== 128) throw new Error('UserOperationEvent shape is invalid.');
    if (ns.decodeUint256(word(log.data, 0)) !== operation.nonce || ns.decodeBool(word(log.data, 1)) !== true) throw new Error('UserOperationEvent nonce or success mismatch.');
    return log;
  }
  function findTraceAttribution(trace, selectedCallData, receipt) {
    if (!trace || !sameAddress(trace.to, ns.PINSET.identities.entryPoint.address) || trace.input === undefined || BigInt(trace.value || '0x0') !== 0n || trace.error) throw new Error('Trace root mismatch.');
    const candidates = [];
    function walk(frame) {
      const selected = String(frame.type || 'CALL').toUpperCase() === 'CALL' && sameAddress(frame.from, ns.PINSET.identities.entryPoint.address) && sameAddress(frame.to, ns.PINSET.identities.sponsor.address) && frame.input === selectedCallData && BigInt(frame.value || '0x0') === 0n && !frame.error;
      if (selected) candidates.push(frame);
      for (const child of frame.calls || []) walk(child);
    }
    walk(trace);
    if (candidates.length !== 1) throw new Error('Trace must contain exactly one selected sponsor frame.');
    const frame = candidates[0];
    const plumbingTargets = [ns.PINSET.identities.sponsor.address, ns.PINSET.identities.sponsorDelegate.address, ns.PINSET.identities.sponsorImplementation.address].map(lower);
    const registryCalls = [];
    function inspect(node) {
      for (const child of node.calls || []) {
        const type = String(child.type || 'CALL').toUpperCase();
        if (child.error || BigInt(child.value || '0x0') !== 0n) throw new Error('Trace plumbing must be successful and zero-value.');
        if (sameAddress(child.to, ns.PINSET.identities.registry.address)) {
          if (type !== 'CALL' || child.input !== ns.EXACT_CALLDATA) throw new Error('Registry trace call mismatch.');
          registryCalls.push(child);
          continue;
        }
        if (!['DELEGATECALL','STATICCALL'].includes(type) || !plumbingTargets.includes(lower(child.to))) throw new Error('Unexpected wallet-envelope plumbing call.');
        inspect(child);
      }
    }
    inspect(frame);
    if (registryCalls.length !== 1) throw new Error('Trace must contain exactly one registry call.');
    const logs = registryCalls[0].logs;
    if (!Array.isArray(logs)) throw new Error('Trace lacks per-frame logs.');
    const matching = logs.filter((log) => log.topics?.[0] === ns.TOPICS.erc6551AccountCreated);
    if (matching.length !== 1 || !Number.isInteger(matching[0].index) || matching[0].index < 0 || matching[0].index >= receipt.logs.length) throw new Error('Trace registry log ordinal mismatch.');
    const receiptLog = receipt.logs[matching[0].index];
    if (JSON.stringify({ address: lower(matching[0].address), topics: matching[0].topics, data: matching[0].data }) !== JSON.stringify({ address: lower(receiptLog.address), topics: receiptLog.topics, data: receiptLog.data })) throw new Error('Trace log bytes do not match receipt ordinal.');
    return decodeRegistryLog(receiptLog, matching[0].index);
  }
  async function wrappedAttribution(transaction, receipt, evidence) {
    if (transaction.chainId !== ns.PINSET.chainIdHex || !sameAddress(transaction.to, ns.PINSET.identities.entryPoint.address) || transaction.value !== '0x0') throw new Error('Wrapped top-level transaction mismatch.'); const decoded = decodeHandleOps(transaction.input); const selected = decoded.operations.filter((operation) => sameAddress(operation.sender, ns.PINSET.identities.sponsor.address)); if (selected.length !== 1 || selected[0].initCode !== '0x') throw new Error('Expected one initialized sponsor UserOperation.'); decodeWalletEnvelope(selected[0].callData);
    const localHash = ns.hashUserOperationV06(selected[0]); if (evidence.onchainUserOpHashResult !== localHash) throw new Error('Local/onchain userOpHash mismatch.'); decodeUserOperationEvent(receipt, selected[0], localHash); if (evidence.trace?.input !== transaction.input || BigInt(evidence.trace?.value || '0x0') !== 0n) throw new Error('Trace root transaction input or value mismatch.'); return findTraceAttribution(evidence.trace, selected[0].callData, receipt);
  }
  function sameReceiptBlock(evidence, receipt) {
    return evidence && evidence.blockNumber === Number(ns.parseQuantity(receipt.blockNumber)) && evidence.blockHash === receipt.blockHash;
  }
  async function verifyPostState(post, receipt = null) {
    if (!post || (receipt && !sameReceiptBlock(post, receipt)) || post.accountCode !== ns.EXPECTED_ACCOUNT_RUNTIME || await ns.sha256Hex(post.accountCode) !== ns.EXPECTED_ACCOUNT_RUNTIME_SHA256 || post.accountBalance !== '0x0') return false;
    return post.tokenResult === `0x${ns.uint256Word(ns.PINSET.chainId)}${ns.addressWord(ns.PINSET.identities.loopers.address)}${ns.uint256Word(ns.PINSET.tokenId)}`
      && post.ownerResult === `0x${ns.addressWord(ns.PINSET.holder)}` && post.stateResult === `0x${ns.uint256Word(0)}` && post.validSignerResult === ns.SELECTORS.accountIsValidSigner && post.invariantsValid === true;
  }
  function verifyRevertedState(post, receipt) {
    return Boolean(post && sameReceiptBlock(post, receipt) && post.accountCode === '0x' && post.accountBalance === '0x0' && post.invariantsValid === true);
  }
  async function verifyReceiptEvidence({ requestedHash, transaction, receipt, postState = null, revertedState = null, trace = null, onchainUserOpHashResult = null }) {
    exactHashes(requestedHash, transaction, receipt);
    validateReceiptCoordinates(transaction, receipt);
    if (!Array.isArray(receipt.logs)) throw new Error('Receipt logs missing.');
    uniqueLogIndices(receipt.logs);
    const postValid = await verifyPostState(postState, receipt);
    if (receipt.status === '0x0') {
      if (postValid) return ns.deepFreeze({ classification: 'observed_unattributed', registryLog: null });
      return ns.deepFreeze({ classification: verifyRevertedState(revertedState, receipt) ? 'reverted' : 'uncertain_hashed', registryLog: null });
    }
    if (receipt.status !== '0x1') throw new Error('Receipt status malformed.');
    try {
      const registryLog = sameAddress(transaction.to, ns.PINSET.identities.registry.address) ? directAttribution(transaction, receipt) : await wrappedAttribution(transaction, receipt, { trace, onchainUserOpHashResult });
      if (!postValid) return ns.deepFreeze({ classification: 'uncertain_hashed', registryLog: null });
      return ns.deepFreeze({ classification: 'confirmed_attributed', registryLog });
    } catch (error) {
      if (postValid) return ns.deepFreeze({ classification: 'observed_unattributed', registryLog: null, attributionError: String(error.message).slice(0, 240) });
      return ns.deepFreeze({ classification: 'uncertain_hashed', registryLog: null, attributionError: String(error.message).slice(0, 240) });
    }
  }

  Object.defineProperties(ns, Object.fromEntries(Object.entries({ decodeHandleOps, encodeGetUserOpHashCall, decodeWalletEnvelope, decodeRegistryLog, decodeUserOperationEvent, findTraceAttribution, verifyPostState, verifyRevertedState, verifyReceiptEvidence }).map(([key, value]) => [key, { value, enumerable: true, writable: false, configurable: false }])));
})();
