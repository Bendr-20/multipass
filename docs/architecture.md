# Architecture

Placeholder for the fresh Multipass architecture.

Initial boundaries:

- `apps/web`: human-facing product surface
- `apps/api`: server/API boundary
- `packages/contracts`: onchain control, binding, and registry modules
- `packages/sdk`: developer and agent integration SDK
- `packages/types`: shared schemas and validation types

Design principle: import legacy code only when it has a clear owner, test boundary, and reason to exist in Multipass.
