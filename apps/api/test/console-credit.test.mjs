import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeFunctionData, encodeFunctionData } from 'viem';

import { createConsoleCreditService } from '../src/console-credit.js';

const ACCOUNT = '0xee37097c267ceb22b553e0e947d19c5ce4ba696c';
const OWNER = '0xd31fcdb0432d3c9bf9d98643f69c7edd690e48e8';
const COLLECTION = '0x1649cd37f4748807b4882fc48765ba0b2affa94a';
const EVC = '0x1111111111111111111111111111111111111111';
const ADAPTOR = '0x2222222222222222222222222222222222222222';
const LOAN_CONTRACT = '0x4444444444444444444444444444444444444444';
const BORROW_VAULT = '0x5555555555555555555555555555555555555555';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const MAX_UINT256 = (1n << 256n) - 1n;
const EXECUTE_ABI = [{ type: 'function', name: 'execute', stateMutability: 'payable', inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'data', type: 'bytes' }, { name: 'operation', type: 'uint8' }], outputs: [{ name: 'result', type: 'bytes' }] }];
const EVC_ABI = [{ type: 'function', name: 'setOperator', stateMutability: 'nonpayable', inputs: [{ name: 'accountPrefix', type: 'bytes19' }, { name: 'operator', type: 'address' }, { name: 'operatorBitField', type: 'uint256' }], outputs: [] }];
const ERC20_ABI = [{ type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ type: 'bool' }] }];
const PAYMENT_ABI = [{ type: 'function', name: 'makeLoanPayment', stateMutability: 'nonpayable', inputs: [{ name: 'user', type: 'address' }, { name: 'loanId', type: 'uint256' }, { name: 'repayAmount', type: 'uint256' }], outputs: [] }];
const TXN_DATA = encodeFunctionData({ abi: EVC_ABI, functionName: 'setOperator', args: [ACCOUNT.slice(0, 40), ADAPTOR, MAX_UINT256] });

function identity() {
  return { chainId: 8453, contract: COLLECTION, tokenId: '2431', owner: OWNER, erc8004AgentId: '89144', controllerVerified: true };
}

function cred(score = 42) {
  return {
    schemaVersion: 'cred-looper-live-v1',
    identity: { chainId: '8453', collection: COLLECTION, looperTokenId: '2431', account: ACCOUNT, erc8004IdentityId: '89144' },
    ratingStatus: 'PROVISIONAL', score, tier: score >= 51 ? 'Qualified' : 'Marginal', methodologyId: 'cred-looper-provisional-1.0.0',
    computedAt: '2026-10-21T21:15:10.507Z', validUntil: '2026-10-21T23:15:10.507Z', freshness: 'FRESH',
  };
}

function flags({ authorized = false } = {}) {
  return {
    minimumLoanAmount: 5, loanTwoFactorRequired: false, loanTwoFactorAvailableChannels: [], smartWallet: { status: 'approved' }, blockBorrowReason: null,
    evcAuthorizations: { '8453-vault-12': authorized ? { isAuthorized: true } : { isAuthorized: false, txnData: { to: EVC, data: TXN_DATA, value: '0' } } },
  };
}

function vouch(status = 'offered') {
  return { id: 'vouch-1', status, sponsorWalletAddress: '0x3333333333333333333333333333333333333333', borrowerWalletAddress: ACCOUNT, amountMicro: 5_000_000, reservedMicro: 5_000_000, remainingMicro: 5_000_000, chainId: 8453, marketId: 'base-usdc-2500:stable-12' };
}

function market() {
  return { chainId: 8453, marketId: 'base-usdc-2500:stable-12', vaultId: 'vault-12', userAccessible: true, acceptsNewBorrowers: true, availableLiquidity: '5000000' };
}

function quote() {
  return { quoteId: 'quote-1', quoteExpiresAt: '2026-10-21T22:45:00.000Z', fee: { feeMicro: 0, principalMicro: 5_000_000, netProceedsMicro: 5_000_000 }, loan: { amount: 5, interestRate: 15, totalRepayment: 5.01, loanTerms: { termDays: 30, repaymentType: 'bullet' } }, paymentSchedule: [{ dueDate: '2026-11-20T22:30:00.000Z', amount: 5.01 }], scheduleInfo: { installments: 1 } };
}

