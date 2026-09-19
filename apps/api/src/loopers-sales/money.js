function requireBoundedInteger(value, name, { minimum = 0 } = {}) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new TypeError(`${name} must be an integer at least ${minimum}`);
  }
  return value;
}

function powerOfTen(exponent) {
  return 10n ** BigInt(exponent);
}

function greatestCommonDivisor(left, right) {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function leastCommonMultiple(left, right) {
  return (left / greatestCommonDivisor(left, right)) * right;
}

function requireRational(value, name = 'value') {
  if (!value || typeof value !== 'object' || typeof value.numerator !== 'bigint' || typeof value.scale !== 'bigint') {
    throw new TypeError(`${name} must contain BigInt numerator and scale values`);
  }
  if (value.numerator < 0n) {
    throw new RangeError(`${name}.numerator must not be negative`);
  }
  if (value.scale <= 0n) {
    throw new RangeError(`${name}.scale must be positive`);
  }
  return value;
}

function reduceRational(numerator, scale) {
  const divisor = greatestCommonDivisor(numerator, scale);
  return {
    numerator: numerator / divisor,
    scale: scale / divisor,
  };
}

function formatFixed(numerator, scale, fractionDigits) {
  requireBoundedInteger(fractionDigits, 'fractionDigits');
  if (numerator < 0n || scale <= 0n) {
    throw new RangeError('formatted rational values must be non-negative with a positive scale');
  }

  const displayScale = powerOfTen(fractionDigits);
  const scaledNumerator = numerator * displayScale;
  let rounded = scaledNumerator / scale;
  const remainder = scaledNumerator % scale;
  if (remainder * 2n >= scale) rounded += 1n;

  if (fractionDigits === 0) return rounded.toString();
  const digits = rounded.toString().padStart(fractionDigits + 1, '0');
  return `${digits.slice(0, -fractionDigits)}.${digits.slice(-fractionDigits)}`;
}

export function parseBoundedDecimal(value, { maxIntegerDigits, maxFractionDigits } = {}) {
  requireBoundedInteger(maxIntegerDigits, 'maxIntegerDigits', { minimum: 1 });
  requireBoundedInteger(maxFractionDigits, 'maxFractionDigits');
  if (typeof value !== 'string') throw new TypeError('decimal value must be a string');

  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new TypeError('decimal value must use canonical decimal notation');
  const integerDigits = match[1];
  const fractionDigits = match[2] ?? '';
  if (integerDigits.length > maxIntegerDigits || fractionDigits.length > maxFractionDigits) {
    throw new TypeError('decimal value exceeds configured digit bounds');
  }

  return {
    numerator: BigInt(`${integerDigits}${fractionDigits}`),
    scale: powerOfTen(fractionDigits.length),
  };
}

export function parsePaymentAmount({ quantity, decimals } = {}) {
  requireBoundedInteger(decimals, 'decimals');
  if (decimals > 36) throw new TypeError('decimals must not exceed 36');
  if (typeof quantity !== 'string' || !/^\d{1,96}$/.test(quantity)) {
    throw new TypeError('quantity must contain between 1 and 96 decimal digits');
  }

  const numerator = BigInt(quantity);
  if (numerator <= 0n) throw new TypeError('quantity must be positive');
  return { numerator, scale: powerOfTen(decimals) };
}

export function parseMultiplier(value) {
  const parsed = parseBoundedDecimal(value, { maxIntegerDigits: 3, maxFractionDigits: 6 });
  if (parsed.numerator < parsed.scale || parsed.numerator > 100n * parsed.scale) {
    throw new TypeError('multiplier must be between 1 and 100');
  }
  const reduced = reduceRational(parsed.numerator, parsed.scale);
  return { numerator: reduced.numerator, denominator: reduced.scale };
}

export function sumRationals(values) {
  if (!Array.isArray(values)) throw new TypeError('values must be an array');
  if (values.length === 0) return { numerator: 0n, scale: 1n };

  const rationals = values.map((value, index) => requireRational(value, `values[${index}]`));
  const scale = rationals.reduce(
    (commonScale, value) => leastCommonMultiple(commonScale, value.scale),
    1n,
  );
  const numerator = rationals.reduce(
    (total, value) => total + value.numerator * (scale / value.scale),
    0n,
  );
  return { numerator, scale };
}

export function averageRational(total, itemCount) {
  requireRational(total, 'total');
  if (typeof itemCount !== 'bigint' || itemCount <= 0n) {
    throw new TypeError('itemCount must be a positive BigInt');
  }
  return reduceRational(total.numerator, total.scale * itemCount);
}

export function ratioRational(value, reference) {
  requireRational(value, 'value');
  requireRational(reference, 'reference');
  if (reference.numerator <= 0n) throw new RangeError('reference must be positive');
  return reduceRational(value.numerator * reference.scale, value.scale * reference.numerator);
}

export function isAverageAtOrAboveThreshold({ total, itemCount, floor, multiplier } = {}) {
  requireRational(total, 'total');
  requireRational(floor, 'floor');
  if (typeof itemCount !== 'bigint' || itemCount <= 0n) {
    throw new TypeError('itemCount must be a positive BigInt');
  }
  if (floor.numerator <= 0n) throw new RangeError('floor must be positive');
  if (!multiplier || typeof multiplier.numerator !== 'bigint' || typeof multiplier.denominator !== 'bigint') {
    throw new TypeError('multiplier must contain BigInt numerator and denominator values');
  }
  if (multiplier.numerator <= 0n || multiplier.denominator <= 0n) {
    throw new RangeError('multiplier values must be positive');
  }

  const left = total.numerator * floor.scale * multiplier.denominator;
  const right = floor.numerator * multiplier.numerator * total.scale * itemCount;
  return left >= right;
}

export function formatRational(value, { maxFractionDigits = 8 } = {}) {
  requireRational(value);
  requireBoundedInteger(maxFractionDigits, 'maxFractionDigits');
  const formatted = formatFixed(value.numerator, value.scale, maxFractionDigits);
  if (!formatted.includes('.')) return formatted;
  return formatted.replace(/0+$/, '').replace(/\.$/, '');
}

export function formatRatio(value, { fractionDigits = 2 } = {}) {
  requireRational(value);
  return `${formatFixed(value.numerator, value.scale, fractionDigits)}×`;
}

export function formatPercentOverFloor(value, { fractionDigits = 1 } = {}) {
  requireRational(value);
  if (value.numerator < value.scale) throw new RangeError('ratio must not be below floor');
  return `${formatFixed((value.numerator - value.scale) * 100n, value.scale, fractionDigits)}%`;
}
