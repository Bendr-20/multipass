# @helixa/multipass-types

Shared Multipass schema contracts, enum constants, and type declarations.

This package mirrors the public planning schemas in `docs/schemas`. Tests keep the packaged schemas in sync with the docs so implementers can build against one stable contract.

## Exports

- `schemaRegistry`: ordered registry of packaged schema objects.
- `subjectTypes`: supported Multipass subject types.
- `multipassStatuses`: profile lifecycle states.
- `ownerStates`: owner lifecycle states.
- `fragmentTypes`: supported identity fragment kinds.
- `fragmentStatuses`: identity fragment lifecycle states.
- `assuranceLevels`: supported assurance levels.
- `visibilityLevels`: visibility states.
- `transferPolicies`: transfer handling policies.
- `standardStatuses`: standards adapter support states.
- `receiptStatuses`: paid endpoint receipt states.

The JSON schemas are also exported under `./schemas/*.schema.json`.
