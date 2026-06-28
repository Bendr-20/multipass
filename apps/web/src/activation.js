const TRUSTED_NFT_ADAPTER_ORIGIN = 'nft_adapter_new_erc8004';
const TRUSTED_NFT_ADAPTER_SOURCE = 'trusted_resolver_metadata';

export function getActivationState(data = {}, resolverState = {}) {
  const isLoadedLive = resolverState.resolverStatus === 'loaded';
  const subject = data.profile?.display_name ?? data.agentCards?.[0]?.name ?? 'Multipass profile';
  const resolvedId = data.resolver?.canonicalId
    ?? data.agentCards?.[0]?.helixaId
    ?? data.liveProfilePage?.headerMeta?.match(/\b\d+:\d+\b/u)?.[0]
    ?? null;

  if (data.activation?.state === 'saved_record') {
    return {
      kind: 'saved',
      title: 'Saved Multipass',
      subject,
      resolvedId,
      sourceLabel: data.sourceLabel ?? 'saved Multipass API',
      originLabel: 'Saved public Multipass record',
      summary: 'This persistent Multipass was saved from a public live agent record. It does not grant authority or expose private credentials.',
      showFutureBindNote: true,
    };
  }

  if (!isLoadedLive) {
    return {
      kind: 'preview',
      title: 'Bendr 2.0 Public Profile',
      subject,
      resolvedId,
      sourceLabel: data.sourceLabel ?? 'Bendr public profile',
      originLabel: 'Public Helixa profile',
      summary: 'This public profile shows Bendr 2.0 as a readable Multipass trust profile.',
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
