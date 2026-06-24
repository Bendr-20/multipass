# Multipass Protocol Artifact Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the existing Multipass web demo into the Normies-inspired Protocol Artifact direction while preserving current API behavior.

**Architecture:** Keep the existing framework-light Vite app and plain DOM renderer. Update copy, markup classes, and CSS to present Bendr 2.0 as an official record/spec sheet with a proof ledger. Preserve existing API helper behavior, safe query override, JSON toggles, and defensive public-fragment filtering.

**Tech Stack:** Node 22, pnpm, Vite, jsdom, built-in `node:test`, existing `@helixa/multipass-web` app.

---

## File Structure

- Modify `apps/web/src/content.js`: update hero/story copy and add record-sheet summary helpers if needed.
- Modify `apps/web/src/app.js`: replace current command-center markup with Protocol Artifact record markup while preserving renderer state and JSON toggles.
- Modify `apps/web/src/styles.css`: replace holographic dark styling with warm off-white Protocol Artifact system.
- Modify `apps/web/test/app.test.mjs`: update expectations for new copy, record sheet fields, proof ledger rows, and private-fragment defenses.
- Modify `apps/web/test/content.test.mjs`: update expected copy titles/summaries if changed.
- Optionally create `apps/web/test/wording.test.mjs`: shared wording gate for new web copy and docs changed by this redesign.
- No API changes.
- No schema changes.
- No dependency changes unless tests prove a need.

## Chunk 1: Tests and copy/content boundary

### Task 1: Add failing tests for Protocol Artifact render requirements

**Files:**
- Modify: `apps/web/test/app.test.mjs`
- Modify later: `apps/web/src/app.js`
- Modify later: `apps/web/src/content.js`

- [ ] **Step 1: Update app render test expectations**

In `apps/web/test/app.test.mjs`, update the successful render test to assert the new Protocol Artifact copy and fields:

```js
assert.match(root.textContent, /Verifiable identity records for autonomous agents/);
assert.match(root.textContent, /MULTIPASS RECORD/);
// Add `multipass_id: 'mp_bendr_2'` to `sampleData().profile` before adding this assertion.
assert.match(root.textContent, /mp_bendr_2/);
assert.match(root.textContent, /bendr-2/);
assert.match(root.textContent, /Public proof only/);
assert.match(root.textContent, /Proof ledger/);
```

Also assert the new structural classes exist:

```js
assert.ok(root.querySelector('.record-shell'));
assert.ok(root.querySelector('.record-sheet'));
assert.ok(root.querySelector('.proof-ledger'));
```

- [ ] **Step 2: Add proof ledger row assertions**

In the proof-card test, rename the test to proof ledger language and assert all six document labels still render:

```js
for (const title of ['Profile', 'Public Fragments', 'Agent Card', 'Standards', 'x402', 'Receipt']) {
  assert.match(root.textContent, new RegExp(title));
}
```

Keep the JSON toggle open/close assertions and the private fragment defensive assertion.

- [ ] **Step 3: Run app tests to verify RED**

Run:

```bash
cd /home/ubuntu/multipass
pnpm --filter @helixa/multipass-web exec node --test test/app.test.mjs
```

Expected: FAIL because `.record-shell`, `.record-sheet`, `.proof-ledger`, and new copy do not exist yet.

### Task 2: Update content copy for Protocol Artifact

**Files:**
- Modify: `apps/web/src/content.js`
- Modify: `apps/web/test/content.test.mjs`

- [ ] **Step 1: Update content tests for new story titles and summaries**

Update `apps/web/test/content.test.mjs` so `createStoryCards(data).map((card) => card.title)` still returns:

```js
[
  'Identity Graph',
  'Standards Spine',
  'Access and Receipts',
]
```

Add assertions that story bodies use record/proof language:

```js
const storyText = JSON.stringify(createStoryCards(data));
assert.match(storyText, /public fragments/i);
assert.match(storyText, /standards references/i);
assert.match(storyText, /receipt evidence/i);
```

- [ ] **Step 2: Run content tests to verify any copy mismatch**

Run:

```bash
cd /home/ubuntu/multipass
pnpm --filter @helixa/multipass-web exec node --test test/content.test.mjs
```

Expected: FAIL if current copy does not match the new record/proof language.

- [ ] **Step 3: Update `apps/web/src/content.js` copy**

Set `HERO_COPY` to:

```js
export const HERO_COPY = {
  eyebrow: 'MULTIPASS RECORD',
  headline: 'Verifiable identity records for autonomous agents.',
  body: 'Multipass turns agent identity, public proof, standards, and access receipts into one portable trust object.',
  note: 'Local demo reading the Bendr 2.0 fixture.',
};
```

Update story card body copy:

- Identity Graph: `Public fragments make the agent legible without exposing private records.`
- Standards Spine: `Standards references sit directly inside the profile record instead of living as loose claims.`
- Access and Receipts: `Endpoint access can produce receipt evidence, kept close to the identity object.`

