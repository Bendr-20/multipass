const MAX_DEPTH = 64;
const MAX_CONTAINER_ITEMS = 10_000;

export function canonicalizeRestapNetworkJson(value) {
  const ancestors = new Set();
  return encode(value, 0, ancestors);
}

function encode(value, depth, ancestors) {
  if (depth > MAX_DEPTH) throw new TypeError('JCS value exceeds maximum depth.');
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    assertValidUnicode(value, 'JCS string');
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('JCS numbers must be finite.');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new TypeError('JCS contains a non-JSON value.');
  if (ancestors.has(value)) throw new TypeError('JCS contains a cycle.');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      assertJsonArrayShape(value);
      const items = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new TypeError('JCS arrays must not be sparse.');
        items.push(encode(value[index], depth + 1, ancestors));
      }
      return '[' + items.join(',') + ']';
    }
    assertPlainObject(value, 'JCS object');
    assertJsonObjectShape(value);
    const entries = [];
    for (const key of Object.keys(value).sort(compareUtf16)) {
      assertValidUnicode(key, 'JCS object key');
      entries.push(JSON.stringify(key) + ':' + encode(value[key], depth + 1, ancestors));
    }
    return '{' + entries.join(',') + '}';
  } finally {
    ancestors.delete(value);
  }
}

function compareUtf16(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertValidUnicode(value, label) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError(label + ' contains a lone surrogate.');
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError(label + ' contains a lone surrogate.');
    }
  }
}

function assertPlainObject(value, label) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(label + ' must be a plain object.');
}

function assertJsonArrayShape(value) {
  if (value.length > MAX_CONTAINER_ITEMS) throw new TypeError('JCS array is too large.');
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length) {
      throw new TypeError('JCS arrays must contain only JSON indices.');
    }
  }
}

function assertJsonObjectShape(value) {
  const keys = Reflect.ownKeys(value);
  if (keys.length > MAX_CONTAINER_ITEMS) throw new TypeError('JCS object is too large.');
  for (const key of keys) {
    if (typeof key !== 'string') throw new TypeError('JCS objects must not contain symbol keys.');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError('JCS objects must contain enumerable data properties only.');
  }
}
