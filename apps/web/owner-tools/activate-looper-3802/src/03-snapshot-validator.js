'use strict';

(() => {
  const ns = globalThis.ActivateLooper3802;
  const ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
  const HASH = /^0x[0-9a-f]{64}$/u;
  const CODE_IDENTITIES = ['loopers','loopersImplementation','registry','accountImplementation','adapter','adapterImplementation','identityRegistry','identityRegistryImplementation','sponsor','sponsorDelegate','sponsorImplementation','entryPoint'];
  const SLOT_IDENTITIES = ['loopers','adapter','identityRegistry','sponsor'];
  const CALL_NAMES = Object.keys(ns.CALLS);

  function callRequest(call) { return { kind: 'call', transaction: { to: call.target, data: call.calldata } }; }
  function createPreflightPlan() {
    const plan = [];
    for (const name of CODE_IDENTITIES) plan.push({ key: `code:${name}`, request: { kind: 'code', address: ns.PINSET.identities[name].address } });
    for (const name of SLOT_IDENTITIES) plan.push({ key: `slot:${name}`, request: { kind: 'storage', address: ns.PINSET.identities[name].address, slot: ns.PINSET.eip1967Slot } });
    for (const name of CALL_NAMES) plan.push({ key: `call:${name}`, request: callRequest(ns.CALLS[name]) });
    plan.push({ key: 'accountCode', request: { kind: 'code', address: ns.PINSET.account } });
    plan.push({ key: 'accountBalance', request: { kind: 'balance', address: ns.PINSET.account } });
    plan.push({ key: 'simulation', request: { kind: 'call', transaction: ns.EXACT_TRANSACTION } });
    plan.push({ key: 'estimateGas', request: { kind: 'estimate', transaction: ns.EXACT_TRANSACTION } });
    return ns.deepFreeze(plan);
  }
  const PREFLIGHT_PLAN = createPreflightPlan();
  function unwrap(item) { return item && typeof item === 'object' && Object.hasOwn(item, 'result') ? item.result : item; }
  function exactObjectKeys(value, keys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
    const actual = Object.keys(value); if (actual.length !== keys.length || actual.some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(value, key))) throw new Error(`${label} has unknown or missing keys.`);
  }
  function expectedRoute(request, blockRef) {
    if (request.kind === 'code') return ['eth_getCode', [request.address, blockRef]];
    if (request.kind === 'storage') return ['eth_getStorageAt', [request.address, request.slot, blockRef]];
    if (request.kind === 'balance') return ['eth_getBalance', [request.address, blockRef]];
    if (request.kind === 'call') return ['eth_call', [request.transaction, blockRef]];
    if (request.kind === 'estimate') return ['eth_estimateGas', [request.transaction, blockRef]];
    throw new Error('Snapshot plan contains an unsupported state request.');
  }
  function validateBundleMetadata(bundle, plan, { gasPrice = false, label = 'state bundle' } = {}) {
    exactObjectKeys(bundle, gasPrice ? ['origin','mode','anchor','items','gasPrice'] : ['origin','mode','anchor','items'], label);
    if (!ns.RPC_ORIGINS.slice(0, 2).includes(bundle.origin) || !['eip-1898','number-guarded'].includes(bundle.mode)) throw new Error(`${label} origin or mode is invalid.`);
    exactObjectKeys(bundle.anchor, ['number','hash'], `${label}.anchor`); ns.parseQuantity(bundle.anchor.number); if (!HASH.test(bundle.anchor.hash)) throw new Error(`${label} anchor hash is invalid.`);
    if (!Array.isArray(bundle.items) || bundle.items.length !== plan.length) throw new Error(`${label} item count is invalid.`);
    const blockRef = bundle.mode === 'eip-1898' ? { blockHash: bundle.anchor.hash, requireCanonical: true } : bundle.anchor.number;
    plan.forEach(({ request }, index) => {
      const item = bundle.items[index]; exactObjectKeys(item, ['origin','method','params','result'], `${label}.items[${index}]`);
      const [method, params] = expectedRoute(request, blockRef);
      if (item.origin !== bundle.origin || item.method !== method || JSON.stringify(item.params) !== JSON.stringify(params)) throw new Error(`${label} contains mixed-origin or mismatched request evidence.`);
    });
    if (gasPrice) {
      exactObjectKeys(bundle.gasPrice, ['origin','method','params','result'], `${label}.gasPrice`);
      if (!ns.RPC_ORIGINS.slice(0, 2).includes(bundle.gasPrice.origin) || bundle.gasPrice.method !== 'eth_gasPrice' || !Array.isArray(bundle.gasPrice.params) || bundle.gasPrice.params.length !== 0) throw new Error(`${label} gas-price evidence is invalid.`);
    }
    return true;
  }
  function mapEvidence(bundle) {
    validateBundleMetadata(bundle, PREFLIGHT_PLAN, { gasPrice: true, label: 'preflight state bundle' });
    const values = Object.create(null);
    PREFLIGHT_PLAN.forEach(({ key }, index) => { values[key] = bundle.items[index].result; });
    values.gasPrice = bundle.gasPrice.result;
    return values;
  }
  function sameAddress(a, b) { return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase(); }
  function requireRaw(actual, expected, label) { if (actual !== expected) throw new Error(`${label} raw result mismatch.`); }
  function codeLength(code) { return ns.hexToBytes(code).length; }
  function decodeLowAddress(slot, label) { const value = ns.decodeAddress(slot); if (!ADDRESS.test(value)) throw new Error(`${label} address malformed.`); return value; }
  function classifyAccount(code, balance) {
    if (code === '0x') return balance === '0x0' ? 'undeployed_zero' : 'unexpected_funded';
    let bytes;
    try { bytes = ns.hexToBytes(code); } catch { return 'malformed_code'; }
    if (bytes.length === 173 && code === ns.EXPECTED_ACCOUNT_RUNTIME) return balance === '0x0' ? 'deployed_exact' : 'unexpected_funded';
    return 'wrong_code';
  }

  async function validatePreflight(bundle, wallet) {
    if (!wallet || wallet.chainId !== ns.PINSET.chainIdHex || !sameAddress(wallet.account, ns.PINSET.identities.sponsor.address)) throw new Error('Connected wallet must be the pinned sponsor on Base.');
    const values = mapEvidence(bundle);
    for (const name of CODE_IDENTITIES) {
      const identity = ns.PINSET.identities[name]; const code = values[`code:${name}`];
      if (codeLength(code) !== identity.bytes) throw new Error(`${name} code length mismatch.`);
      if (await ns.sha256Hex(code) !== identity.sha256) throw new Error(`${name} code hash mismatch.`);
    }
    if (values['code:sponsor'] !== ns.PINSET.sponsorDesignator) throw new Error('Sponsor designator mismatch.');
    for (const name of SLOT_IDENTITIES) {
      const expected = ns.PINSET.identities[name].implementationSlot; const actual = values[`slot:${name}`]; requireRaw(actual, expected, `${name} implementation slot`);
      const mapped = name === 'loopers' ? 'loopersImplementation' : name === 'adapter' ? 'adapterImplementation' : name === 'identityRegistry' ? 'identityRegistryImplementation' : 'sponsorImplementation';
      if (!sameAddress(decodeLowAddress(actual, name), ns.PINSET.identities[mapped].address)) throw new Error(`${name} implementation address mismatch.`);
    }
    for (const name of CALL_NAMES) requireRaw(values[`call:${name}`], ns.CALLS[name].result, name);
    if (ns.decodeAddress(values['call:loopersOwner']) !== ns.PINSET.identities.sponsor.address.toLowerCase()) throw new Error('Loopers owner mismatch.');
    if (ns.decodeAddress(values['call:loopersOwnerOf']) !== ns.PINSET.holder.toLowerCase()) throw new Error('Looper holder mismatch.');
    if (ns.decodeString(values['call:loopersIdentityUri']) !== ns.PINSET.identityUri || ns.decodeString(values['call:identityTokenUri']) !== ns.PINSET.identityUri) throw new Error('Identity URI mismatch.');
    const binding = ns.decodeBinding(values['call:adapterBinding']); if (binding.standard !== 0 || !sameAddress(binding.tokenContract, ns.PINSET.identities.loopers.address) || binding.tokenId !== ns.PINSET.tokenId) throw new Error('Adapter binding mismatch.');
    if (!ns.decodeBool(values['call:adapterController'])) throw new Error('Holder is not identity controller.');
    ns.validateExactTransaction(ns.EXACT_TRANSACTION);
    requireRaw(values.simulation, `0x${ns.addressWord(ns.PINSET.account)}`, 'simulation');
    const estimated = ns.parseQuantity(values.estimateGas); if (estimated > BigInt(ns.PINSET.gasCap)) throw new Error('Gas estimate exceeds cap.');
    const gasPrice = ns.parseQuantity(values.gasPrice);
    const accountState = classifyAccount(values.accountCode, values.accountBalance);
    const validated = {
      blockNumber: Number(ns.parseQuantity(bundle.anchor.number)), blockHash: bundle.anchor.hash, origin: bundle.origin, accountState,
      estimatedGas: values.estimateGas, gasPrice: values.gasPrice, estimatedFeeWei: (estimated * gasPrice).toString(10), sendReady: accountState === 'undeployed_zero',
      accountCode: values.accountCode, accountBalance: values.accountBalance,
      preflight: {
        blockNumber: Number(ns.parseQuantity(bundle.anchor.number)), blockHash: bundle.anchor.hash, estimatedGas: values.estimateGas, gasPrice: values.gasPrice,
        accountCode: values.accountCode, accountBalance: values.accountBalance,
        loopersImplementationSlot: values['slot:loopers'], adapterImplementationSlot: values['slot:adapter'], identityImplementationSlot: values['slot:identityRegistry'],
        sponsorDesignator: values['code:sponsor'], sponsorImplementationSlot: values['slot:sponsor'],
        adapterIdentityRegistryResult: values['call:adapterIdentityRegistry'], adapterBindingResult: values['call:adapterBinding'], adapterControllerResult: values['call:adapterController'],
        identityOwnerResult: values['call:identityOwner'], identityTokenURIResult: values['call:identityTokenUri'], sponsorImplementationResult: values['call:sponsorImplementation'],
        sponsorEntryPointResult: values['call:sponsorEntryPoint'], simulationResult: values.simulation,
      },
    };
    return ns.deepFreeze(validated);
  }

  const ACCOUNT_CALLS = ns.deepFreeze({
    token: { to: ns.PINSET.account, data: ns.SELECTORS.accountToken },
    owner: { to: ns.PINSET.account, data: ns.SELECTORS.accountOwner },
    state: { to: ns.PINSET.account, data: ns.SELECTORS.accountState },
    validSigner: { to: ns.PINSET.account, data: `${ns.SELECTORS.accountIsValidSigner}${ns.addressWord(ns.PINSET.holder)}${ns.uint256Word(64)}${ns.uint256Word(0)}` },
  });
  const COMMON_STATE_PLAN = ns.deepFreeze([
    ...CODE_IDENTITIES.map((name) => ({ key: `code:${name}`, request: { kind: 'code', address: ns.PINSET.identities[name].address } })),
    ...SLOT_IDENTITIES.map((name) => ({ key: `slot:${name}`, request: { kind: 'storage', address: ns.PINSET.identities[name].address, slot: ns.PINSET.eip1967Slot } })),
    ...CALL_NAMES.map((name) => ({ key: `call:${name}`, request: callRequest(ns.CALLS[name]) })),
    { key: 'accountCode', request: { kind: 'code', address: ns.PINSET.account } },
    { key: 'accountBalance', request: { kind: 'balance', address: ns.PINSET.account } },
  ]);
  const REVERTED_STATE_PLAN = COMMON_STATE_PLAN;
  const POST_STATE_PLAN = ns.deepFreeze([
    ...COMMON_STATE_PLAN,
    ...Object.entries(ACCOUNT_CALLS).map(([key, transaction]) => ({ key: `account:${key}`, request: { kind: 'call', transaction } })),
  ]);
  async function validateCommonState(bundle, plan, label) {
    validateBundleMetadata(bundle, plan, { label });
    const blockNumber = ns.parseQuantity(bundle.anchor.number);
    if (blockNumber > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} block number is unsafe.`);
    const values = Object.create(null);
    plan.forEach(({ key }, index) => { values[key] = bundle.items[index].result; });
    for (const name of CODE_IDENTITIES) {
      const identity = ns.PINSET.identities[name]; const code = values[`code:${name}`];
      if (codeLength(code) !== identity.bytes || await ns.sha256Hex(code) !== identity.sha256) throw new Error(`${name} ${label} code mismatch.`);
    }
    if (values['code:sponsor'] !== ns.PINSET.sponsorDesignator) throw new Error(`${label} sponsor designator mismatch.`);
    for (const name of SLOT_IDENTITIES) {
      const actual = values[`slot:${name}`];
      requireRaw(actual, ns.PINSET.identities[name].implementationSlot, `${name} ${label} slot`);
      const mapped = name === 'loopers' ? 'loopersImplementation' : name === 'adapter' ? 'adapterImplementation' : name === 'identityRegistry' ? 'identityRegistryImplementation' : 'sponsorImplementation';
      if (!sameAddress(decodeLowAddress(actual, name), ns.PINSET.identities[mapped].address)) throw new Error(`${name} ${label} implementation mismatch.`);
    }
    for (const name of CALL_NAMES) requireRaw(values[`call:${name}`], ns.CALLS[name].result, `${name} ${label} call`);
    return { values, blockNumber: Number(blockNumber), blockHash: bundle.anchor.hash };
  }
  async function validatePostState(bundle) {
    const { values, blockNumber, blockHash } = await validateCommonState(bundle, POST_STATE_PLAN, 'receipt-block post-state');
    if (values.accountCode !== ns.EXPECTED_ACCOUNT_RUNTIME || await ns.sha256Hex(values.accountCode) !== ns.EXPECTED_ACCOUNT_RUNTIME_SHA256 || values.accountBalance !== '0x0') throw new Error('Receipt-block account runtime or balance mismatch.');
    const expectedToken = `0x${ns.uint256Word(ns.PINSET.chainId)}${ns.addressWord(ns.PINSET.identities.loopers.address)}${ns.uint256Word(ns.PINSET.tokenId)}`;
    const expectedOwner = `0x${ns.addressWord(ns.PINSET.holder)}`; const expectedState = `0x${ns.uint256Word(0)}`;
    requireRaw(values['account:token'], expectedToken, 'account.token'); requireRaw(values['account:owner'], expectedOwner, 'account.owner'); requireRaw(values['account:state'], expectedState, 'account.state'); requireRaw(values['account:validSigner'], ns.SELECTORS.accountIsValidSigner, 'account.isValidSigner');
    return ns.deepFreeze({ blockNumber, blockHash, accountCode: values.accountCode, accountBalance: values.accountBalance, tokenResult: values['account:token'], ownerResult: values['account:owner'], stateResult: values['account:state'], validSignerResult: values['account:validSigner'], invariantsValid: true });
  }
  async function validateRevertedState(bundle) {
    const { values, blockNumber, blockHash } = await validateCommonState(bundle, REVERTED_STATE_PLAN, 'reverted receipt-block state');
    if (values.accountCode !== '0x' || values.accountBalance !== '0x0') throw new Error('Reverted receipt requires the exact undeployed zero-balance account.');
    return ns.deepFreeze({ blockNumber, blockHash, accountCode: values.accountCode, accountBalance: values.accountBalance, invariantsValid: true });
  }
  function withBlockRefs(plan, blockRef) { return plan.map(({ request }) => ({ ...request, ...(request.kind === 'gasPrice' ? {} : { blockRef }) })); }

  Object.defineProperties(ns, Object.fromEntries(Object.entries({ PREFLIGHT_PLAN, COMMON_STATE_PLAN, REVERTED_STATE_PLAN, POST_STATE_PLAN, ACCOUNT_CALLS, createPreflightPlan, preflightRequests: withBlockRefs, classifyAccount, validateBundleMetadata, validatePreflight, validatePostState, validateRevertedState }).map(([key, value]) => [key, { value, enumerable: true, writable: false, configurable: false }])));
})();
