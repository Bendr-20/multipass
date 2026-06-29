# Multipass What It Does Card Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sparse homepage “What it does” stat card with a compact system-map explainer for Multipass.

**Architecture:** Keep the change inside the existing product-home render path. Add a small renderer for the diagram-style card in `apps/web/src/app.js`, replace the old four-stat panel on the homepage, and add scoped CSS in `apps/web/src/styles.css` so the map works desktop and mobile without affecting live profile proof panels.

**Tech Stack:** Vanilla JS template rendering, existing CSS, Node test runner, Vite build.

---

## Chunk 1: Homepage What It Does System Map

### Task 1: Lock the new homepage card content in render tests

**Files:**
- Modify: `apps/web/test/app.test.mjs`

- [ ] **Step 1: Write the failing content/structure test**

Update the `static initial state presents Multipass product home instead of Bendr profile` test to assert:

```js
const proofPanel = root.querySelector('.homepage-proof-panel');
assert.match(proofPanel?.textContent ?? '', /What it does/);
assert.match(proofPanel?.textContent ?? '', /Multipass turns scattered agent identity into one readable trust profile/);
assert.match(proofPanel?.textContent ?? '', /Identity inputs/);
assert.match(proofPanel?.textContent ?? '', /AgentDNA/);
assert.match(proofPanel?.textContent ?? '', /Owner wallet/);
assert.match(proofPanel?.textContent ?? '', /Manager agent/);
assert.match(proofPanel?.textContent ?? '', /Endpoints/);
assert.match(proofPanel?.textContent ?? '', /NFT provenance/);
assert.match(proofPanel?.textContent ?? '', /Human-owned/);
assert.match(proofPanel?.textContent ?? '', /Agent-managed/);
assert.match(proofPanel?.textContent ?? '', /Standards-readable/);
assert.match(proofPanel?.textContent ?? '', /Usable profile/);
assert.match(proofPanel?.textContent ?? '', /Public proof/);
assert.match(proofPanel?.textContent ?? '', /Permissions/);
assert.match(proofPanel?.textContent ?? '', /Work routes/);
assert.match(proofPanel?.textContent ?? '', /Trust context/);
assert.match(proofPanel?.textContent ?? '', /Shareable profile/);
assert.match(proofPanel?.textContent ?? '', /ERC-8004/);
assert.match(proofPanel?.textContent ?? '', /Cred/);
assert.match(proofPanel?.textContent ?? '', /x402/);
assert.match(proofPanel?.textContent ?? '', /MCP\/A2A/);
assert.doesNotMatch(proofPanel?.textContent ?? '', /Wiretap|ClawBank/);
assert.equal(proofPanel?.querySelectorAll('.homepage-proof-stat').length, 0);
assert.equal(proofPanel?.querySelector('a, button, form, input, textarea, select, [data-action]'), null);
```

Replace the existing old assertion that expects `root.querySelectorAll('.homepage-proof-stat').length` to equal `4`. Do not leave both assertions in place.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern "static initial state presents Multipass product home"
```

Expected: FAIL because the current card still has the sparse stat grid and lacks the new system-map copy.

### Task 2: Implement the system-map renderer

**Files:**
- Modify: `apps/web/src/app.js`

- [ ] **Step 1: Add data arrays near product-home render helpers**

Add focused constants:

```js
const MULTIPASS_INPUT_SIGNALS = ['AgentDNA', 'Owner wallet', 'Manager agent', 'Endpoints', 'NFT provenance'];
const MULTIPASS_CORE_SIGNALS = ['Human-owned', 'Agent-managed', 'Standards-readable'];
const MULTIPASS_PROFILE_SIGNALS = ['Public proof', 'Permissions', 'Work routes', 'Trust context', 'Shareable profile'];
const MULTIPASS_PROTOCOL_CHIPS = ['ERC-8004', 'AgentDNA', 'Cred', 'x402', 'MCP/A2A'];
```

Do not include Wiretap or ClawBank.

- [ ] **Step 2: Add a small list renderer**

Add:

```js
function renderMultipassSignalList(items) {
  return items.map((item) => `<span>${escapeHtml(item)}</span>`).join('');
}
```

- [ ] **Step 3: Add `renderMultipassWhatItDoesPanel()`**

Add:

```js
function renderMultipassWhatItDoesPanel() {
  return `
    <aside class="homepage-proof-panel multipass-system-panel" aria-label="What Multipass does">
      <div class="system-panel-copy">
        <p class="card-label">What it does</p>
        <h2>Multipass turns scattered agent identity into one readable trust profile.</h2>
        <p>It connects identity, ownership, permissions, endpoints, proof, work history, and Cred context into one portable profile humans and agents can verify.</p>
      </div>
      <div class="multipass-system-map" aria-label="Multipass identity system map">
        <section class="system-node system-node-inputs">
          <p>Identity inputs</p>
          <div>${renderMultipassSignalList(MULTIPASS_INPUT_SIGNALS)}</div>
        </section>
        <section class="system-node system-node-core">
          <strong>Multipass</strong>
          <div>${renderMultipassSignalList(MULTIPASS_CORE_SIGNALS)}</div>
        </section>
        <section class="system-node system-node-profile">
          <p>Usable profile</p>
          <div>${renderMultipassSignalList(MULTIPASS_PROFILE_SIGNALS)}</div>
        </section>
      </div>
      <div class="multipass-protocol-strip" aria-label="Supported protocol context">
        ${renderMultipassSignalList(MULTIPASS_PROTOCOL_CHIPS)}
      </div>
    </aside>
  `;
}
```

- [ ] **Step 4: Replace the inline old panel**

In `renderProductHome`, replace the existing `<aside class="homepage-proof-panel" ...>` block with:

```js
${renderMultipassWhatItDoesPanel()}
```

Also remove the now-unused `proofCount` local if it only supported the old stat panel.

- [ ] **Step 5: Run focused test to verify it passes**

Run:

```bash
node --test apps/web/test/app.test.mjs --test-name-pattern "static initial state presents Multipass product home"
```

Expected: PASS.

### Task 3: Add scoped responsive CSS for the system map

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/test/mobile-layout.test.mjs`

