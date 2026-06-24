# Multipass Local API Server Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local HTTP server for the existing Multipass API boundary with validated generic and Bendr fixture sets.

**Architecture:** Keep the existing `createMultipassApi` route core unchanged. Add a fixture loader that validates fixture JSON before serving, then add a tiny Node HTTP wrapper that converts Node requests to Web `Request` objects and writes Web `Response` objects back to Node responses.

**Tech Stack:** Node 20+ ESM, built-in `node:http`, built-in `node:test`, `@helixa/multipass-sdk`, `@helixa/multipass-api`, pnpm workspaces.

---

## File Structure

- Create `apps/api/src/fixtures.js`: fixture path resolution, JSON loading, validation through SDK/createMemoryStore, and `loadFixtureStore` export.
- Create `apps/api/src/server.js`: CLI/environment option parsing, HTTP server startup, request/response bridge, and direct executable entrypoint.
- Create `apps/api/test/fixtures.test.mjs`: TDD coverage for generic and Bendr fixtures, public fragment filtering, unknown fixtures, invalid JSON, and schema-invalid fixture behavior.
- Create `apps/api/test/server.test.mjs`: TDD coverage for option parsing, environment/CLI precedence, ephemeral port server startup, profile route, discovery route, and clean shutdown.
- Create fixture directories under `apps/api/fixtures/generic/` and `apps/api/fixtures/bendr/` with six JSON files each.
- Modify `apps/api/package.json`: add `start` script and keep package metadata minimal.
- Modify root `package.json`: add `api:generic` and `api:bendr` scripts.
- Modify `apps/api/README.md`: document local server usage and fixture routes.
- Modify `apps/api/src/index.d.ts` only if the public API boundary needs extra exported types. Do not expose server internals from the package root unless tests force it.

## Chunk 1: Fixture loader and fixture data

### Task 1: Write failing fixture loader tests

**Files:**
- Create: `apps/api/test/fixtures.test.mjs`
- Later create: `apps/api/src/fixtures.js`
- Later create: `apps/api/fixtures/generic/*.json`
- Later create: `apps/api/fixtures/bendr/*.json`

- [ ] **Step 1: Create `apps/api/test/fixtures.test.mjs` with failing tests**

```js
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createMultipassApi } from '../src/index.js';
import { loadFixtureStore } from '../src/fixtures.js';

async function requestJson(api, pathName) {
  const response = await api.handleRequest(new Request(`http://127.0.0.1:8787${pathName}`));
  return { response, body: await response.json() };
}

test('loads generic fixture store and resolves demo agent', async () => {
  const { store, fixtureName } = await loadFixtureStore({ fixture: 'generic' });
  const profile = store.resolveProfile('demo-agent');

  assert.equal(fixtureName, 'generic');
  assert.equal(profile.multipass_id, 'mp_demo_agent');
  assert.equal(store.resolveProfile('mp_demo_agent').slug, 'demo-agent');
});

test('loads Bendr fixture store and resolves Bendr demo agent', async () => {
  const { store, fixtureName } = await loadFixtureStore({ fixture: 'bendr' });
  const profile = store.resolveProfile('bendr-2');

  assert.equal(fixtureName, 'bendr');
  assert.equal(profile.multipass_id, 'mp_bendr_2');
  assert.equal(profile.display_name, 'Bendr 2.0');
});

test('fixture-backed API filters private fragments', async () => {
  const { store } = await loadFixtureStore({ fixture: 'generic' });
  const api = createMultipassApi({ store, baseUrl: 'http://127.0.0.1:8787' });

  const { response, body } = await requestJson(api, '/api/multipass/demo-agent/fragments');

  assert.equal(response.status, 200);
  assert.ok(body.fragments.length >= 3);
  assert.equal(body.fragments.some((fragment) => fragment.visibility !== 'public'), false);
  assert.equal(body.fragments.some((fragment) => fragment.fragment_id === 'frag_demo_private_note'), false);
});

test('unknown fixture rejects with useful error', async () => {
  await assert.rejects(
    () => loadFixtureStore({ fixture: 'missing-fixture' }),
    /Unknown fixture "missing-fixture"/,
  );
});