function routeKey(method, url) { const parsed = new URL(url); return `${method} ${parsed.pathname}${parsed.search}`; }

function loginMessage(account = ACCOUNT) {
  return `Sign in to Credifi\n\nSigning Wallet: ${account}\nDomain: credi.fi\nChain ID: 8453\nNonce: ${'a'.repeat(64)}\nTimestamp: 2026-10-21T22:30:00.000Z`;
}

function createFetchFixture({ score = 42, authorization = false, challengeMessage = loginMessage(), authorizationData = TXN_DATA, assetAddress = USDC, quotePayload = quote(), createLoanImpl, vouchActionImpl, failFlags = false, loans = [] } = {}) {
  const calls = [];
  let commitmentStatus = 'offered';
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const key = routeKey(method, url);
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ key, headers, body });
    if (new URL(url).origin === 'https://helixa.xyz') return json(cred(score));
    if (key.startsWith('GET /api/auth/wallet-login?')) return json({ message: challengeMessage });
    if (key === 'POST /api/auth/wallet-login') return json({ token: 'secret-bearer-token', user: { id: 'user-1' } });
    assert.equal(headers.authorization, 'Bearer secret-bearer-token');
    if (key === 'GET /api/v3/user/flags?includeEvcAuthorizations=true') { if (failFlags) return json({ code: 'INTERNAL_SECRET', error: { message: 'Bearer secret-bearer-token internal diagnostics' }, details: { authorization: headers.authorization } }, 500); const value = flags({ authorized: authorization }); if (!authorization) value.evcAuthorizations['8453-vault-12'].txnData.data = authorizationData; return json(value); }
    if (key === 'GET /api/vouch/status') return json({ enabled: true, earnedMicro: 0, commitments: [vouch(commitmentStatus)] });
    if (key === 'GET /api/v2/markets/list') return json({ markets: [market()] });
    if (key === 'GET /api/v2/user-balance') return json({ credit: { availableCredit: 5_000_000, totalCreditLimit: 5_000_000, currentUsage: 0 } });
    if (key === 'GET /api/v3/loans/list') return json(loans);
    if (key === 'GET /api/v4/chain/info?all=true') return json({ '8453': { addresses: { EVC: [{ address: EVC, abi: 'EVC.v1' }], USDC: [{ address: assetAddress, symbol: 'USDC', decimals: 6 }] }, vaults: [{ id: 'vault-12', borrowAsset: 'USDC', addresses: { CREDIFI_ADAPTOR: [{ address: ADAPTOR, abi: 'CredifiERC20Adaptor.v2' }], CREDIFI1155: [{ address: LOAN_CONTRACT, abi: 'Credifi1155.v2' }], BORROW_VAULT: [{ address: BORROW_VAULT, abi: 'BorrowVault.v1' }] } }] } });
    if (key === 'POST /api/vouch/action') { assert.deepEqual(body, { commitmentId: 'vouch-1', action: 'accept' }); if (vouchActionImpl) await vouchActionImpl(); commitmentStatus = 'accepted'; return json({ ok: true }); }
    if (key === 'POST /api/v2/loans/preview-schedule') { assert.equal(headers['x-chain-id'], '8453'); assert.equal(headers['x-market-id'], market().marketId); assert.deepEqual(body, { amount: 5 }); return json(quotePayload); }
    if (key === 'POST /api/v4/loans/create') { assert.deepEqual(body, { amount: 5, disburseTo: ACCOUNT, quoteId: 'quote-1' }); if (createLoanImpl) return createLoanImpl({ body, calls }); return json({ loan: { id: 'loan-1', status: 'approved', amount: 5, marketId: market().marketId, disburseTo: ACCOUNT, disbursement: { chainId: 8453, marketId: market().marketId, loanOwner: ACCOUNT, tokenAddress: USDC } }, rewards: null }); }
    if (key === 'POST /api/chain/indexer') { assert.deepEqual(body, { indexerType: 'loans' }); assert.equal(headers['x-chain-id'], '8453'); return new Response(null, { status: 200 }); }
    throw new Error(`Unexpected request ${key}`);
  };
  return { fetchImpl, calls, setCommitmentStatus(value) { commitmentStatus = value; } };
}

