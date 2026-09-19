import assert from 'node:assert/strict';
import test from 'node:test';

import {
  averageRational,
  formatPercentOverFloor,
  formatRatio,
  formatRational,
  isAverageAtOrAboveThreshold,
  parseBoundedDecimal,
  parseMultiplier,
  parsePaymentAmount,
  ratioRational,
  sumRationals,
} from '../src/loopers-sales/money.js';

test('parseBoundedDecimal preserves an exact bounded decimal lexeme', () => {
  assert.deepEqual(
    parseBoundedDecimal('0.0088', { maxIntegerDigits: 30, maxFractionDigits: 36 }),
    { numerator: 88n, scale: 10000n },
  );
  assert.deepEqual(
    parseBoundedDecimal('12', { maxIntegerDigits: 30, maxFractionDigits: 36 }),
    { numerator: 12n, scale: 1n },
  );
});

test('parseBoundedDecimal rejects non-canonical and out-of-bounds lexemes', () => {
  const options = { maxIntegerDigits: 30, maxFractionDigits: 36 };
  for (const value of ['-1', '+1', '1e2', '01', '1.', '.1', '1.0000000000000000000000000000000000000']) {
    assert.throws(() => parseBoundedDecimal(value, options), { name: 'TypeError' });
  }
  assert.throws(() => parseBoundedDecimal('1'.repeat(31), options), { name: 'TypeError' });
});

test('parsePaymentAmount preserves declared decimal scales above 18', () => {
  assert.deepEqual(
    parsePaymentAmount({ quantity: '6100000000000000', decimals: 18 }),
    { numerator: 6100000000000000n, scale: 10n ** 18n },
  );
  assert.deepEqual(
    parsePaymentAmount({ quantity: '1', decimals: 36 }),
    { numerator: 1n, scale: 10n ** 36n },
  );
});

test('parsePaymentAmount rejects invalid quantities and decimal bounds', () => {
  for (const input of [
    { quantity: '0', decimals: 18 },
    { quantity: '-1', decimals: 18 },
    { quantity: '+1', decimals: 18 },
    { quantity: '1e2', decimals: 18 },
    { quantity: '1.0', decimals: 18 },
    { quantity: '1'.repeat(97), decimals: 18 },
    { quantity: '1', decimals: -1 },
    { quantity: '1', decimals: 37 },
    { quantity: '1', decimals: 1.5 },
  ]) {
    assert.throws(() => parsePaymentAmount(input), { name: 'TypeError' });
  }
});

test('parseMultiplier reduces exact values and accepts the inclusive boundaries', () => {
  assert.deepEqual(parseMultiplier('1'), { numerator: 1n, denominator: 1n });
  assert.deepEqual(parseMultiplier('1.25'), { numerator: 5n, denominator: 4n });
  assert.deepEqual(parseMultiplier('1.375'), { numerator: 11n, denominator: 8n });
  assert.deepEqual(parseMultiplier('100'), { numerator: 100n, denominator: 1n });
});

test('parseMultiplier rejects fractions beyond six digits and values outside 1 through 100', () => {
  for (const value of ['0.999999', '100.000001', '1.0000000', '-1', '+1', '1e1', '01']) {
    assert.throws(() => parseMultiplier(value), { name: 'TypeError' });
  }
});

test('sumRationals uses the least sufficient common scale without losing raw units', () => {
  assert.deepEqual(
    sumRationals([
      { numerator: 61n, scale: 10000n },
      { numerator: 53n, scale: 10000n },
    ]),
    { numerator: 114n, scale: 10000n },
  );
  assert.deepEqual(
    sumRationals([
      { numerator: 1n, scale: 10n },
      { numerator: 2n, scale: 1000n },
    ]),
    { numerator: 102n, scale: 1000n },
  );
});

test('averageRational and ratioRational reduce exact rational results', () => {
  assert.deepEqual(averageRational({ numerator: 1n, scale: 1n }, 3n), { numerator: 1n, scale: 3n });
  assert.deepEqual(
    ratioRational({ numerator: 15n, scale: 10n }, { numerator: 1n, scale: 1n }),
    { numerator: 3n, scale: 2n },
  );
});

test('premium threshold comparison is exact at the boundary and one raw unit below', () => {
  const floor = { numerator: 1n, scale: 100n };
  const multiplier = parseMultiplier('1.25');

  assert.equal(isAverageAtOrAboveThreshold({
    total: { numerator: 125n, scale: 10000n },
    itemCount: 1n,
    floor,
    multiplier,
  }), true);
  assert.equal(isAverageAtOrAboveThreshold({
    total: { numerator: 124n, scale: 10000n },
    itemCount: 1n,
    floor,
    multiplier,
  }), false);
});

test('formatRational rounds half up and trims insignificant trailing zeroes', () => {
  assert.equal(formatRational({ numerator: 1234567895n, scale: 1000000000n }, { maxFractionDigits: 8 }), '1.2345679');
  assert.equal(formatRational({ numerator: 1500000000n, scale: 1000000000n }, { maxFractionDigits: 8 }), '1.5');
  assert.equal(formatRational({ numerator: 1n, scale: 3n }, { maxFractionDigits: 8 }), '0.33333333');
});

test('formatRatio and formatPercentOverFloor use fixed precision and half-up ties', () => {
  assert.equal(formatRatio({ numerator: 201n, scale: 200n }, { fractionDigits: 2 }), '1.01×');
  assert.equal(formatPercentOverFloor({ numerator: 2001n, scale: 2000n }, { fractionDigits: 1 }), '0.1%');
  assert.equal(formatPercentOverFloor({ numerator: 3n, scale: 2n }, { fractionDigits: 1 }), '50.0%');
});

test('formatPercentOverFloor rejects negative percentages', () => {
  assert.throws(
    () => formatPercentOverFloor({ numerator: 99n, scale: 100n }, { fractionDigits: 1 }),
    { name: 'RangeError' },
  );
});
