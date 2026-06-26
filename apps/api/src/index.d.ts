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
  getChangeLog?(multipassId: string): unknown;
}

export interface SavedRecordsStore extends MemoryStore {
  saveActivatedRecord(record: unknown): unknown;
  getSourceContext?(multipassId: string): unknown;
  createClaimNonce(identifier: string, options?: Record<string, unknown>): unknown;
  consumeClaimNonce(nonce: string, options?: Record<string, unknown>): { message: string } & Record<string, unknown>;
  createManualReviewRequest(identifier: string, input?: Record<string, unknown>): unknown;
  approveManualReviewClaim(identifier: string, claimId: string, input?: Record<string, unknown>): unknown;
  markOwnerWalletVerified(identifier: string, input?: Record<string, unknown>): unknown;
  getClaimState(multipassId: string): { status: string } & Record<string, unknown>;
  findApprovedManagerClaim(multipassId: string, wallet: string): unknown | null;
  createManagerSession(identifier: string, input?: Record<string, unknown>): { sessionId: string; csrfToken: string; expires_at: string; multipass_id: string };
  validateManagerSession(input?: Record<string, unknown>): Record<string, unknown>;
  revokeManagerSession(sessionId: string, input?: Record<string, unknown>): void;
  updatePublicProfile(identifier: string, edits?: Record<string, unknown>, input?: Record<string, unknown>): unknown;
}

export type SignatureVerifier = (input: { wallet: string; message: string; signature: string }) => boolean | Promise<boolean>;

export interface MultipassApiOptions {
  store: MemoryStore;
  baseUrl?: string;
  savedRecords?: SavedRecordsStore;
  activationService?: (agent: string) => Promise<unknown> | unknown;
  allowedOrigins?: string[];
  adminSecret?: string | null;
  signatureVerifier?: SignatureVerifier;
  cookieSecure?: boolean;
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
