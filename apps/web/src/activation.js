const TRUSTED_NFT_ADAPTER_ORIGIN = 'nft_adapter_new_erc8004';
const TRUSTED_NFT_ADAPTER_SOURCE = 'trusted_resolver_metadata';

export function getActivationState(data = {}, resolverState = {}) {
  const isLoadedLive = resolverState.resolverStatus === 'loaded';
  const subject = data.profile?.display_name ?? data.agentCards?.[0]?.name ?? 'Multipass profile';
  const resolvedId = data.resolver?.canonicalId
    ?? data.agentCards?.[0]?.helixaId
    ?? data.liveProfilePage?.headerMeta?.match(/\b\d+:\d+\b/u)?.[0]
    ?? null;

  if (!isLoadedLive) {
    return {
      kind: 'preview',
      title: 'Preview Multipass',
      subject,
      resolvedId,
      sourceLabel: data.sourceLabel ?? 'bundled fixture',
      originLabel: 'Preview from bundled public data',
      summary: 'This preview shows the Multipass trust profile shape before a live record is activated.',
      showFutureBindNote: true,
    };
  }

  const trustedNftOrigin = data.activation?.origin === TRUSTED_NFT_ADAPTER_ORIGIN
    && data.activation?.originSource === TRUSTED_NFT_ADAPTER_SOURCE;

  return {
    kind: 'activated',
    title: 'Activated Multipass',
    subject,
    resolvedId,
    sourceLabel: data.sourceLabel ?? 'live Helixa API',
    originLabel: trustedNftOrigin ? 'Activated from NFT' : 'Activated from live agent record',
    summary: 'This Multipass was built from a live public agent record.',
    showFutureBindNote: true,
  };
}