test('invalid JSON fixture rejects with file path and parse context', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'multipass-fixture-json-'));
  const dir = path.join(root, 'broken');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'profile.json'), '{', 'utf8');

  try {
    await assert.rejects(
      () => loadFixtureStore({ fixture: 'broken', fixturesRoot: root }),
      (error) => {
        assert.match(error.message, /profile\.json/);
        assert.match(error.message, /invalid JSON/i);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('schema-invalid fixture rejects with schema name and validation path', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'multipass-fixture-schema-'));
  const dir = path.join(root, 'invalid');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'profile.json'), JSON.stringify({ schema_version: '0.1.0' }), 'utf8');

  try {
    await assert.rejects(
      () => loadFixtureStore({ fixture: 'invalid', fixturesRoot: root }),
      (error) => {
        assert.match(error.message, /multipass-profile/);
        assert.match(error.message, /multipass_id|subject_type|display_name/);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests and confirm they fail because the loader does not exist**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/api/test/fixtures.test.mjs
```

Expected: FAIL with module not found for `../src/fixtures.js`.

### Task 2: Implement fixture loader

**Files:**
- Create: `apps/api/src/fixtures.js`

- [ ] **Step 1: Create `apps/api/src/fixtures.js`**

```js
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MultipassValidationError,
  parseAgentCardJson,
  parseIdentityFragmentJson,
  parseMultipassProfileJson,
  parseReceiptFragmentJson,
  parseStandardsProfileJson,
  parseX402ManifestJson,
} from '@helixa/multipass-sdk';

import { createMemoryStore } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FIXTURES_ROOT = path.resolve(__dirname, '../fixtures');

const FILES = {
  profile: ['profile.json', parseMultipassProfileJson],
  fragments: ['fragments.json', parseIdentityFragmentArrayJson],
  card: ['agent-card.json', parseAgentCardJson],
  standardsProfile: ['standards-profile.json', parseStandardsProfileJson],
  x402Manifest: ['x402-manifest.json', parseX402ManifestJson],
  receipts: ['receipts.json', parseReceiptFragmentArrayJson],
};

export async function loadFixtureStore({ fixture = 'generic', fixturesRoot = DEFAULT_FIXTURES_ROOT } = {}) {
  const fixtureName = normalizeFixtureName(fixture);
  const fixtureDir = path.join(fixturesRoot, fixtureName);

  if (!(await directoryExists(fixtureDir))) {
    throw new Error(`Unknown fixture "${fixtureName}" at ${fixtureDir}`);
  }

  const profile = await loadFixtureFile(fixtureDir, FILES.profile);
  const fragments = await loadFixtureFile(fixtureDir, FILES.fragments);
  const agentCard = await loadFixtureFile(fixtureDir, FILES.card);
  const standardsProfile = await loadFixtureFile(fixtureDir, FILES.standardsProfile);
  const x402Manifest = await loadFixtureFile(fixtureDir, FILES.x402Manifest);
  const receipts = await loadFixtureFile(fixtureDir, FILES.receipts);

  return {
    fixtureName,
    store: createMemoryStore({
      profiles: [profile],
      fragments,
      agentCards: [agentCard],
      standardsProfiles: [standardsProfile],
      x402Manifests: [x402Manifest],
      receiptFragments: receipts,
    }),
  };
}

function normalizeFixtureName(value) {
  return String(value || 'generic').trim() || 'generic';
}

async function directoryExists(dir) {
  try {
    return (await stat(dir)).isDirectory();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function loadFixtureFile(fixtureDir, [fileName, parse]) {
  const filePath = path.join(fixtureDir, fileName);
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read fixture file ${filePath}: ${error.message}`, { cause: error });
  }

  try {
    return parse(raw);
  } catch (error) {
    throw enrichFixtureError(filePath, error);
  }
}

function parseIdentityFragmentArrayJson(raw) {
  return parseArrayForSchema(raw, 'identity-fragment', parseIdentityFragmentJson);
}

function parseReceiptFragmentArrayJson(raw) {
  return parseArrayForSchema(raw, 'receipt-fragment', parseReceiptFragmentJson);
}

function parseArrayForSchema(raw, schemaName, parseItem) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new MultipassValidationError(schemaName, [{ path: '$', message: `invalid JSON: ${error.message}` }]);
  }

  if (!Array.isArray(value)) {
    throw new MultipassValidationError(schemaName, [{ path: '$', message: 'expected array' }]);
  }

  return value.map((item, index) => {
    try {
      return parseItem(JSON.stringify(item));
    } catch (error) {
      if (error instanceof MultipassValidationError) {
        throw new MultipassValidationError(schemaName, error.errors.map((issue) => ({
          ...issue,
          path: issue.path === '$' ? `[${index}]` : `[${index}].${issue.path}`,
        })));
      }
      throw error;
    }
  });
}

function enrichFixtureError(filePath, error) {
  if (error instanceof MultipassValidationError) {
    return new Error(`Invalid fixture file ${filePath}: ${error.message}`, { cause: error });
  }
  return new Error(`Invalid fixture file ${filePath}: ${error.message}`, { cause: error });
}
```

- [ ] **Step 2: Run fixture tests and confirm they now fail only because fixture data is missing**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/api/test/fixtures.test.mjs
```

Expected: FAIL with unknown fixture for `generic` or missing fixture files.

### Task 3: Add generic and Bendr fixture files

**Files:**
- Create: `apps/api/fixtures/generic/profile.json`
- Create: `apps/api/fixtures/generic/fragments.json`
- Create: `apps/api/fixtures/generic/agent-card.json`
- Create: `apps/api/fixtures/generic/standards-profile.json`
- Create: `apps/api/fixtures/generic/x402-manifest.json`
- Create: `apps/api/fixtures/generic/receipts.json`
- Create: `apps/api/fixtures/bendr/profile.json`
- Create: `apps/api/fixtures/bendr/fragments.json`
- Create: `apps/api/fixtures/bendr/agent-card.json`
- Create: `apps/api/fixtures/bendr/standards-profile.json`
- Create: `apps/api/fixtures/bendr/x402-manifest.json`
- Create: `apps/api/fixtures/bendr/receipts.json`

- [ ] **Step 1: Add exact generic fixture values**

Use these ids and values across the generic fixture files:

- `multipass_id`: `mp_demo_agent`
- `slug`: `demo-agent`
- display name: `Demo Agent`
- `standards_profile_id`: `sp_demo_agent`
- public fragment ids: `frag_demo_wallet`, `frag_demo_endpoint`, `frag_demo_standard_ref`
- private fragment id: `frag_demo_private_note`
- receipt id: `receipt_demo_lookup`
- endpoint id: `lookup`
- x402 URL: `http://127.0.0.1:8787/api/multipass/demo-agent`

The profile must be `status: "draft"`, `owner_state: "unclaimed"`, `custody_epoch: null`, and `paid_endpoints_enabled: false`.

- [ ] **Step 2: Add exact Bendr fixture values**

Use these ids and values across the Bendr fixture files:

- `multipass_id`: `mp_bendr_2`
- `slug`: `bendr-2`
- display name: `Bendr 2.0`
- `standards_profile_id`: `sp_bendr_2`
- public fragment ids: `frag_bendr_profile`, `frag_bendr_endpoint`, `frag_bendr_standard_ref`, `frag_bendr_x402_route`
- private fragment id: `frag_bendr_private_placeholder`
- receipt id: `receipt_bendr_lookup`
- endpoint id: `lookup`
- x402 URL: `http://127.0.0.1:8787/api/multipass/bendr-2`

The profile must be `status: "link_ready"`, `owner_state: "unclaimed"`, `custody_epoch: null`, and `paid_endpoints_enabled: false`. The discovery summary must describe Bendr as a Helixa/Multipass demo agent without claiming live production activation.

- [ ] **Step 3: Run fixture tests until green**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/api/test/fixtures.test.mjs
```

Expected: PASS all fixture tests.

## Chunk 2: Local HTTP server

### Task 4: Write failing server tests

**Files:**
- Create: `apps/api/test/server.test.mjs`
- Later create: `apps/api/src/server.js`

- [ ] **Step 1: Create `apps/api/test/server.test.mjs`**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseServerOptions, startServer } from '../src/server.js';

test('parseServerOptions returns safe defaults', () => {
  assert.deepEqual(parseServerOptions([], {}), {
    fixture: 'generic',
    host: '127.0.0.1',
    port: 8787,
  });
});

test('CLI flags override environment values', () => {
  assert.deepEqual(
    parseServerOptions(['--fixture', 'bendr', '--host', '0.0.0.0', '--port', '9000'], {
      MULTIPASS_FIXTURE: 'generic',
      HOST: '127.0.0.1',
      PORT: '8787',
    }),
    {
      fixture: 'bendr',
      host: '0.0.0.0',
      port: 9000,
    },
  );
});

test('startServer serves discovery and profile routes on an ephemeral port', async () => {
  const server = await startServer({ fixture: 'generic', host: '127.0.0.1', port: 0 });

  try {
    assert.equal(server.fixtureName, 'generic');
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+$/);

    const discovery = await fetch(`${server.url}/.well-known/helixa-multipass.json`);
    assert.equal(discovery.status, 200);
    const discoveryBody = await discovery.json();
    assert.equal(discoveryBody.routes.profile, `${server.url}/api/multipass/{id}`);

    const profile = await fetch(`${server.url}/api/multipass/demo-agent`);
    assert.equal(profile.status, 200);
    const profileBody = await profile.json();
    assert.equal(profileBody.multipass_id, 'mp_demo_agent');
  } finally {
    await server.close();
  }
});

test('startServer can serve Bendr fixture', async () => {
  const server = await startServer({ fixture: 'bendr', host: '127.0.0.1', port: 0 });

  try {
    const profile = await fetch(`${server.url}/api/multipass/bendr-2`);
    assert.equal(profile.status, 200);
    assert.equal((await profile.json()).display_name, 'Bendr 2.0');
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 2: Run tests and confirm they fail because `server.js` does not exist**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/api/test/server.test.mjs
```

Expected: FAIL with module not found for `../src/server.js`.

### Task 5: Implement local server

**Files:**
- Create: `apps/api/src/server.js`

- [ ] **Step 1: Create `apps/api/src/server.js`**

```js
import http from 'node:http';
import { pathToFileURL } from 'node:url';

import { createMultipassApi } from './index.js';
import { loadFixtureStore } from './fixtures.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;
const DEFAULT_FIXTURE = 'generic';

export function parseServerOptions(argv = [], env = process.env) {
  const options = {
    fixture: env.MULTIPASS_FIXTURE || DEFAULT_FIXTURE,
    host: env.HOST || DEFAULT_HOST,
    port: parsePort(env.PORT, DEFAULT_PORT),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--fixture') options.fixture = argv[++index];
    else if (arg === '--host') options.host = argv[++index];
    else if (arg === '--port') options.port = parsePort(argv[++index], DEFAULT_PORT);
  }

  return options;
}

export async function startServer(options = {}) {
  const parsed = {
    fixture: options.fixture || DEFAULT_FIXTURE,
    host: options.host || DEFAULT_HOST,
    port: options.port ?? DEFAULT_PORT,
  };

  const { store, fixtureName } = await loadFixtureStore({ fixture: parsed.fixture });
  let api;
  let baseUrl;

  const nodeServer = http.createServer(async (req, res) => {
    try {
      const request = new Request(new URL(req.url || '/', baseUrl), { method: req.method || 'GET' });
      const response = await api.handleRequest(request);
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.end(await response.text());
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ schema_version: '0.1.0', error: { code: 'server_error', message: error.message } }));
    }
  });

  await new Promise((resolve, reject) => {
    nodeServer.once('error', reject);
    nodeServer.listen(parsed.port, parsed.host, resolve);
  });

  const address = nodeServer.address();
  const port = typeof address === 'object' && address ? address.port : parsed.port;
  baseUrl = `http://${parsed.host}:${port}`;
  api = createMultipassApi({ store, baseUrl });

  return {
    fixtureName,
    host: parsed.host,
    port,
    url: baseUrl,
    server: nodeServer,
    close: () => new Promise((resolve, reject) => nodeServer.close((error) => (error ? reject(error) : resolve()))),
  };
}

function parsePort(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const port = Number(value);
  return Number.isInteger(port) && port >= 0 ? port : fallback;
}

async function main() {
  const server = await startServer(parseServerOptions(process.argv.slice(2), process.env));
  console.log(`Multipass API server listening at ${server.url}`);
  console.log(`Fixture: ${server.fixtureName}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 2: Run server tests until green**

Run:

```bash
cd /home/ubuntu/multipass
node --test apps/api/test/server.test.mjs
```

Expected: PASS all server tests.

## Chunk 3: Scripts, docs, smoke checks, and commit

### Task 6: Add scripts and docs

**Files:**
- Modify: `package.json`
- Modify: `apps/api/package.json`
- Modify: `apps/api/README.md`

- [ ] **Step 1: Add root scripts**

Modify root `package.json` scripts:

```json
{
  "api:generic": "pnpm --filter @helixa/multipass-api start -- --fixture generic",
  "api:bendr": "pnpm --filter @helixa/multipass-api start -- --fixture bendr"
}
```

Keep existing `test` and `test:types` scripts.

- [ ] **Step 2: Add API package start script**

Modify `apps/api/package.json` scripts:

```json
{
  "start": "node src/server.js"
}
```

- [ ] **Step 3: Update `apps/api/README.md`**

Add a short `Local server` section with:

~~~md
## Local server

Run a public-neutral fixture:

```bash
pnpm api:generic
```

Run the Bendr demo fixture:

```bash
pnpm api:bendr
```

Default URL: `http://127.0.0.1:8787`.

Useful routes:

- `GET /.well-known/helixa-multipass.json`
- `GET /api/multipass/demo-agent`
- `GET /api/multipass/demo-agent/fragments`
- `GET /api/multipass/demo-agent/agent-card`
- `GET /api/multipass/demo-agent/standards`
- `GET /api/multipass/demo-agent/x402`
- `GET /api/multipass/demo-agent/receipts/receipt_demo_lookup`
- `GET /api/multipass/bendr-2`
- `GET /api/multipass/bendr-2/receipts/receipt_bendr_lookup`

This server is local development only. It has no database, auth, deployment service, or payment settlement.
~~~
### Task 7: Run full verification and manual smoke

**Files:**
- No file changes unless verification catches issues.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
cd /home/ubuntu/multipass
pnpm install >/dev/null
pnpm test
python3 - <<'PY'
from pathlib import Path
terms = [
    'pass' + 'port',
    'Multi ' + 'Pass',
    '.' + 'agent',
    'Legen' + 'dary',
    'buy ' + 'reputation',
    'purchase ' + 'reputation',
    'human-owned, ' + 'agent-managed',
]
roots = ['README.md', 'docs', 'apps', 'packages', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml']
for root in roots:
    p = Path(root)
    files = [p] if p.is_file() else [x for x in p.rglob('*') if x.is_file()]
    for file in files:
        text = file.read_text(errors='ignore')
        for term in terms:
            if term in text:
                raise SystemExit(f'forbidden wording {term!r} in {file}')
        if chr(8212) in text:
            raise SystemExit(f'em dash in {file}')
print('wording gate passed')
PY
git diff --check -- apps/api package.json pnpm-lock.yaml docs/superpowers/plans
python3 - <<'PY'
import json
from pathlib import Path
for p in ['package.json','apps/api/package.json','packages/types/package.json','packages/sdk/package.json']:
    json.loads(Path(p).read_text())
print('package json valid')
PY
```

Expected: all tests pass, grep gates return no matches, diff check passes, package JSON valid.

- [ ] **Step 2: Run generic smoke server**

Run:

```bash
cd /home/ubuntu/multipass
node apps/api/src/server.js --fixture generic --port 0 > /tmp/multipass-generic.log 2>&1 &
GENERIC_PID=$!
sleep 1
GENERIC_URL=$(grep -o 'http://127.0.0.1:[0-9]*' /tmp/multipass-generic.log | head -1)
curl -fsS "$GENERIC_URL/.well-known/helixa-multipass.json" >/tmp/multipass-generic-well-known.json
curl -fsS "$GENERIC_URL/api/multipass/demo-agent" >/tmp/multipass-generic-profile.json
curl -fsS "$GENERIC_URL/api/multipass/demo-agent/fragments" >/tmp/multipass-generic-fragments.json
kill $GENERIC_PID
python3 - <<'PY'
import json
from pathlib import Path
profile=json.loads(Path('/tmp/multipass-generic-profile.json').read_text())
fragments=json.loads(Path('/tmp/multipass-generic-fragments.json').read_text())
assert profile['multipass_id'] == 'mp_demo_agent'
assert all(f['visibility'] == 'public' for f in fragments['fragments'])
assert all(f['fragment_id'] != 'frag_demo_private_note' for f in fragments['fragments'])
print('generic smoke passed')
PY
```

Expected: `generic smoke passed`.

If avoiding `sleep`, run the server through a small Node smoke test instead. Do not leave a background server running.

- [ ] **Step 3: Run Bendr smoke server**

Run:

```bash
cd /home/ubuntu/multipass
node apps/api/src/server.js --fixture bendr --port 0 > /tmp/multipass-bendr.log 2>&1 &
BENDR_PID=$!
sleep 1
BENDR_URL=$(grep -o 'http://127.0.0.1:[0-9]*' /tmp/multipass-bendr.log | head -1)
curl -fsS "$BENDR_URL/api/multipass/bendr-2" >/tmp/multipass-bendr-profile.json
curl -fsS "$BENDR_URL/api/multipass/bendr-2/receipts/receipt_bendr_lookup" >/tmp/multipass-bendr-receipt.json
kill $BENDR_PID
python3 - <<'PY'
import json
from pathlib import Path
profile=json.loads(Path('/tmp/multipass-bendr-profile.json').read_text())
receipt=json.loads(Path('/tmp/multipass-bendr-receipt.json').read_text())
assert profile['display_name'] == 'Bendr 2.0'
assert receipt['receipt_id'] == 'receipt_bendr_lookup'
print('bendr smoke passed')
PY
```

Expected: `bendr smoke passed`.

If avoiding `sleep`, run the server through a small Node smoke test instead. Do not leave a background server running.

### Task 8: Commit, push, and record memory

**Files:**
- Modify: `memory/2026-06-24.md` outside repo after code commit succeeds.
- Optional modify: `/home/ubuntu/.openclaw/workspace/reports/bendr-phase-1-actions.md` if useful.

- [ ] **Step 1: Inspect diff scope**

Run:

```bash
cd /home/ubuntu/multipass
git status --short
git diff --stat
```

Expected: changes only in `apps/api`, root `package.json`, lockfile if pnpm updates it, and `docs/superpowers/plans/2026-06-24-multipass-local-api-server.md`.

- [ ] **Step 2: Commit plan and implementation**

Preferred commit split:

```bash
cd /home/ubuntu/multipass
git add docs/superpowers/plans/2026-06-24-multipass-local-api-server.md
git commit -m "Add local API server implementation plan"
git add apps/api package.json pnpm-lock.yaml
git commit -m "Add local Multipass API server"
```

If the plan was already committed before execution, only commit implementation.

- [ ] **Step 3: Push and verify remote**

Run the existing token push helper pattern used in prior Multipass commits, then:

```bash
cd /home/ubuntu/multipass
git fetch origin main --quiet
printf 'local='; git rev-parse HEAD
printf 'origin='; git rev-parse origin/main
printf 'status='; git status --short | wc -l
```

Expected: local equals origin, status is `0`.

- [ ] **Step 4: Record memory note**

Append a concise note to `/home/ubuntu/.openclaw/workspace/memory/2026-06-24.md` with commit hash, what shipped, final verification, smoke results, and any deliberate non-goals.
