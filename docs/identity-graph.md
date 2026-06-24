# Identity Graph

## Core entities

### Multipass

A Multipass is the root identity record for a subject. It holds stable identifiers, ownership state, operation state, custody state, public profile data, visibility policy, payment metadata, discovery data, standards references, and trust context.

Core fields:

- `multipass_id`
- `subject_type`
- `display_name`
- `slug`
- `status`
- `owner_controller_id`
- `owner_state`
- `agent_manager_id`
- `primary_identity_fragment_id`
- `current_custody_epoch_id`
- `public_profile`
- `visibility_policy`
- `cred_summary`
- `payment_profile`
- `discovery_profile`
- `standards_profile`
- `created_at`
- `updated_at`

Nullability is status-specific. `owner_controller_id`, `agent_manager_id`, `primary_identity_fragment_id`, and `current_custody_epoch_id` can be null while a record is `draft`, `link_ready`, or `unclaimed`. Activation requires an owner fragment, controller proof, and custody epoch before those authority fields can be treated as verified.

`subject_type` values:

- `agent`
- `human`
- `swarm`
- `collection`
- `project`
- `organization`

`status` values:

- `draft`
- `link_ready`
- `active`
- `transfer_pending`
- `suspended`
- `archived`

`owner_state` values:

- `unclaimed`
- `claimed`
- `verified`
- `transferred`

### Owner controller

The owner controller is the authority that can claim, verify, configure, transfer, suspend, archive, or recover a Multipass under the active policy.

### Agent manager

The agent manager is a delegated operator profile that can update approved fields, rotate allowed endpoints, manage routine metadata, and request permission changes without owning the root identity.

### Identity fragment

An identity fragment is a linked proof, account, wallet, domain, endpoint, receipt, work record, attestation, standard reference, custody record, or verification result.

### Custody epoch

A custody epoch records who controlled the subject during a bounded period, which owner proof applied, which manager was delegated, and what transfer policy applied.

### Cred context

Cred context summarizes $CRED-related access, payment, settlement, discount, dashboard, burn, and receipt metadata. It does not increase trust by itself.

### Discovery profile

The discovery profile is the agent-readable surface for public lookup, canonical JSON, agent card data, routes, endpoints, tools, schemas, and standards references.

### Payment profile

The payment profile describes supported payment routes, x402 metadata, preferred settlement asset, receipt behavior, and gated endpoint policy.

### Standards profile

The standards profile lists external and native standards references, compatibility claims, adapter mappings, and verification status for each supported standard.

## Multipass lifecycle

- `draft`: Draft records can hold unverified public data.
- `link_ready`: The profile has enough data to request owner proof and fragment verification.
- `active`: Active records require an owner fragment, controller proof, and custody epoch.
- `transfer_pending`: A transfer has been requested and high-risk authority should pause until policy checks complete.
- `suspended`: The profile is visible only according to safety, recovery, or dispute policy.
- `archived`: The profile is no longer active but historical records remain resolvable.

## Fragment model

Fragments should include:

- Fragment identifier.
- Parent `multipass_id`.
- Fragment type.
- Source system.
- Status.
- Assurance level.
- Visibility.
- Transfer policy.
- Issuer or verifier, if present.
- Proof reference or content hash, if present.
- Created, updated, verified, revoked, and expiry timestamps where applicable.
- `endpoint_ref` fields for endpoint fragments.
- `custody_ref` fields for custody record fragments.
- `verification_ref` fields for verification result fragments.

Initial `fragment_type` values:

- `wallet`
- `social`
- `domain`
- `project`
- `collection`
- `endpoint`
- `attestation`
- `receipt`
- `standard_ref`
- `risk_summary`
- `tool_manifest`
- `work_record`
- `custody_record`
- `verification_result`

## Fragment status

`fragment_status` values:

- `pending`
- `verified`
- `stale`
- `revoked`
- `disputed`
- `historical`

## Assurance levels

`assurance_level` values:

- `unverified`
- `self_attested`
- `platform_verified`
- `cryptographic`
- `issuer_attested`
- `onchain_verified`

## Visibility

`visibility` values:

- `public`
- `gated`
- `private`
- `hidden`

Visibility applies per field and per fragment. Public data can be indexed. Gated data requires an access policy. Private data is limited to approved roles. Hidden data is not discoverable through normal resolution.

## Transfer policy

`transfer_policy` values:

- `reverify_on_transfer`
- `pause_on_transfer`
- `historical_on_transfer`
- `never_transfer`

Transfer does not transfer secrets, private memory, live signers, API keys, or production authority.

## Trust boundaries

Multipass can combine identity, custody, fragments, receipts, attestations, and standards context, but each signal keeps its source and assurance level. Payments, ownership, social proofs, verifier attestations, and runtime authority are separate trust domains.
