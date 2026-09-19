export const RUNTIME_SUBMISSION = Object.freeze({
  event: 'RUNTIME: Build + Demo Day',
  title: 'Loopers Runtime Console',
  eyebrow: 'Bankr RUNTIME submission',
  headline: 'Turn a wallet-owned Looper into a memory-bearing agent.',
  summary: 'Multipass Console binds a wallet-owned Looper to Bankr inference, XMTP messaging, Sibyl memory, and an ERC-8004 identity while keeping every external action behind holder review.',
  form: {
    projectName: 'Loopers Runtime Console',
    oneLine: 'A wallet-owned Looper becomes a memory-bearing Bankr agent with XMTP messaging, Sibyl recall, ERC-8004 identity, and holder-reviewed actions.',
    projectSummary: 'Multipass Console turns a wallet-owned Looper into a usable agent runtime. The holder signs in, selects a Looper, and opens a canonical room bound to its existing ERC-8004 identity. Messages travel through XMTP, durable preferences are recalled and saved through Sibyl, and server-side inference is provided by Bankr LLM Gateway. The agent can monitor, remember, brief, and prepare proposals, but it cannot move assets, execute onchain actions, administer accounts, or publish externally without holder review. A production proof used Looper #2431 and ERC-8004 agent #89144; unauthorized and unauthenticated access remained blocked.',
  },
  deadline: 'Remote submission cutoff: 2026-09-20 04:00 UTC',
  links: {
    console: 'https://helixa.xyz/multipass/console',
    packet: 'https://helixa.xyz/multipass/runtime',
    repository: 'https://github.com/Bendr-20/multipass',
  },
  proofs: [
    {
      label: 'Bankr gateway',
      status: 'Production verified',
      detail: 'A holder-authenticated Console message returned through the Bankr LLM Gateway provider path.',
    },
    {
      label: 'XMTP live',
      status: 'Production verified',
      detail: 'The canonical Looper room used XMTP group transport and can be recovered by a fresh signed session.',
    },
    {
      label: 'Sibyl memory',
      status: 'Production verified',
      detail: 'The runtime recalls durable context before inference and saves bounded memory after the response.',
    },
    {
      label: 'ERC-8004 identity',
      status: 'Onchain bound',
      detail: 'Looper #2431 resolves to its existing ERC-8004 agent #89144 on Base.',
    },
    {
      label: 'Review-only',
      status: 'Enforced',
      detail: 'Responses may include proposals, but execution remains disabled and external actions require holder review.',
    },
  ],
  architecture: [
    { step: '01', title: 'Wallet boundary', detail: 'A signed session binds the operator wallet. Ownership and controller checks are refreshed for agent-scoped operations.' },
    { step: '02', title: 'Owned identity', detail: 'The Console discovers wallet-owned Loopers and activates one canonical runtime profile.' },
    { step: '03', title: 'Runtime loop', detail: 'XMTP carries the room, Bankr provides server-side inference, and Sibyl supplies durable recall.' },
    { step: '04', title: 'Human review', detail: 'The agent can brief and propose. It cannot custody assets or execute external actions.' },
  ],
  demo: [
    'Connect the holder wallet and load its owned Loopers.',
    'Select a Looper and open the canonical agent room.',
    'Send a monitoring mission with an explicit review-only constraint.',
    'Show the Bankr-backed response, XMTP transport, Sibyl memory cue, and review-only proposal.',
    'Open a fresh session and recover the same identity and durable mission context.',
  ],
  safety: [
    'No private signing material or provider credentials enter the browser bundle.',
    'No custody, autonomous trading, asset movement, administration, or public posting is granted to the agent.',
    'Unauthenticated ownership loading returns 401; unrelated signed wallets are rejected before runtime or memory access.',
    'Local fallback adapters are never labeled as live Bankr or XMTP evidence.',
  ],
  artifacts: [
    { name: 'Judge packet', path: 'apps/web/src/runtime-submission.js', publicUrl: 'https://helixa.xyz/multipass/runtime', status: 'public' },
    { name: 'Live Console', path: 'apps/web/src/multipass-console.js', publicUrl: 'https://helixa.xyz/multipass/console', status: 'public' },
    { name: 'Technical proof', path: 'docs/hackathon/bankr-runtime-console-demo.md', publicUrl: 'https://github.com/Bendr-20/multipass/blob/submission/bankr-runtime-clean-2026-09-19/docs/hackathon/bankr-runtime-console-demo.md', status: 'public after push' },
    { name: 'Demo video', path: 'external public video host', publicUrl: '', status: 'pending final capture' },
  ],
});

export function buildRuntimeArtifactManifest(data = RUNTIME_SUBMISSION) {
  const lines = [
    '# Bankr RUNTIME Artifact Manifest',
    '',
    `**Project:** ${data.title}`,
    `**Event:** ${data.event}`,
    `**Deadline:** ${data.deadline.replace(/^Remote submission cutoff:\s*/u, '')}`,
    '',
    '## Public artifacts',
    '',
    '| Artifact | Repository path or host | Status | Public URL | Verification |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const artifact of data.artifacts) {
    const verification = artifact.name === 'Live Console'
      ? '`curl -I https://helixa.xyz/multipass/console` + desktop/mobile browser smoke'
      : artifact.name === 'Judge packet'
        ? '`curl -I https://helixa.xyz/multipass/runtime` + route tests'
        : artifact.name === 'Technical proof'
          ? 'Review against fresh test/build/live evidence'
          : 'Public unauthenticated playback before form submission';
    lines.push(`| ${artifact.name} | \`${artifact.path}\` | ${artifact.status} | ${artifact.publicUrl || 'Pending'} | ${verification} |`);
  }

  lines.push(
    '',
    '## Public proof summary',
    '',
    ...data.proofs.map((proof) => `- **${proof.label}:** ${proof.status}. ${proof.detail}`),
    '',
    '## Publication boundary',
    '',
    'This manifest contains only public product links, public onchain identifiers, aggregate verification results, and deliberate demo copy. Operational credentials, signing material, private memory, session material, and raw transport identifiers are excluded.',
  );

  return `${lines.join('\n')}\n`;
}