- [ ] **Step 1: Write failing CSS assertions**

In `mobile resolver keeps a compact single-column hierarchy`, add assertions that the stylesheet contains:

```js
assert.match(css, /\.multipass-system-panel\s*\{/s);
assert.match(css, /\.multipass-system-map\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\);/s);
assert.match(css, /\.system-node-core\s*\{/s);
assert.match(css, /\.multipass-protocol-strip\s*\{/s);
assert.match(mobileBlock, /\.multipass-system-map\s*\{[^}]*grid-template-columns:\s*1fr;/s);
assert.doesNotMatch(css, /Wiretap|ClawBank/);
```

- [ ] **Step 2: Run mobile layout test to verify it fails**

Run:

```bash
node --test apps/web/test/mobile-layout.test.mjs --test-name-pattern "mobile resolver keeps a compact single-column hierarchy"
```

Expected: FAIL because the CSS does not yet include the new classes.

- [ ] **Step 3: Add desktop styles**

Add scoped styles near the existing `.homepage-proof-panel` rules:

```css
.multipass-system-panel {
  gap: 24px;
  min-height: 0;
  justify-content: flex-start;
}

.system-panel-copy {
  max-width: 900px;
}

.system-panel-copy p:not(.card-label) {
  max-width: 780px;
  color: var(--muted);
  line-height: 1.55;
}

.multipass-system-map {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 14px;
  align-items: stretch;
}

.system-node {
  position: relative;
  border: 1px solid var(--line);
  background: rgba(255, 250, 241, 0.72);
  padding: 16px;
}

.system-node p,
.system-node strong {
  display: block;
  margin-bottom: 12px;
  font-family: var(--display);
  font-size: 18px;
  line-height: 1;
  letter-spacing: -0.04em;
}

.system-node div,
.multipass-protocol-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.system-node span,
.multipass-protocol-strip span {
  border: 1px solid rgba(46, 40, 30, 0.14);
  background: var(--paper-soft);
  color: var(--muted);
  padding: 7px 9px;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.system-node-core {
  min-width: min(220px, 100%);
  background: var(--ink);
  color: var(--paper);
  text-align: center;
}

.system-node-core span {
  border-color: rgba(255, 250, 241, 0.22);
  background: rgba(255, 250, 241, 0.08);
  color: rgba(255, 250, 241, 0.86);
}

.multipass-protocol-strip {
  border-top: 1px solid var(--line);
  padding-top: 16px;
}
```

- [ ] **Step 4: Add mobile styles**

Inside `@media (max-width: 700px)`, add:

```css
.multipass-system-panel {
  gap: 18px;
}

.multipass-system-map {
  grid-template-columns: 1fr;
}

.system-node-core {
  min-width: 0;
  text-align: left;
}
```

- [ ] **Step 5: Run focused app/mobile tests**

Run:

```bash
node --test apps/web/test/app.test.mjs apps/web/test/mobile-layout.test.mjs
```

Expected: 73/73 passing.

### Task 4: Full verification, deploy, and commit

**Files:**
- Modified: `apps/web/src/app.js`
- Modified: `apps/web/src/styles.css`
- Modified: `apps/web/test/app.test.mjs`
- Modified: `apps/web/test/mobile-layout.test.mjs`

- [ ] **Step 1: Full test/build/deploy gate**

Run:

```bash
pnpm test && MULTIPASS_BASE=/multipass/ pnpm web:build && rsync -av --delete apps/web/dist/ /var/www/helixa.xyz/multipass/
```

Expected: full suite passes, Vite build succeeds, files deploy.

- [ ] **Step 2: Verify live assets**

Run:

```bash
curl -fsSL https://helixa.xyz/multipass/ | grep -o 'assets/index-[^" ]*'
```

Then fetch live JS/CSS and verify:
- JS contains `Multipass turns scattered agent identity into one readable trust profile`.
- JS contains approved chips: `ERC-8004`, `AgentDNA`, `Cred`, `x402`, `MCP/A2A`.
- JS does not contain `Wiretap` or `ClawBank` in this card content.
- CSS contains `.multipass-system-map` and mobile `grid-template-columns:1fr`.

Use commands like:

```bash
assets=$(curl -fsSL https://helixa.xyz/multipass/ | grep -o 'assets/index-[^\" ]*')
js=$(printf '%s\n' "$assets" | grep '\.js$')
css=$(printf '%s\n' "$assets" | grep '\.css$')
curl -fsSL "https://helixa.xyz/multipass/$js" | grep -E 'Multipass turns scattered agent identity|ERC-8004|MCP/A2A'
curl -fsSL "https://helixa.xyz/multipass/$js" | grep -E 'Wiretap|ClawBank' && exit 1 || true
curl -fsSL "https://helixa.xyz/multipass/$css" | grep -E 'multipass-system-map|grid-template-columns:1fr'
```

- [ ] **Step 3: Commit and push**

Run:

```bash
git add apps/web/src/app.js apps/web/src/styles.css apps/web/test/app.test.mjs apps/web/test/mobile-layout.test.mjs docs/superpowers/plans/2026-06-29-multipass-what-it-does-card.md
git commit -m "Expand Multipass what-it-does explainer"
git push
```

- [ ] **Step 4: Report**

Reply with:
- What changed.
- Tests/build/deploy status.
- Commit hash.
- Cache-bust URL.
