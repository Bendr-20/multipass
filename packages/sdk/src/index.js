import { readFile } from 'node:fs/promises';

import {
  agentCardSchema,
  identityFragmentSchema,
  multipassProfileSchema,
  receiptFragmentSchema,
  schemaRegistry,
  standardsProfileSchema,
  x402ManifestSchema,
} from '@helixa/multipass-types';

const schemaByName = new Map(schemaRegistry.map((entry) => [entry.name, entry.schema]));

export class MultipassValidationError extends Error {
  constructor(schemaName, errors) {
    super(formatValidationMessage(schemaName, errors));
    this.name = 'MultipassValidationError';
    this.schemaName = schemaName;
    this.errors = errors;
  }
}

export function getSchema(schemaName) {
  return schemaByName.get(schemaName) ?? null;
}

export function validate(schemaName, value) {
  const schema = getSchema(schemaName);
  if (!schema) {
    return {
      ok: false,
      value,
      errors: [{ path: '$', message: `unknown schema: ${schemaName}` }],
    };
  }

  const errors = collectErrors(schema, value, '');
  return {
    ok: errors.length === 0,
    value,
    errors,
  };
}

export function assertValid(schemaName, value) {
  const result = validate(schemaName, value);
  if (!result.ok) {
    throw new MultipassValidationError(schemaName, result.errors);
  }
  return value;
}

export function parseJsonForSchema(schemaName, json) {
  let value;
  try {
    value = JSON.parse(json);
  } catch (error) {
    throw new MultipassValidationError(schemaName, [
      { path: '$', message: `invalid JSON: ${error.message}` },
    ]);
  }
  return assertValid(schemaName, value);
}

export async function loadJsonFileForSchema(schemaName, filePath) {
  return parseJsonForSchema(schemaName, await readFile(filePath, 'utf8'));
}

export const validateMultipassProfile = (value) => validate('multipass-profile', value);
export const validateIdentityFragment = (value) => validate('identity-fragment', value);
export const validateAgentCard = (value) => validate('agent-card', value);
export const validateStandardsProfile = (value) => validate('standards-profile', value);
export const validateX402Manifest = (value) => validate('x402-manifest', value);
export const validateReceiptFragment = (value) => validate('receipt-fragment', value);

export const assertMultipassProfile = (value) => assertValid('multipass-profile', value);
export const assertIdentityFragment = (value) => assertValid('identity-fragment', value);
export const assertAgentCard = (value) => assertValid('agent-card', value);
export const assertStandardsProfile = (value) => assertValid('standards-profile', value);
export const assertX402Manifest = (value) => assertValid('x402-manifest', value);
export const assertReceiptFragment = (value) => assertValid('receipt-fragment', value);

export const parseMultipassProfileJson = (json) => parseJsonForSchema('multipass-profile', json);
export const parseIdentityFragmentJson = (json) => parseJsonForSchema('identity-fragment', json);
export const parseAgentCardJson = (json) => parseJsonForSchema('agent-card', json);
export const parseStandardsProfileJson = (json) => parseJsonForSchema('standards-profile', json);
export const parseX402ManifestJson = (json) => parseJsonForSchema('x402-manifest', json);
export const parseReceiptFragmentJson = (json) => parseJsonForSchema('receipt-fragment', json);

export const loadMultipassProfileFromFile = (filePath) => loadJsonFileForSchema('multipass-profile', filePath);
export const loadIdentityFragmentFromFile = (filePath) => loadJsonFileForSchema('identity-fragment', filePath);
export const loadAgentCardFromFile = (filePath) => loadJsonFileForSchema('agent-card', filePath);
export const loadStandardsProfileFromFile = (filePath) => loadJsonFileForSchema('standards-profile', filePath);
export const loadX402ManifestFromFile = (filePath) => loadJsonFileForSchema('x402-manifest', filePath);
export const loadReceiptFragmentFromFile = (filePath) => loadJsonFileForSchema('receipt-fragment', filePath);

export {
  agentCardSchema,
  identityFragmentSchema,
  multipassProfileSchema,
  receiptFragmentSchema,
  standardsProfileSchema,
  x402ManifestSchema,
};

function formatValidationMessage(schemaName, errors) {
  const first = errors[0];
  if (!first) {
    return `${schemaName} validation failed`;
  }
  return `${schemaName} validation failed at ${first.path}: ${first.message}`;
}

function collectErrors(schema, value, path) {
  const errors = [];

  if (schema.anyOf) {
    const branchErrors = schema.anyOf.map((branch) => collectErrors(branch, value, path));
    if (branchErrors.some((branch) => branch.length === 0)) {
      return [];
    }
    return [{ path: displayPath(path), message: 'did not match any allowed schema shape' }];
  }

  if (!matchesType(schema.type, value)) {
    errors.push({ path: displayPath(path), message: `expected ${describeType(schema.type)}` });
    return errors;
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push({ path: displayPath(path), message: `expected ${JSON.stringify(schema.const)}` });
  }

  if (schema.enum && !schema.enum.some((item) => item === value)) {
    errors.push({ path: displayPath(path), message: `expected one of ${schema.enum.map(String).join(', ')}` });
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ path: displayPath(path), message: `expected at least ${schema.minLength} characters` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({ path: displayPath(path), message: `expected at most ${schema.maxLength} characters` });
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push({ path: displayPath(path), message: `expected to match pattern ${schema.pattern}` });
    }
    if (schema.format === 'uri' && !isValidUrl(value)) {
      errors.push({ path: displayPath(path), message: 'expected URI' });
    }
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) {
      errors.push({ path: displayPath(path), message: 'expected date-time' });
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({ path: displayPath(path), message: `expected >= ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({ path: displayPath(path), message: `expected <= ${schema.maximum}` });
    }
  }

  if (Array.isArray(value)) {
    if (schema.items) {
      for (const [index, item] of value.entries()) {
        errors.push(...collectErrors(schema.items, item, `${path}[${index}]`));
      }
    }
    return errors;
  }

  if (isPlainObject(value)) {
    const properties = schema.properties ?? {};
    for (const requiredKey of schema.required ?? []) {
      if (!Object.hasOwn(value, requiredKey)) {
        errors.push({ path: joinPath(path, requiredKey), message: 'is required' });
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) {
          errors.push({ path: joinPath(path, key), message: 'is not allowed' });
        }
      }
    }

    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) {
        errors.push(...collectErrors(propertySchema, value[key], joinPath(path, key)));
      }
    }
  }

  return errors;
}

function matchesType(type, value) {
  if (type === undefined) {
    return true;
  }
  if (Array.isArray(type)) {
    return type.some((candidate) => matchesType(candidate, value));
  }
  if (type === 'null') {
    return value === null;
  }
  if (type === 'array') {
    return Array.isArray(value);
  }
  if (type === 'object') {
    return isPlainObject(value);
  }
  if (type === 'integer') {
    return Number.isInteger(value);
  }
  return typeof value === type;
}

function describeType(type) {
  return Array.isArray(type) ? type.join(' or ') : type;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function joinPath(base, key) {
  return base ? `${base}.${key}` : key;
}

function displayPath(path) {
  return path || '$';
}

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
