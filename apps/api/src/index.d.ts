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
  getTools(multipassId: string): unknown;
  getAgentCard(multipassId: string, options?: { baseUrl?: string }): unknown | null;
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

export interface LooperCodexRuntime {
  available: boolean;
  status: {
    available: boolean;
    schemaVersion?: string;
    artifactHash?: string;
    codexVersion?: string;
    count?: number;
    reason?: string;
  };
  query(operation: string, input: unknown): unknown;
}

export interface MultipassLogger {
  info?(event: Record<string, unknown>): void;
  warn?(event: Record<string, unknown>): void;
}

export interface MultipassApiOptions {
  store: MemoryStore;
  baseUrl?: string;
  savedRecords?: SavedRecordsStore;
  activationService?: (agent: string) => Promise<unknown> | unknown;
  allowedOrigins?: string[];
  adminSecret?: string | null;
  signatureVerifier?: SignatureVerifier;
  cookieSecure?: boolean;
  fetchImpl?: typeof fetch;
  loopersAllowlist?: unknown;
  loopersAllowlistSnapshot?: unknown;
  loopersAllowlistRateLimit?: unknown;
  loopersAllowlistSubnetRateLimit?: unknown;
  loopersTurnstileSecretKey?: string | null;
  loopersOwnedAgentLoader?: (input: { address: string }) => Promise<unknown[]>;
  loopersOwnedRpcUrl?: string;
  loopersOwnedMetadataBaseUrl?: string;
  loopersPublicClients?: unknown[];
  loopersAuthorizer?: (input: { tokenId: string; wallet: string }) => Promise<Record<string, unknown>>;
  consoleAuthStore?: unknown;
  consoleRuntimeRegistry?: unknown;
  bankrLlmKey?: string | null;
  bankrLlmModel?: string | null;
  bankrLlmVisionModel?: string | null;
  consoleAgentBankrLlmEnabled?: boolean;
  consoleSkillProposalsEnabled?: boolean;
  consoleMarketReadEnabled?: boolean;
  consoleAccountReadEnabled?: boolean;
  consoleXmtpEnabled?: boolean;
  consoleXmtpEnv?: string;
  consoleXmtpWalletKey?: string | null;
  consoleXmtpDbPath?: string | null;
  consoleXmtpDbEncryptionKey?: string | Uint8Array | null;
  consoleXmtpHistorySyncUrl?: string | null;
  consoleXmtpApiUrl?: string | null;
  consoleXmtpGatewayHost?: string | null;
  consoleXmtpAppVersion?: string;
  consoleXmtpClient?: unknown;
  consoleAgentRuntime?: {
    handleMessage(input?: Record<string, unknown>): Promise<unknown> | unknown;
    getThread?(input?: Record<string, unknown>): Promise<unknown> | unknown;
  };
  looperCodexRuntime?: LooperCodexRuntime;
  logger?: MultipassLogger;
  consoleCodexWalletRateLimit?: { limit: number; windowMs: number };
  consoleCodexGlobalRateLimit?: { limit: number; windowMs: number };
  consoleCodexRateLimitNow?: () => number;
  consoleCodexWalletMaxBuckets?: number;
  restapDiscoveryEnabled?: boolean;
  restapTalkEnabled?: boolean;
  restap3802Policy?: {
    authorize(input: { surface: 'discovery' | 'talk' | 'news-write' }): Promise<{ discovery?: unknown; publicProjection?: unknown }> | { discovery?: unknown; publicProjection?: unknown };
  };
  restapTalkRuntime?: {
    talk(input: { message: string; sessionId?: string; publicProjection: unknown }): Promise<{ reply: string; session_id: string }> | { reply: string; session_id: string };
  };
  restapNewsWriteEnabled?: boolean;
  restapNewsReadEnabled?: boolean;
  restapNewsStore?: { accept(input: unknown): { itemId: string; receivedAt: string }; list(input: { cursor?: string; limit: number }): { items: Array<{ canonicalBody: unknown }>; nextCursor?: string | null } };
  restapNewsAuthenticator?: { authenticate(input: unknown): Promise<unknown> | unknown };
  restapTalkLimits?: { perIpPerMinute?: number; perSessionPerMinute?: number; globalPerDay?: number; concurrency?: number };
  restapRateLimitNow?: () => number;
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