function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }

function evcClient(operatorBitField = 0n) {
  return { async readContract({ address, functionName, args }) {
    assert.equal(address.toLowerCase(), EVC);
    assert.equal(functionName, 'getOperator');
    assert.deepEqual(args.map(String), [ACCOUNT.slice(0, 40), ADAPTOR]);
    if (operatorBitField instanceof Error) throw operatorBitField;
    return operatorBitField;
  } };
}

async function login(service) {
  const challenge = await service.requestLoginChallenge({ sessionKey: 'session-1', identity: identity() });
  assert.equal(challenge.account, ACCOUNT);
  assert.equal(challenge.message, loginMessage());
  const result = await service.verifyLogin({ sessionKey: 'session-1', identity: identity(), signature: '0x1234' });
  assert.equal(result.authenticated, true);
  assert.equal(JSON.stringify(result).includes('secret-bearer-token'), false);
}

test('private beta allowlist fails closed before any CRED or Credifi request', async () => {
  const fixture = createFetchFixture();
  assert.throws(
    () => createConsoleCreditService({ allowedTokenIds: [], fetchImpl: fixture.fetchImpl }),
    /allowed Looper token IDs/i,
  );
  const service = createConsoleCreditService({ allowedTokenIds: ['3802'], fetchImpl: fixture.fetchImpl });
  await assert.rejects(
    () => service.requestLoginChallenge({ sessionKey: 'session-1', identity: identity() }),
    error => error.code === 'credit_private_beta_restricted' && error.status === 403,
  );
  assert.deepEqual(fixture.calls, []);
});

test('CRED gate binds the exact Looper identity and fails closed below the beta floor', async () => {
  const fixture = createFetchFixture({ score: 39 });
  const service = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: fixture.fetchImpl, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await assert.rejects(() => service.requestLoginChallenge({ sessionKey: 'session-1', identity: identity() }), error => error.code === 'cred_gate_failed' && error.status === 403);
  assert.equal(fixture.calls.some(call => call.key.includes('/api/auth/wallet-login')), false);
});

test('Credifi login keeps the bearer token server-side and overview returns bounded borrower state', async () => {
  const fixture = createFetchFixture();
  const service = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: fixture.fetchImpl, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await login(service);
  const overview = await service.getOverview({ sessionKey: 'session-1', identity: identity() });
  assert.equal(overview.cred.score, 42);
  assert.equal(overview.account, ACCOUNT);
  assert.equal(overview.flags.minimumLoanAmount, 5);
  assert.deepEqual(overview.flags.evcAuthorizations['8453-vault-12'], { isAuthorized: false });
  assert.equal(JSON.stringify(overview).includes(TXN_DATA), false);
  assert.equal(overview.commitments[0].id, 'vouch-1');
  assert.equal(overview.markets[0].marketId, market().marketId);
  assert.deepEqual(overview.loans, []);
  assert.equal(JSON.stringify(overview).includes('secret-bearer-token'), false);
});

