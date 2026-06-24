import type {
  ValidationIssue,
} from '@helixa/multipass-sdk';

export interface MemoryStoreInput {
  profiles?: unknown[];
  fragments?: unknown[];
  agentCards?: unknown[];
  standardsProfiles?: unknown[];
  x402Manifests?: unknown[];
  receiptFragments?: unknown[];
}

export interface MemoryStore {
  resolveProfile(identifier: string): unknown | null;
  getPublicFragments(multipassId: string): unknown[];
  getAgentCard(multipassId: string): unknown | null;
  getStandardsProfile(multipassId: string): unknown | null;
  getX402Manifest(multipassId: string): unknown | null;
  getReceiptFragment(multipassId: string, receiptId: string): unknown | null;
}

export interface MultipassApiOptions {
  store: MemoryStore;
  baseUrl?: string;
}

export interface MultipassApi {
  handleRequest(request: Request): Promise<Response>;
}

export interface ApiErrorBody {
  schema_version: string;
  error: {
    code: string;
    message: string;
    issues?: ValidationIssue[];
  };
}

export function createMemoryStore(input?: MemoryStoreInput): MemoryStore;
export function createMultipassApi(options: MultipassApiOptions): MultipassApi;
