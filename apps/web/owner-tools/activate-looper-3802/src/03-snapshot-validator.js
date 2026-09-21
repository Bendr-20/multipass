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
    plan.push({ key: 'gasPrice', request: { kind: 'gasPrice' } });
    return ns.deepFreeze(plan);
  }
  const PREFLIGHT_PLAN = createPreflightPlan();
  function unwrap(item) { return item && typeof item === 'object' && Object.hasOwn(item, 'result') ? item.result : item; }
  function mapEvidence(bundle) {
    if (!bundle || typeof bundle !== 'object' || !bundle.anchor || !HASH.test(bundle.anchor.hash) || typeof bundle.anchor.number !== 'string' || !Array.isArray(bundle.items) || bundle.items.length !== PREFLIGHT_PLAN.length) throw new Error('Incomplete or malformed anchored state bundle.');
    const values = Object.create(null);
    PREFLIGHT_PLAN.forEach(({ key }, index) => { values[key] = unwrap(bundle.items[index]); });
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

  function withBlockRefs(plan, blockRef) { return plan.map(({ request }) => ({ ...request, ...(request.kind === 'gasPrice' ? {} : { blockRef }) })); }

  Object.defineProperties(ns, Object.fromEntries(Object.entries({ PREFLIGHT_PLAN, createPreflightPlan, preflightRequests: withBlockRefs, classifyAccount, validatePreflight }).map(([key, value]) => [key, { value, enumerable: true, writable: false, configurable: false }])));
})();
