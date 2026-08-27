# Multipass Live Smoke Checklist

Use this checklist after API, web, proxy, or deployment changes.

## Preconditions

- Run from `/home/ubuntu/multipass`.
- Public host is `https://helixa.xyz`.
- Local API default is `http://127.0.0.1:8787`.
- Use a known saved profile such as `bendr-2-1` for live checks.
- Multipass Loopers allowlist persistence is configured with `MULTIPASS_LOOPERS_ALLOWLIST_PATH`.

## Local verification

Run the focused API discovery check:

```bash
node --test apps/api/test/api-routes.test.mjs --test-name-pattern 'serves public Multipass discovery alias and OpenAPI document'
```

Run the full suite:

```bash
pnpm test
```

Build the production web bundle:

```bash
MULTIPASS_BASE=/multipass/ pnpm web:build
```

Run a local Looper allowlist smoke with persistent JSON:

```bash
tmp_allowlist="$(mktemp /tmp/multipass-loopers-allowlist.XXXXXX.json)"
PORT=8790 MULTIPASS_LOOPERS_ALLOWLIST_PATH="$tmp_allowlist" pnpm --filter @helixa/multipass-api start -- --fixture generic &
api_pid=$!
sleep 2
curl -fsS -X POST http://127.0.0.1:8790/api/loopers/allowlist/register \
  -H 'content-type: application/json' \
  -d '{"address":"0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea","source":"local-smoke"}'
curl -fsS 'http://127.0.0.1:8790/api/loopers/allowlist/status?address=0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea'
cat "$tmp_allowlist"
kill "$api_pid"
```

## Live API smoke

Run:

```bash
python3 - <<'PY'
import json
import urllib.request

base = 'https://helixa.xyz'
checks = [
    ('legacy discovery', '/.well-known/helixa-multipass.json', ['schema_version', 'routes']),
    ('discovery', '/.well-known/multipass.json', ['schema_version', 'routes']),
    ('openapi', '/api/openapi.json', ['openapi', 'paths']),
    ('resolve', '/api/resolve?agent=bendr-2-1', ['schema_version', 'routes']),
    ('search', '/api/search?q=bend', ['schema_version']),
    ('profile', '/api/multipass/bendr-2-1', ['schema_version', 'multipass_id', 'slug']),
    ('versioned profile', '/api/v0/multipass/bendr-2-1', ['schema_version', 'multipass_id', 'slug']),
    ('fragments', '/api/multipass/bendr-2-1/fragments', ['schema_version', 'multipass_id', 'fragments']),
    ('card alias', '/api/multipass/bendr-2-1/card', ['schema_version', 'multipass_id']),
    ('agent card', '/api/multipass/bendr-2-1/agent-card', ['schema_version', 'multipass_id']),
    ('standards', '/api/multipass/bendr-2-1/standards', ['schema_version', 'multipass_id']),
    ('x402', '/api/multipass/bendr-2-1/x402', ['schema_version', 'multipass_id']),
    ('receipts', '/api/multipass/bendr-2-1/receipts', ['schema_version', 'multipass_id', 'receipts']),
    ('changes', '/api/multipass/bendr-2-1/changes', ['schema_version', 'multipass_id']),
]

for label, path, keys in checks:
    url = base + path
    request = urllib.request.Request(url, headers={'user-agent': 'Multipass smoke checklist'})
    with urllib.request.urlopen(request, timeout=20) as response:
        content_type = response.headers.get('content-type', '')
        body = response.read().decode('utf-8')
    if 'application/json' not in content_type:
        raise SystemExit(f'{label}: expected JSON, got {content_type}')
    data = json.loads(body)
    missing = [key for key in keys if key not in data]
    if missing:
        raise SystemExit(f'{label}: missing keys {missing}')
    print(f'ok {label}: {path}')
PY
```

Run a live Looper allowlist route smoke only after intentionally deploying/restarting the API with `MULTIPASS_LOOPERS_ALLOWLIST_PATH` set. The public web app posts through the `/multipass-api` proxy:

```bash
curl -fsS -X POST https://helixa.xyz/multipass-api/api/loopers/allowlist/register \
  -H 'content-type: application/json' \
  -d '{"address":"0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea","source":"live-smoke"}'
curl -fsS 'https://helixa.xyz/multipass-api/api/loopers/allowlist/status?address=0x27e3286c2c1783f67d06f2ff4e3ab41f8e1c91ea'
```

## Live web smoke

Run:

```bash
python3 - <<'PY'
import urllib.request

checks = [
    ('home', 'https://helixa.xyz/multipass/'),
    ('loopers allowlist', 'https://helixa.xyz/allowlist'),
    ('saved profile', 'https://helixa.xyz/multipass/bendr-2-1'),
    ('agent lookup', 'https://helixa.xyz/multipass/?agent=81'),
]

for label, url in checks:
    request = urllib.request.Request(url, headers={'user-agent': 'Multipass smoke checklist'})
    with urllib.request.urlopen(request, timeout=20) as response:
        content_type = response.headers.get('content-type', '')
        body = response.read().decode('utf-8', 'replace')
    if response.status != 200:
        raise SystemExit(f'{label}: expected 200, got {response.status}')
    if 'text/html' not in content_type:
        raise SystemExit(f'{label}: expected HTML, got {content_type}')
    if '/multipass/assets/' not in body:
        raise SystemExit(f'{label}: missing Multipass asset reference')
    print(f'ok {label}: {url}')
PY
```

## Manual review

After the commands pass, spot-check the web UI in a browser or screenshot runner if a visual change was made. For API-only changes, the JSON smoke above is enough.

## Expected boundaries

Smoke success does not mean custody, payments, private data, or runtime tool authority changed. Multipass public routes remain profile and discovery metadata unless a separate manager-protected route explicitly says otherwise.
