import type { JsonSchemaDocument } from '@helixa/multipass-types';

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult<T = unknown> {
  ok: boolean;
  value: T;
  errors: ValidationIssue[];
}

export class MultipassValidationError extends Error {
  schemaName: string;
  errors: ValidationIssue[];
  constructor(schemaName: string, errors: ValidationIssue[]);
}

export type SchemaName =
  | 'multipass-profile'
  | 'identity-fragment'
  | 'agent-card'
  | 'standards-profile'
  | 'x402-manifest'
  | 'x401-manifest'
  | 'receipt-fragment';

export function getSchema(schemaName: string): JsonSchemaDocument | null;
export function validate<T = unknown>(schemaName: SchemaName, value: T): ValidationResult<T>;
export function assertValid<T = unknown>(schemaName: SchemaName, value: T): T;
export function parseJsonForSchema<T = unknown>(schemaName: SchemaName, json: string): T;
export function loadJsonFileForSchema<T = unknown>(schemaName: SchemaName, filePath: string): Promise<T>;

export function validateMultipassProfile<T = unknown>(value: T): ValidationResult<T>;
export function validateIdentityFragment<T = unknown>(value: T): ValidationResult<T>;
export function validateAgentCard<T = unknown>(value: T): ValidationResult<T>;
export function validateStandardsProfile<T = unknown>(value: T): ValidationResult<T>;
export function validateX402Manifest<T = unknown>(value: T): ValidationResult<T>;
export function validateX401Manifest<T = unknown>(value: T): ValidationResult<T>;
export function validateReceiptFragment<T = unknown>(value: T): ValidationResult<T>;

export function assertMultipassProfile<T = unknown>(value: T): T;
export function assertIdentityFragment<T = unknown>(value: T): T;
export function assertAgentCard<T = unknown>(value: T): T;
export function assertStandardsProfile<T = unknown>(value: T): T;
export function assertX402Manifest<T = unknown>(value: T): T;
export function assertX401Manifest<T = unknown>(value: T): T;
export function assertReceiptFragment<T = unknown>(value: T): T;

export function parseMultipassProfileJson<T = unknown>(json: string): T;
export function parseIdentityFragmentJson<T = unknown>(json: string): T;
export function parseAgentCardJson<T = unknown>(json: string): T;
export function parseStandardsProfileJson<T = unknown>(json: string): T;
export function parseX402ManifestJson<T = unknown>(json: string): T;
export function parseX401ManifestJson<T = unknown>(json: string): T;
export function parseReceiptFragmentJson<T = unknown>(json: string): T;

export function loadMultipassProfileFromFile<T = unknown>(filePath: string): Promise<T>;
export function loadIdentityFragmentFromFile<T = unknown>(filePath: string): Promise<T>;
export function loadAgentCardFromFile<T = unknown>(filePath: string): Promise<T>;
export function loadStandardsProfileFromFile<T = unknown>(filePath: string): Promise<T>;
export function loadX402ManifestFromFile<T = unknown>(filePath: string): Promise<T>;
export function loadX401ManifestFromFile<T = unknown>(filePath: string): Promise<T>;
export function loadReceiptFragmentFromFile<T = unknown>(filePath: string): Promise<T>;

export const agentCardSchema: JsonSchemaDocument;
export const identityFragmentSchema: JsonSchemaDocument;
export const multipassProfileSchema: JsonSchemaDocument;
export const receiptFragmentSchema: JsonSchemaDocument;
export const standardsProfileSchema: JsonSchemaDocument;
export const x402ManifestSchema: JsonSchemaDocument;
export const x401ManifestSchema: JsonSchemaDocument;

export function getMultipassProfile<T = unknown>(identifier: string, options?: Record<string, unknown>): Promise<T>;
export function getAgentCard<T = unknown>(identifier: string, options?: Record<string, unknown>): Promise<T>;
export function getPublicFragments<T = unknown>(identifier: string, options?: Record<string, unknown>): Promise<T[]>;
export function getStandardsProfile<T = unknown>(identifier: string, options?: Record<string, unknown>): Promise<T>;
export function getX402Manifest<T = unknown>(identifier: string, options?: Record<string, unknown>): Promise<T>;
export function getX401Manifest<T = unknown>(identifier: string, options?: Record<string, unknown>): Promise<T>;
export function getReceiptFragment<T = unknown>(identifier: string, receiptId: string, options?: Record<string, unknown>): Promise<T>;
export function resolveMultipass<T = unknown>(agent: string, options?: Record<string, unknown>): Promise<T>;
export function searchMultipass<T = unknown>(query: string, options?: Record<string, unknown>): Promise<T>;
export function isClaimed(profile: unknown): boolean;
export function getActivationSummary<T = unknown>(profile: T): {
  multipassId: unknown;
  slug: unknown;
  displayName: unknown;
  status: unknown;
  ownerState: unknown;
  verificationStatus: unknown;
  trustState: unknown;
  publicFragmentCount: number;
  supportedStandards: unknown;
  paidEndpointsEnabled: unknown;
};