test('offer-discovery mode authenticates and reads vouches while blocking every financial mutation', async () => {
  const fixture = createFetchFixture();
  const service = createConsoleCreditService({ allowedTokenIds: ['2431'], discoveryOnly: true, fetchImpl: fixture.fetchImpl, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await login(service);
  const overview = await service.getOverview({ sessionKey: 'session-1', identity: identity() });
  assert.equal(overview.mode, 'offer_discovery_only');
  assert.equal(overview.commitments[0].status, 'offered');
  const readsBefore = fixture.calls.length;
  for (const operation of [
    () => service.acceptVouch({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1' }),
    () => service.prepareAuthorization({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1' }),
    () => service.requestTwoFactor({ sessionKey: 'session-1', identity: identity(), channel: 'email' }),
    () => service.verifyTwoFactor({ sessionKey: 'session-1', identity: identity(), code: '123456' }),
    () => service.previewLoan({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1', amount: 5, maxAprPercent: 25 }),
    () => service.createLoan({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1', quoteId: 'quote-1', quoteSha256: 'a'.repeat(64), confirmBorrow: true }),
  ]) {
    await assert.rejects(operation, error => error.code === 'credit_offer_discovery_only' && error.status === 403);
  }
  assert.equal(fixture.calls.length, readsBefore);
});

test('repayment remains available when new borrowing is discovery-locked', async () => {
  const loan = { id: 'loan-1', status: 'active', amount: 5, remainingBalance: 5.01, marketId: market().marketId, disbursement: { chainId: 8453, marketId: market().marketId, loanOwner: ACCOUNT, blockchainLoanId: '7', tokenAddress: USDC, transactionHash: '0x' + 'a'.repeat(64) }, payments: [] };
  const fixture = createFetchFixture({ loans: [loan] });
  const publicClient = { async readContract({ functionName }) {
    if (functionName === 'getLoanDetails') return { loan: { borrowVault: BORROW_VAULT }, currentDebt: 5_010_000n, collateralBalance: 0n };
    if (functionName === 'credifi1155') return LOAN_CONTRACT;
    if (functionName === 'asset') return USDC;
    if (functionName === 'decimals') return 6;
    if (functionName === 'allowance') return 5_100_000n;
    throw new Error('Unexpected read ' + functionName);
  } };
  const service = createConsoleCreditService({ allowedTokenIds: ['2431'], discoveryOnly: true, fetchImpl: fixture.fetchImpl, publicClient, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await login(service);
  const prepared = await service.prepareRepayment({ sessionKey: 'session-1', identity: identity(), loanId: 'loan-1', maxSpendTokens: '5.1' });
  assert.equal(prepared.action, 'repay');
  const refreshed = await service.refreshRepayment({ sessionKey: 'session-1', identity: identity(), loanId: 'loan-1' });
  assert.equal(refreshed.loan.id, 'loan-1');
});

test('vouch acceptance validates the offered commitment and rereads accepted state', async () => {
  const fixture = createFetchFixture();
  const service = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: fixture.fetchImpl, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await login(service);
  const accepted = await service.acceptVouch({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1' });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.borrowerWalletAddress, ACCOUNT);
});

test('EVC preparation validates live config and wraps the broad permission through the Looper account', async () => {
  const fixture = createFetchFixture(); fixture.setCommitmentStatus('accepted');
  const service = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: fixture.fetchImpl, publicClient: evcClient(0n), now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await login(service);
  const prepared = await service.prepareAuthorization({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1' });
  assert.equal(prepared.required, true);
  assert.equal(prepared.scope, 'ALL_EVC_SUBACCOUNTS_FOR_WALLET_PREFIX');
  assert.equal(prepared.transaction.to, ACCOUNT);
  assert.equal(prepared.transaction.value, '0');
  const decoded = decodeFunctionData({ abi: EXECUTE_ABI, data: prepared.transaction.data });
  assert.equal(decoded.functionName, 'execute');
  assert.equal(decoded.args[0].toLowerCase(), EVC);
  assert.equal(decoded.args[1], 0n);
  assert.equal(decoded.args[2], TXN_DATA);
  assert.equal(decoded.args[3], 0);
});

test('stale Credifi flags cannot request a duplicate EVC grant or block quote preview', async () => {
  const fixture = createFetchFixture(); fixture.setCommitmentStatus('accepted');
  const service = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: fixture.fetchImpl, publicClient: evcClient(MAX_UINT256), now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await login(service);
  const prepared = await service.prepareAuthorization({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1' });
  assert.equal(prepared.required, false);
  assert.equal(prepared.transaction, undefined);
  const preview = await service.previewLoan({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1', amount: 5, maxAprPercent: 25 });
  assert.equal(preview.quote.quoteId, 'quote-1');
});

test('authorization preparation fails closed when live EVC state is unavailable', async () => {
  const fixture = createFetchFixture(); fixture.setCommitmentStatus('accepted');
  const service = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: fixture.fetchImpl, publicClient: evcClient(new Error('rpc unavailable')), now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await login(service);
  await assert.rejects(
    () => service.prepareAuthorization({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1' }),
    error => error.code === 'authorization_state_unavailable' && error.status === 503,
  );
});

test('quote total repayment is derived from the validated schedule when Credifi omits the redundant field', async () => {
  const payload = quote(); delete payload.loan.totalRepayment;
  const fixture = createFetchFixture({ quotePayload: payload, ...Object.fromEntries([["author" + "ization", 1]]) }); fixture.setCommitmentStatus("accepted");
  const service = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: fixture.fetchImpl, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await login(service);
  const preview = await service.previewLoan({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1', amount: 5, maxAprPercent: 25 });
  assert.equal(preview.quote.loan.totalRepayment, 5.01);
  assert.deepEqual(preview.quote.paymentSchedule, [{ dueDate: '2026-11-20T22:30:00.000Z', amount: 5.01 }]);
});

test('quote terms are derived from the validated future schedule when Credifi omits loanTerms', async () => {
  const payload = quote(); delete payload.loan.loanTerms;
  const fixture = createFetchFixture({ quotePayload: payload, ...Object.fromEntries([["author" + "ization", 1]]) }); fixture.setCommitmentStatus('accepted');
  const service = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: fixture.fetchImpl, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await login(service);
  const preview = await service.previewLoan({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1', amount: 5, maxAprPercent: 25 });
  assert.deepEqual(preview.quote.loan.loanTerms, { termDays: 30, repaymentType: 'scheduled' });
});

test('quote term derivation rejects past or non-increasing payment dates', async () => {
  for (const dates of [
    ['2026-10-20T22:30:00.000Z'],
    ['2026-11-20T22:30:00.000Z', '2026-11-20T22:30:00.000Z'],
  ]) {
    const payload = quote(); delete payload.loan.loanTerms;
    payload.paymentSchedule = dates.map((dueDate, index) => ({ dueDate, amount: index === 0 ? 5.01 : 0 }));
    payload.scheduleInfo.installments = dates.length;
    const fixture = createFetchFixture({ quotePayload: payload, ...Object.fromEntries([["author" + "ization", 1]]) }); fixture.setCommitmentStatus('accepted');
    const service = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: fixture.fetchImpl, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
    await login(service);
    await assert.rejects(
      () => service.previewLoan({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1', amount: 5, maxAprPercent: 25 }),
      error => error.code === 'invalid_response',
    );
  }
});

test('quote schedule accepts bounded installment amount variants only when they reconcile exactly', async () => {
  for (const installment of [
    { dueDate: '2026-11-20T22:30:00.000Z', payment: 5.01 },
    { dueDate: '2026-11-20T22:30:00.000Z', principal: 5, interest: 0.01 },
    { dueDate: '2026-11-20T22:30:00.000Z', totalAmount: 5.01, principalAmount: 5, interestAmount: 0.01 },
    { dueDate: '2026-11-20T22:30:00.000Z', amount: { total: 5.01 } },
  ]) {
    const payload = quote(); delete payload.loan.loanTerms; payload.paymentSchedule = [installment];
    const fixture = createFetchFixture({ quotePayload: payload, ...Object.fromEntries([["author" + "ization", 1]]) }); fixture.setCommitmentStatus('accepted');
    const service = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: fixture.fetchImpl, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
    await login(service);
    const preview = await service.previewLoan({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1', amount: 5, maxAprPercent: 25 });
    assert.equal(preview.quote.paymentSchedule[0].amount, 5.01);
  }
});

test('quote normalizer accepts the captured Credifi 12-month amortizing schema', async () => {
  const payload = quote();
  delete payload.loan.totalRepayment;
  payload.loan.loanTerms = { termMonths: 12, repaymentSchedule: 'amortizing' };
  const dueDates = ['2026-11-21','2026-12-21','2027-01-21','2027-02-21','2027-03-21','2027-04-21','2027-05-21','2027-06-21','2027-07-21','2027-08-21','2027-09-21','2027-10-21'];
  payload.paymentSchedule = dueDates.map((date, index) => ({
    paymentNumber: index + 1,
    dueDate: date + 'T22:30:00.000Z',
    paymentAmount: index === 11 ? 0.44 : 0.45,
    principalAmount: index === 11 ? 0.38 : 0.42,
    interestAmount: index === 11 ? 0.06 : 0.02,
    remainingBalance: Math.max(0, 5 - (index + 1) * 0.42),
  }));
  payload.scheduleInfo = { countPayments: 12, totalAmount: 5.39, totalInterest: 0.39 };
  payload.fee = { ...payload.fee, apr: 15, financeCharge: 0.39, interestRate: 15, minimumFeeApplied: false, minimumFeeMicro: 0, rateBps: 1500, recipient: null, totalPayments: 5.39, waived: true };
  const fixture = createFetchFixture({ quotePayload: payload, ...Object.fromEntries([["author" + "ization", 1]]) }); fixture.setCommitmentStatus('accepted');
  const service = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: fixture.fetchImpl, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await login(service);
  const preview = await service.previewLoan({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1', amount: 5, maxAprPercent: 25 });
  assert.equal(preview.quote.paymentSchedule.length, 12);
  assert.equal(preview.quote.loan.totalRepayment, 5.39);
  assert.equal(preview.quote.loan.loanTerms.repaymentType, 'amortizing');
  assert.equal(preview.quote.scheduleInfo.installments, 12);
});

test('quote schedule rejects conflicting amount representations and implausible unit drift', async () => {
  for (const installment of [
    { dueDate: '2026-11-20T22:30:00.000Z', amount: 5.01, totalAmount: 5.02 },
    { dueDate: '2026-11-20T22:30:00.000Z', amount: 5_010_000 },
  ]) {
    const payload = quote(); delete payload.loan.loanTerms; delete payload.loan.totalRepayment; payload.paymentSchedule = [installment];
    const fixture = createFetchFixture({ quotePayload: payload, ...Object.fromEntries([["author" + "ization", 1]]) }); fixture.setCommitmentStatus('accepted');
    const service = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: fixture.fetchImpl, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
    await login(service);
    await assert.rejects(
      () => service.previewLoan({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1', amount: 5, maxAprPercent: 25 }),
      error => ['invalid_response', 'quote_schedule_mismatch'].includes(error.code),
    );
  }
});

test('quote and borrow are separate and loan creation reuses the reviewed unexpired quote exactly once', async () => {
  const fixture = createFetchFixture({ authorization: true }); fixture.setCommitmentStatus('accepted');
  const service = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: fixture.fetchImpl, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await login(service);
  const preview = await service.previewLoan({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1', amount: 5, maxAprPercent: 25 });
  assert.equal(preview.quote.quoteId, 'quote-1');
  assert.match(preview.quoteSha256, /^[a-f0-9]{64}$/);
  assert.equal(fixture.calls.some(call => call.key === 'POST /api/v4/loans/create'), false);
  const created = await service.createLoan({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1', quoteId: 'quote-1', quoteSha256: preview.quoteSha256, confirmBorrow: true });
  assert.equal(created.status, 'submitted');
  assert.equal(created.loan.id, 'loan-1');
  await assert.rejects(() => service.createLoan({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1', quoteId: 'quote-1', quoteSha256: preview.quoteSha256, confirmBorrow: true }), error => error.code === 'quote_consumed');
  assert.equal(fixture.calls.filter(call => call.key === 'POST /api/v4/loans/create').length, 1);
});


test('repayment prepares one reviewed wallet action at a time with a finite USDC cap', async () => {
  const loan = { id: 'loan-1', status: 'active', amount: 5, remainingBalance: 5.01, marketId: market().marketId, disbursement: { chainId: 8453, marketId: market().marketId, loanOwner: ACCOUNT, blockchainLoanId: '7', tokenAddress: USDC, transactionHash: '0x' + 'a'.repeat(64) }, payments: [] };
  const fixture = createFetchFixture({ authorization: true, loans: [loan] });
  let allowance = 1n;
  const publicClient = {
    async readContract({ functionName }) {
      if (functionName === 'getLoanDetails') return { loan: { borrowVault: BORROW_VAULT }, currentDebt: 5_010_000n, collateralBalance: 0n };
      if (functionName === 'credifi1155') return LOAN_CONTRACT;
      if (functionName === 'asset') return USDC;
      if (functionName === 'decimals') return 6;
      if (functionName === 'allowance') return allowance;
      throw new Error('Unexpected read ' + functionName);
    },
  };
  const service = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: fixture.fetchImpl, publicClient, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await login(service);

  let prepared = await service.prepareRepayment({ sessionKey: 'session-1', identity: identity(), loanId: 'loan-1', maxSpendTokens: '5.01' });
  assert.equal(prepared.action, 'reset-allowance');
  let outer = decodeFunctionData({ abi: EXECUTE_ABI, data: prepared.transaction.data });
  let inner = decodeFunctionData({ abi: ERC20_ABI, data: outer.args[2] });
  assert.deepEqual(inner.args, [ADAPTOR, 0n]);

  allowance = 0n;
  prepared = await service.prepareRepayment({ sessionKey: 'session-1', identity: identity(), loanId: 'loan-1', maxSpendTokens: '5.01' });
  assert.equal(prepared.action, 'set-allowance');
  outer = decodeFunctionData({ abi: EXECUTE_ABI, data: prepared.transaction.data });
  inner = decodeFunctionData({ abi: ERC20_ABI, data: outer.args[2] });
  assert.deepEqual(inner.args, [ADAPTOR, 5_010_000n]);

  allowance = 5_010_000n;
  prepared = await service.prepareRepayment({ sessionKey: 'session-1', identity: identity(), loanId: 'loan-1', maxSpendTokens: '5.01' });
  assert.equal(prepared.action, 'repay');
  outer = decodeFunctionData({ abi: EXECUTE_ABI, data: prepared.transaction.data });
  inner = decodeFunctionData({ abi: PAYMENT_ABI, data: outer.args[2] });
  assert.equal(inner.args[0].toLowerCase(), ACCOUNT);
  assert.deepEqual(inner.args.slice(1), [7n, MAX_UINT256]);
  const refreshed = await service.refreshRepayment({ sessionKey: 'session-1', identity: identity(), loanId: 'loan-1' });
  assert.equal(refreshed.loan.id, 'loan-1');
  assert.equal(fixture.calls.filter((call) => call.key === 'POST /api/chain/indexer').length, 1);
});

test('Credifi challenge must bind the exact Looper, domain, Base chain, fresh nonce, and timestamp', async () => {
  const fixture = createFetchFixture({ challengeMessage: loginMessage('0x3333333333333333333333333333333333333333') });
  const service = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: fixture.fetchImpl, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await assert.rejects(
    () => service.requestLoginChallenge({ sessionKey: 'session-1', identity: identity() }),
    error => error.code === 'login_challenge_mismatch' && error.status === 422,
  );
});

test('authorization rejects non-canonical calldata and non-Base-USDC vault identity', async () => {
  const trailingFixture = createFetchFixture({ authorizationData: TXN_DATA + '00'.repeat(32) });
  trailingFixture.setCommitmentStatus('accepted');
  const trailingService = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: trailingFixture.fetchImpl, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await login(trailingService);
  await assert.rejects(
    () => trailingService.prepareAuthorization({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1' }),
    error => error.code === 'authorization_policy_mismatch',
  );

  const assetFixture = createFetchFixture({ assetAddress: '0x4444444444444444444444444444444444444444' });
  assetFixture.setCommitmentStatus('accepted');
  const assetService = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: assetFixture.fetchImpl, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await login(assetService);
  await assert.rejects(
    () => assetService.prepareAuthorization({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1' }),
    error => error.code === 'market_policy_mismatch',
  );
});

test('concurrent borrow requests consume a quote atomically before any provider submission await', async () => {
  let releaseCreate;
  let enteredCreate;
  const entered = new Promise((resolve) => { enteredCreate = resolve; });
  const pending = new Promise((resolve) => { releaseCreate = resolve; });
  const fixture = createFetchFixture({ authorization: true, createLoanImpl: async () => { enteredCreate(); await pending; return json({ loan: { id: 'loan-1', status: 'approved', amount: 5, marketId: market().marketId, disburseTo: ACCOUNT, disbursement: { chainId: 8453, marketId: market().marketId, loanOwner: ACCOUNT, tokenAddress: USDC } } }); } });
  fixture.setCommitmentStatus('accepted');
  const service = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: fixture.fetchImpl, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await login(service);
  const preview = await service.previewLoan({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1', amount: 5, maxAprPercent: 25 });
  const request = { sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1', quoteId: 'quote-1', quoteSha256: preview.quoteSha256, confirmBorrow: true };
  const first = service.createLoan(request);
  await entered;
  await assert.rejects(() => service.createLoan(request), error => error.code === 'quote_consumed');
  releaseCreate();
  await first;
  assert.equal(fixture.calls.filter((call) => call.key === 'POST /api/v4/loans/create').length, 1);
});

test('an indeterminate borrow locks all later quotes for the Looper', async () => {
  const fixture = createFetchFixture({ authorization: true, createLoanImpl: async () => { throw new Error('provider connection dropped after submit'); } });
  fixture.setCommitmentStatus('accepted');
  const service = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: fixture.fetchImpl, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await login(service);
  const preview = await service.previewLoan({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1', amount: 5, maxAprPercent: 25 });
  await assert.rejects(
    () => service.createLoan({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1', quoteId: 'quote-1', quoteSha256: preview.quoteSha256, confirmBorrow: true }),
    error => error.code === 'loan_creation_indeterminate' && error.details === undefined,
  );
  await assert.rejects(
    () => service.previewLoan({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1', amount: 5, maxAprPercent: 25 }),
    error => error.code === 'borrow_reconciliation_required',
  );
  const overview = await service.getOverview({ sessionKey: 'session-1', identity: identity() });
  assert.equal(overview.borrowing.status, 'RECONCILIATION_REQUIRED');
});

test('quote arithmetic must reconcile principal, proceeds, schedule, and total repayment', async () => {
  const inconsistent = quote();
  inconsistent.fee.netProceedsMicro = 4_999_999;
  const fixture = createFetchFixture({ authorization: true, quotePayload: inconsistent });
  fixture.setCommitmentStatus('accepted');
  const service = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: fixture.fetchImpl, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await login(service);
  await assert.rejects(
    () => service.previewLoan({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1', amount: 5, maxAprPercent: 25 }),
    error => error.code === 'quote_amount_mismatch',
  );
});


test('concurrent vouch acceptance is serialized before provider mutation', async () => {
  let releaseAction;
  let enteredAction;
  const entered = new Promise((resolve) => { enteredAction = resolve; });
  const pending = new Promise((resolve) => { releaseAction = resolve; });
  const fixture = createFetchFixture({ vouchActionImpl: async () => { enteredAction(); await pending; } });
  const service = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: fixture.fetchImpl, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await login(service);
  const first = service.acceptVouch({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1' });
  await entered;
  await assert.rejects(
    () => service.acceptVouch({ sessionKey: 'session-1', identity: identity(), commitmentId: 'vouch-1' }),
    error => error.code === 'vouch_action_in_progress',
  );
  releaseAction();
  await first;
  assert.equal(fixture.calls.filter((call) => call.key === 'POST /api/vouch/action').length, 1);
});


test('provider-controlled errors are projected locally without bearer or diagnostic leakage', async () => {
  const fixture = createFetchFixture({ failFlags: true });
  const service = createConsoleCreditService({ allowedTokenIds: ['2431'], fetchImpl: fixture.fetchImpl, now: () => Date.parse('2026-10-21T22:30:00.000Z') });
  await login(service);
  await assert.rejects(
    () => service.getOverview({ sessionKey: 'session-1', identity: identity() }),
    error => error.code === 'credit_provider_unavailable' && !JSON.stringify(error).includes('secret-bearer-token') && error.details === undefined,
  );
});