Keep `createProofCards` behavior and defensive public-fragment filtering unchanged.

- [ ] **Step 4: Run content tests until green**

Run:

```bash
cd /home/ubuntu/multipass
pnpm --filter @helixa/multipass-web exec node --test test/content.test.mjs
```

Expected: PASS.

## Chunk 2: Markup and styling

### Task 3: Replace app markup with Protocol Artifact structure

**Files:**
- Modify: `apps/web/src/app.js`

- [ ] **Step 1: Update loading and error shells**

Use `.record-shell` for loading and error states so the preview does not flash the old design.

Loading should render:

```html
<section class="record-shell loading-shell">
  <p class="eyebrow">MULTIPASS RECORD</p>
  <h1>Loading Bendr 2.0...</h1>
</section>
```

Error should keep the `pnpm api:bendr` setup instruction and escaped error message.

- [ ] **Step 2: Replace main render markup**

In `render(root, state)`, output this structure:

- `.record-shell` wrapper.
- `.record-header` with brand, `Protocol Artifact`, and `Local API Demo`.
- `.hero-record` grid.
- Left hero copy using `HERO_COPY`.
- Right `.record-sheet` with Bendr fields.
- `.story-records` with numbered story blocks.
- `.proof-ledger` with `.ledger-row` proof rows.
- Footer note.

Use existing `createStoryCards(data)` and `createProofCards(data)` results. Do not change API load flow.

- [ ] **Step 3: Preserve JSON toggle behavior**

Each `.ledger-row` should contain a real `button` with:

```html
<button data-action="toggle-json" data-index="${index}">
```

Expanded JSON should render inside:

```html
<pre class="json-panel">...</pre>
```

- [ ] **Step 4: Run app tests until structure passes**

Run:

```bash
cd /home/ubuntu/multipass
pnpm --filter @helixa/multipass-web exec node --test test/app.test.mjs
```

Expected: PASS after markup is updated.

### Task 4: Replace CSS with Protocol Artifact visual system

**Files:**
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Replace root variables**

Use:

```css
:root {
  color-scheme: light;
  --canvas: #f4efe6;
  --paper: #fffaf1;
  --paper-soft: #f8f2e8;
  --ink: #191b1c;
  --charcoal: #303331;
  --muted: #626761;
  --line: #d4ccbf;
  --soft-line: #e4ddd2;
  --blue: #365f7d;
  --green: #2f7d55;
  --brass: #9a7630;
  --shadow: 0 28px 80px rgba(25, 27, 28, 0.10);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
```

- [ ] **Step 2: Remove old holographic styles**

Remove old variable names and styling tied to:

- mint/lavender/blue/pink palette.
- glass panel gradients.
- dark cyberpunk background.
- heavy glow shadows.

- [ ] **Step 3: Add Protocol Artifact layout classes**

Implement styles for:

- `.record-shell`
- `.record-header`
- `.brand`
- `.mark`
- `.header-meta`
- `.hero-record`
- `.record-sheet`
- `.sheet-top`
- `.stamp`
- `.field-grid`
- `.field`
- `.story-records`
- `.story`
- `.proof-ledger`
- `.ledger-title`
- `.ledger-row`
- `.badge`
- `.json-panel`

- [ ] **Step 4: Add focus and mobile styles**

Buttons need visible focus state:

```css
button:focus-visible {
  outline: 3px solid rgba(54, 95, 125, 0.35);
  outline-offset: 3px;
}
```

At `max-width: 900px`, collapse hero, story, field grid, and ledger rows into single column.

- [ ] **Step 5: Run web tests and build**

Run:

```bash
cd /home/ubuntu/multipass
pnpm --filter @helixa/multipass-web test
pnpm --filter @helixa/multipass-web build
```

Expected: tests pass and Vite build succeeds.

## Chunk 3: Wording gate, smoke, review, and push

### Task 5: Add shared wording gate for web redesign

**Files:**
- Create: `apps/web/test/wording.test.mjs`

- [ ] **Step 1: Create wording test**

Create `apps/web/test/wording.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = join(webRoot, '../..');

const checkedFiles = [
  join(webRoot, 'src/content.js'),
  join(webRoot, 'src/app.js'),
  join(webRoot, 'src/styles.css'),
  join(repoRoot, 'docs/superpowers/specs/2026-06-24-multipass-protocol-artifact-visual-redesign.md'),
  join(repoRoot, 'docs/superpowers/plans/2026-06-24-multipass-protocol-artifact-redesign.md'),
];

const bannedTerms = [
  'pass' + 'port',
  'Multi ' + 'Pass',
  '.' + 'agent',
  'Legen' + 'dary',
  'buy ' + 'reputation',
  'purchase ' + 'reputation',
  'human-owned, ' + 'agent-managed',
];

const emojiPattern = /[\u{1F300}-\u{1FAFF}]/u;

test('Protocol Artifact web copy avoids blocked wording', async () => {
  for (const file of checkedFiles) {
    const text = await readFile(file, 'utf8');
    for (const term of bannedTerms) {
      assert.equal(text.includes(term), false, `${file} contains blocked wording: ${term}`);
    }
    assert.equal(text.includes(String.fromCharCode(8212)), false, `${file} contains em dash`);
    assert.equal(emojiPattern.test(text), false, `${file} contains emoji`);
  }
});
```

