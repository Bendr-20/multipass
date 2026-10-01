import { createHash } from 'node:crypto';

export function canonicalJsonStringify(value) {
  return serializeCanonicalValue(value, new Set());
}

export function canonicalJsonHash(value) {
  return createHash('sha256').update(canonicalJsonStringify(value), 'utf8').digest('hex');
}

function serializeCanonicalValue(value, ancestors) {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError('Canonical JSON requires finite numbers');
      }
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object':
      return serializeCanonicalContainer(value, ancestors);
    default:
      throw new TypeError(`Canonical JSON does not support values of type ${typeof value}`);
  }
}

function serializeCanonicalContainer(value, ancestors) {
  if (ancestors.has(value)) {
    throw new TypeError('Canonical JSON does not support cyclic values');
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return serializeCanonicalArray(value, ancestors);
    }
    return serializeCanonicalObject(value, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function serializeCanonicalArray(value, ancestors) {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw new TypeError('Canonical JSON does not support sparse arrays');
    }
  }

  return `[${value.map((item) => serializeCanonicalValue(item, ancestors)).join(',')}]`;
}

function serializeCanonicalObject(value, ancestors) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Canonical JSON supports only plain objects and arrays');
  }

  const keys = Object.keys(value).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${serializeCanonicalValue(value[key], ancestors)}`,
  );
  return `{${entries.join(',')}}`;
}
