# Multipass Share Panel Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a display-only on-page share panel for Multipass profile URLs.

**Architecture:** Reuse existing app render state and share-path helpers. Add a small panel below the resolver/gallery area that shows the current safe share URL, the approved `Portable Agent Identity` framing, and copy guidance without adding wallet, claim, transfer, payment, approval, or dynamic OG promises.

**Tech Stack:** Vite, vanilla DOM rendering, Node test runner, jsdom.

---

## Chunk 1: Share panel UI

### Files

- Modify: `apps/web/src/app.js` - render share panel and derive safe URL from `liveProfilePage.sharePath`.
- Modify: `apps/web/src/styles.css` - add compact share panel styles.
- Modify: `apps/web/test/app.test.mjs` - test static and live panel behavior.
- Modify: `apps/web/test/wording.test.mjs` - rely on existing blocked action wording gate.

### Task 1: Add tested display-only share panel

- [ ] Write failing app tests for a `.share-panel` showing `Portable Agent Identity`, a safe `/multipass/` URL, and no executable action language.
- [ ] Run focused app tests and confirm failure.
- [ ] Implement `renderSharePanel(data)` in `apps/web/src/app.js` using existing safe share-path behavior.
- [ ] Add CSS for `.share-panel` in `apps/web/src/styles.css`.
- [ ] Run focused tests and confirm pass.
- [ ] Run full test/build/diff gates.
- [ ] Commit, push, rebuild Helixa artifact, deploy, and smoke live HTML/bundle.
