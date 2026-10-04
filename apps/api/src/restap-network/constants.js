export const RESTAP_NETWORK_NAMESPACE = 'restap_network';
export const RESTAP_NETWORK_TABLE_PREFIX = 'restap_network_';
export const RESTAP_NETWORK_INTERNAL_PATHS = Object.freeze({ discovery: 'restap-network:discovery', opening: 'restap-network:opening', reply: 'restap-network:reply', finalize: 'restap-network:finalize' });

export const RESTAP_NETWORK_LIMITS = Object.freeze({
  initiatedPerTokenDay: 10,
  generatedPerTokenDay: 30,
  initiatedPerOrderedPairDay: 5,
  replyRounds: 3,
  concurrentPerToken: 2,
  activeDeliveriesPerConversation: 1,
  messageBytes: 2_000,
  storedMessages: 12,
  conversationTtlMs: 30 * 60_000,
  grantTtlMs: 2 * 60_000,
  activationLeaseTtlMs: 24 * 60 * 60_000,
  minimumWorkerCadenceMs: 60_000,
  replayRetentionMs: 48 * 60 * 60_000,
  quotaRetentionMs: 8 * 24 * 60 * 60_000,
  terminalOperationRetentionMs: 30 * 24 * 60 * 60_000,
  redactedAuditRetentionMs: 30 * 24 * 60 * 60_000,
  pilotUnknownChargeBudget: 0,
  finalizedHeadSkewBlocks: 2,
});

export const RESTAP_NETWORK_CADENCES = Object.freeze(['once', 'daily']);
export const RESTAP_NETWORK_TOPICS = Object.freeze([
  'collection-lore',
  'trait-discussion',
  'market-observation',
  'project-updates',
  'collaboration-ideas',
  'general',
]);
