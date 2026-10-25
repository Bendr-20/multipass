# Multipass App Store pilot swarm

## Mission

**Build the Multipass App Store.**

Create the trusted discovery and distribution layer for apps built by Loopers and their agents inside Multipass. Continue existing work where it exists; do not restart working components.

## Founding roster

All five invited owners accepted the non-binding founding roster.

- Looper #2431 — lead; architecture, integration, and acceptance
- Looper #1 — publisher identity, provenance, and trust policy
- Looper #3802 — product operations and end-user workflow
- Looper #420 — implementation and existing-work inventory
- Looper #452 — catalog quality, compatibility, and community review

## Final preparation terms

The canonical review packet is [multipass-app-store-terms-v1.json](../../review-artifacts/swarm-command/multipass-app-store-terms-v1.json).

- Contribution split: **20% per Looper** (2,000 bps each). This avoids assigning unequal economics before auditable work exists; role differences express responsibility, not privileged ownership.
- App: **Multipass App Store** — trusted discovery and distribution for apps built by Loopers and their agents.
- Token: **Multipass Apps (APPS)**, 1,000,000,000 whole-token prototype supply, bonding-curve-to-DEX preparation path.
- Genesis allocation: 45% agent vesting, 15% CRED-staker rewards, 15% swarm treasury, and 25% public distribution.
- Agent vesting: six-month cliff and 18-month duration. With equal contribution weights, each Looper receives 90,000,000 whole tokens from the agent-vesting allocation.
- Repository visibility: **PUBLIC**. Owner wallets, private DID keys, chat, draft tasks, and unapproved artifacts remain private; sensitive security or credential-bearing material remains withheld until explicitly approved.
- Every Looper has a unique generated Ed25519 did:key preparation identity. Private keys are stored separately with restrictive local permissions and remain unclaimed until the corresponding member approves the terms and key custody/binding.

These terms are final for unanimous review, not execution. Changing any field requires a new version and fresh consent from all five current owners.

## First release scope

1. A versioned app manifest and submission workflow bound to a verified Looper publisher.
2. A searchable catalog with categories, status, compatibility, and trust signals.
3. App detail pages with publisher identity, provenance, permissions, release history, and launch/open actions.
4. Review and moderation states that fail closed for invalid manifests, unverified publishers, or unsafe permissions.
5. A Multipass Console integration that lets an authenticated owner discover and open approved apps without granting hidden wallet or execution authority.

## Existing work first

Before implementation, the swarm inventories every repository, branch, prototype, schema, and design already produced by #3802, #420, or collaborators. Each item is classified as reusable, adaptable, superseded, or blocked. No feature is rebuilt until that inventory is recorded in the shared repository.

## Workspace identity

- Primary provider: **Twigpine** (formerly GitLawb)
- Repository slug: **multipass-app-store**
- Cardinality: one repository for this swarm
- Default/protected branch: **main**
- Member identity: one Ed25519 `did:key` per Looper; shared keys prohibited
- Contribution path: signed pushes, pull requests, reviews, and repository certificates
- Delegation: scoped, expiring UCAN permissions when Twigpine exposes the required production capability
- GitHub: optional mirror for CI and recovery; never the provenance authority

The current launch manifest must remain `PREPARATION_ONLY` with repository status `NOT_PROVISIONED` until Twigpine provisioning, certificate verification, and scoped delegation pass their explicit readiness gates. Git activity never authorizes wallet, deployment, token, or financial execution.

## Initial repository layout

```text
/
├── README.md
├── docs/
│   ├── existing-work-inventory.md
│   ├── architecture.md
│   ├── app-manifest.md
│   └── threat-model.md
├── packages/
│   ├── app-manifest/
│   ├── catalog-client/
│   └── publisher-verification/
├── apps/
│   ├── catalog-api/
│   └── multipass-console/
└── tests/
    ├── fixtures/
    └── integration/
```

The inventory may replace this layout when an existing repository already has a stronger structure.

## First milestone

Produce a read-only end-to-end slice using existing artifacts where possible:

- one verified publisher;
- one canonical app manifest;
- one catalog listing;
- one app detail page;
- one safe open/launch handoff;
- provenance and permission checks with explicit failure states.

## Definition of ready

The swarm may begin implementation when:

- all five accepted members are visible in the roster;
- each member has a unique valid Twigpine Ed25519 `did:key`;
- the `multipass-app-store` repository identity is bound into the canonical swarm manifest;
- existing work has been inventoried;
- contribution roles and the 10,000-bps split are reviewed;
- no workspace readiness gate is falsely reported as complete.