- [ ] **Step 2: Run wording test**

Run:

```bash
cd /home/ubuntu/multipass
pnpm --filter @helixa/multipass-web exec node --test test/wording.test.mjs
```

Expected: PASS.

### Task 6: Full verification and local smoke

**Files:**
- No changes unless verification catches issues.

- [ ] **Step 1: Run full test/build gates**

Run:

```bash
cd /home/ubuntu/multipass
pnpm --filter @helixa/multipass-web test
pnpm --filter @helixa/multipass-web build
pnpm test
git diff --check -- apps/web docs/superpowers/specs docs/superpowers/plans package.json pnpm-lock.yaml
```

Expected: all pass.

- [ ] **Step 2: Run local smoke with API and Vite proxy**

Use port `8788` for the API because this host may have another service on `8787`.

```bash
cd /home/ubuntu/multipass
API_PID=''
WEB_PID=''
cleanup() {
  if [ -n "${WEB_PID:-}" ]; then kill -- -"$WEB_PID" 2>/dev/null || kill "$WEB_PID" 2>/dev/null || true; fi
  if [ -n "${API_PID:-}" ]; then kill -- -"$API_PID" 2>/dev/null || kill "$API_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT
setsid bash -lc 'PORT=8788 pnpm api:bendr' > /tmp/multipass-api-smoke.log 2>&1 &
API_PID=$!
setsid bash -lc 'MULTIPASS_API_TARGET=http://127.0.0.1:8788 pnpm --filter @helixa/multipass-web exec vite --host 127.0.0.1 --port 5173 --strictPort' > /tmp/multipass-web-smoke.log 2>&1 &
WEB_PID=$!
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:5173/ >/tmp/multipass-web-page.html 2>/dev/null && curl -fsS http://127.0.0.1:5173/multipass-api/api/multipass/bendr-2 >/tmp/multipass-web-proxy.json 2>/dev/null; then
    break
  fi
  sleep 0.5
  if [ "$i" -eq 20 ]; then
    echo 'API log:'; cat /tmp/multipass-api-smoke.log || true
    echo 'Web log:'; cat /tmp/multipass-web-smoke.log || true
    exit 1
  fi
done
pnpm --filter @helixa/multipass-web exec node --input-type=module - <<'EOF'
import { JSDOM } from 'jsdom';
import { createApp } from './src/app.js';

const nativeFetch = globalThis.fetch;
const dom = new JSDOM('<!doctype html><main id="app"></main>', { url: 'http://127.0.0.1:5173/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.fetch = (route) => nativeFetch(new URL(route, 'http://127.0.0.1:5173/'));

await createApp({ root: document.querySelector('#app') }).start();
const text = document.body.textContent;
if (!text.includes('Verifiable identity records for autonomous agents')) throw new Error('rendered hero copy missing');
if (!text.includes('Proof ledger')) throw new Error('proof ledger copy missing');
if (!text.includes('mp_bendr_2')) throw new Error('record id missing');
EOF
python3 - <<'PY'
import json
from pathlib import Path
profile=json.loads(Path('/tmp/multipass-web-proxy.json').read_text())
assert profile['multipass_id'] == 'mp_bendr_2'
print('protocol artifact smoke passed')
PY
```

Expected: `protocol artifact smoke passed` and no lingering smoke processes.

### Task 7: Code review, commit, push, and memory

**Files:**
- Modify memory after push.

- [ ] **Step 1: Request code review**

Dispatch a code-review subagent against the uncommitted diff. Required focus:

- Visual spec alignment.
- Behavior preservation.
- Private-fragment filtering.
- Accessibility basics.
- Wording gate.
- No scope creep.

- [ ] **Step 2: Fix any real review issues**

If review finds Critical or Important issues, fix them with tests and rerun verification.

- [ ] **Step 3: Commit implementation**

Run:

```bash
cd /home/ubuntu/multipass
git add apps/web docs/superpowers/plans/2026-06-24-multipass-protocol-artifact-redesign.md docs/superpowers/specs/2026-06-24-multipass-protocol-artifact-visual-redesign.md
git commit -m "Apply Protocol Artifact web redesign"
```

- [ ] **Step 4: Push and verify remote**

Run:

```bash
cd /home/ubuntu/multipass
git push origin main
git fetch origin main --quiet
printf 'local='; git rev-parse HEAD
printf 'origin='; git rev-parse origin/main
printf 'status='; git status --short | wc -l
```

Expected: local equals origin and status is `0`.

- [ ] **Step 5: Record memory**

Append a concise memory note with commit hash, visual direction, verification evidence, and any temporary preview link if generated.
