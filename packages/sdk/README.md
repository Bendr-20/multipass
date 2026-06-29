# @helixa/multipass-sdk

Small validation, loading, and public API helpers for Multipass schema contracts.

The SDK consumes the schema registry from `@helixa/multipass-types` and exposes helpers for the six public document shapes:

- Multipass profiles
- Identity fragments
- Agent cards
- Standards profiles
- x402 manifests
- Receipt fragments

## Local validation

Use the validators when you already have JSON or local files:

```js
import {
  assertMultipassProfile,
  loadMultipassProfileFromFile,
  parseAgentCardJson,
} from '@helixa/multipass-sdk';

const profile = assertMultipassProfile(rawProfile);
const saved = await loadMultipassProfileFromFile('./profile.json');
const card = parseAgentCardJson(rawJson);
```

## Public API helpers

Use the fetch helpers when reading from a Multipass API deployment:

```js
import {
  getActivationSummary,
  getAgentCard,
  getMultipassProfile,
  getPublicFragments,
  resolveMultipass,
  searchMultipass,
} from '@helixa/multipass-sdk';

const profile = await getMultipassProfile('bendr-2', {
  apiBase: 'https://helixa.xyz',
});

const card = await getAgentCard('bendr-2', { apiBase: 'https://helixa.xyz' });
const fragments = await getPublicFragments('bendr-2', { apiBase: 'https://helixa.xyz' });
const resolved = await resolveMultipass('bendr-2', { apiBase: 'https://helixa.xyz' });
const matches = await searchMultipass('bend', { apiBase: 'https://helixa.xyz' });
const summary = getActivationSummary(profile);
```

Helpers validate returned documents before handing them back. Public fragment helpers only consume public fragments returned by the API. The SDK does not expose private fields, authorize manager edits, or treat payment receipts as trust.
