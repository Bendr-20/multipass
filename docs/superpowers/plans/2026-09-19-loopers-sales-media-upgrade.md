# Loopers Sales Media Upgrade Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make single-sale Telegram alerts show the exact sold Looper and sweep alerts use Epifani's approved animation, while preserving one post per transaction and the existing durable delivery guarantees.

**Architecture:** Keep the current sales orchestrator and Telegram adapter boundaries. The Telegram adapter deterministically derives a canonical image URL from each normalized token ID, renders an animation only for groups with multiple items, executes ordered media fallbacks, and converts late photo deliveries to animation in place. The orchestrator owns configuration and persists the delivery mode returned by Telegram; the web package carries the immutable GIF asset deployed independently to the live static directory.

**Tech Stack:** Node.js 24 ESM, built-in `node:test`, Telegram Bot API JSON methods, Vite/pnpm web build, systemd, Git worktrees.

**Approved spec:** `docs/superpowers/specs/2026-09-19-loopers-sales-media-upgrade-design.md`

**Execution workspace:** `/home/ubuntu/.config/superpowers/worktrees/multipass/feature-loopers-sales-media`

**Baseline:** `node --test apps/api/test/loopers-sales-*.test.mjs apps/api/test/loopers-activity-bot.test.mjs` passes 99/99 before implementation.

**Plan publication:** After this plan is approved, commit both this plan and `docs/superpowers/plans/2026-09-19-loopers-sales-media-deploy.sh` as one standalone documentation/rollout-harness commit before Task 1. All later clean-tree and production-copy checks include both committed files.

---

## Chunk 1: Implementation and rollout

### File map

- Modify `apps/api/src/loopers-sales/telegram.js`: deterministic Looper-image URL construction, sweep media rendering, animation/photo/text send fallbacks, and late photo-to-animation edits.
- Modify `apps/api/test/loopers-sales-telegram.test.mjs`: exact media-selection, fallback-order, safety, and edit-transition coverage.
- Modify `apps/api/src/loopers-sales-bot.js`: sweep-animation configuration, rendering option propagation, `--no-images` behavior, and persisted edit-mode transitions.
- Modify `apps/api/scripts/run-loopers-sales-bot.js`: help text for the non-secret sweep-animation URL flag/environment setting.
- Modify `apps/api/test/loopers-sales-bot.test.mjs`: configuration parsing and late-mode persistence coverage.
- Modify `.gitignore`: allow only the approved `apps/web/public/loopers-sweep.gif` through the repository-wide `*.gif` ignore rule.
- Create `apps/web/public/loopers-sweep.gif`: immutable approved animation bytes.
- Modify `deploy/systemd/loopers-sales-bot.service`: production animation URL setting.
- Modify `apps/api/test/loopers-sales-rollout.test.mjs`: unit setting plus exact asset checksum/header/size regression.
- Create `docs/superpowers/plans/2026-09-19-loopers-sales-media-deploy.sh`: one self-contained, trap-protected manifest backup/integration/deploy/rollback harness.

### Task 1: Telegram media selection and delivery

**Files:**
- Modify: `apps/api/src/loopers-sales/telegram.js:1-340`
- Test: `apps/api/test/loopers-sales-telegram.test.mjs:1-240`

- [ ] **Step 1: Write failing deterministic-media tests**

Update imports to include `buildCanonicalLooperImageUrl` and `LOOPERS_SWEEP_ANIMATION_URL`, then add tests equivalent to:

```js
test('builds only canonical Looper image URLs from normalized token IDs', () => {
  assert.equal(buildCanonicalLooperImageUrl('6366'), 'https://helixa.xyz/loopers/images/6366.png');
  for (const value of ['', '06366', '-1', '1/2', 'abc', `${2n ** 256n}`]) {
    assert.equal(buildCanonicalLooperImageUrl(value), null);
  }
});

test('single cards prefer the exact canonical Looper image before the OpenSea image', () => {
  const card = renderSaleCard({ transactionHash: TX, items: [item()] }, {
    floorSnapshot: floor(), multiplier: { numerator: 5n, denominator: 4n },
    sweepAnimationUrl: LOOPERS_SWEEP_ANIMATION_URL,
  });
  assert.equal(card.animationUrl, null);
  assert.deepEqual(card.imageUrls, [
    'https://helixa.xyz/loopers/images/6366.png',
    'https://i2c.seadn.io/loopers/6366.png',
  ]);
});

test('sweep cards use the approved animation and first sorted Looper fallbacks', () => {
  const card = renderSaleCard({ transactionHash: TX, items: [
    item({ tokenId: '10', imageUrl: 'https://i2c.seadn.io/loopers/10.png' }),
    item({ tokenId: '2', imageUrl: 'https://i2c.seadn.io/loopers/2.png' }),
  ] }, {
    floorSnapshot: floor(), multiplier: { numerator: 5n, denominator: 4n },
    sweepAnimationUrl: LOOPERS_SWEEP_ANIMATION_URL,
  });
  assert.equal(card.animationUrl, LOOPERS_SWEEP_ANIMATION_URL);
  assert.deepEqual(card.imageUrls, [
    'https://helixa.xyz/loopers/images/2.png',
    'https://i2c.seadn.io/loopers/2.png',
  ]);
});

test('rejects every unsafe sweep animation URL form', () => {
  for (const value of [
    'http://helixa.xyz/multipass/loopers-sweep.gif',
    'https://user:pass@helixa.xyz/multipass/loopers-sweep.gif',
    'https://helixa.xyz:444/multipass/loopers-sweep.gif',
    'https://helixa.xyz:443/multipass/loopers-sweep.gif',
    'https://127.0.0.1/multipass/loopers-sweep.gif',
    'https://helixa.xyz.evil.example/multipass/loopers-sweep.gif',
    'https://helixa.xyz/multipass/loopers-sweep.gif?x=1',
    'https://helixa.xyz/multipass/loopers-sweep.gif#x',
    'https://helixa.xyz/multipass/not-approved.gif',
  ]) assert.equal(validateSweepAnimationUrl(value), null);
});
```

Also update the existing render assertions that currently expect the OpenSea URL in `card.imageUrl`: the primary image is now the deterministic canonical URL, while the OpenSea URL remains the second `imageUrls` fallback. Preserve the existing malicious-host test and assert that neither an invalid animation URL nor an untrusted event image is ever submitted to Telegram.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
node --test apps/api/test/loopers-sales-telegram.test.mjs
```

Expected: FAIL because the new export/card fields do not exist.

- [ ] **Step 3: Implement deterministic rendering**

In `telegram.js`:

```js
export const LOOPERS_SWEEP_ANIMATION_URL = 'https://helixa.xyz/multipass/loopers-sweep.gif';
const MAX_UINT256 = (2n ** 256n) - 1n;

export function buildCanonicalLooperImageUrl(tokenId) {
  const value = String(tokenId ?? '');
  if (!/^(?:0|[1-9]\d*)$/.test(value)) return null;
  try {
    if (BigInt(value) > MAX_UINT256) return null;
  } catch {
    return null;
  }
  return `https://helixa.xyz/loopers/images/${value}.png`;
}
```

Add a strict animation validator that accepts only exact string equality with `LOOPERS_SWEEP_ANIMATION_URL`. Exact equality intentionally rejects credentials, every explicit port including normalized-away `:443`, query/hash suffixes, alternate paths, non-HTTPS schemes, IP literals, and lookalike hosts. Sort group items with the existing token comparator; choose the first sorted item for canonical and trusted OpenSea photo fallbacks. Return:

```js
{
  caption,
  conciseCaption,
  text,
  conciseText,
  animationUrl: sweep ? validatedAnimationUrl : null,
  imageUrls: [...new Set([canonicalImageUrl, trustedOpenSeaImageUrl].filter(Boolean))],
  imageUrl: firstImageUrl,
  fallbackImageUrl: LOOPERS_LOGO_URL,
  premium,
}
```

Keep `imageUrl` for compatibility with current callers/tests.

- [ ] **Step 4: Add failing send/fallback/edit tests**

Add standalone tests using a manually constructed card with deliberately distinct variants (`caption: 'full caption'`, `conciseCaption: 'concise caption'`, `text: 'full text'`, `conciseText: 'concise text'`) so Telegram's duplicate-variant removal cannot collapse the calls. Assert:

```js
// Initial sweep preserves the exact rendered full caption.
assert.equal(methods[0], 'sendAnimation');
assert.equal(calls[0].body.animation, LOOPERS_SWEEP_ANIMATION_URL);
assert.equal(calls[0].body.caption, card.caption);
assert.deepEqual(result, { messageId: 20, mode: 'animation' });

// A content rejection retries the exact concise caption.
assert.equal(calls[1].body.caption, card.conciseCaption);

// All animation/photo media rejected.
assert.deepEqual(methods, [
  'sendAnimation',
  'sendPhoto', // canonical first sorted Looper
  'sendPhoto', // trusted OpenSea image for same Looper
  'sendPhoto', // logo
  'sendMessage',
]);

// Late single -> sweep conversion preserves the exact full caption.
assert.equal(methods[0], 'editMessageMedia');
assert.equal(calls[0].body.media.type, 'animation');
assert.equal(calls[0].body.media.caption, card.caption);
assert.deepEqual(result, { messageId: 44, mode: 'animation' });

// editMessageMedia content rejection retries the exact concise caption.
assert.equal(calls[1].body.media.caption, card.conciseCaption);

// Rejected media conversion preserves the existing photo and exact updated caption.
assert.deepEqual(methods, ['editMessageMedia', 'editMessageCaption']);
assert.equal(calls.at(-1).body.caption, card.caption);
assert.deepEqual(result, { messageId: 44, mode: 'photo' });

// Existing animation edits only its exact full/concise caption variants.
assert.equal(methods[0], 'editMessageCaption');
assert.equal(calls[0].body.caption, card.caption);
assert.equal(calls[1].body.caption, card.conciseCaption);

// Durable retry: Telegram already converted photo -> animation, then state save failed.
// A retried editMessageMedia returns "message is not modified" and must persist animation mode.
assert.deepEqual(result, { messageId: 44, mode: 'animation' });
```

Also update the pre-existing photo fallback test to expect canonical image, trusted OpenSea image, logo, then text.

- [ ] **Step 5: Run the focused tests and verify RED**

Run:

```bash
node --test apps/api/test/loopers-sales-telegram.test.mjs
```

Expected: media-method/order/edit assertions fail before delivery changes.

- [ ] **Step 6: Implement animation send and edit behavior**

Refactor `sendSaleCard` to:

1. try `sendAnimation` with full then concise caption when `card.animationUrl` exists;
2. on a classified media error, continue through unique `card.imageUrls` and the logo with `sendPhoto`;
3. on exhausted content errors, go directly to text;
4. preserve fatal and exhausted retryable errors;
5. return mode `animation`, `photo`, or `text` from the accepted Telegram method.

Refactor `editSaleCard` to accept all three modes. For `mode === 'photo' && card.animationUrl`, first try:

```js
{
  method: 'editMessageMedia',
  payload: {
    chat_id: chatId,
    message_id: messageId,
    media: {
      type: 'animation',
      media: card.animationUrl,
      caption,
      parse_mode: 'HTML',
    },
  },
}
```

Return `mode: 'animation'` on success. On classified media rejection only, preserve the photo and use `editMessageCaption`; on content errors try concise content; on fatal/retryable/unresolved errors preserve existing behavior. If `editMessageMedia` returns `message is not modified`, treat it as a successful prior conversion and return `mode: 'animation'` so a retry after state-write failure repairs durable state.

- [ ] **Step 7: Run Telegram tests and verify GREEN**

Run:

```bash
node --test apps/api/test/loopers-sales-telegram.test.mjs
```

Expected: all tests pass.

- [ ] **Step 8: Commit Telegram adapter changes**

```bash
git add apps/api/src/loopers-sales/telegram.js apps/api/test/loopers-sales-telegram.test.mjs
git commit -m "feat: add exact Looper and sweep sale media"
```

### Task 2: Orchestrator configuration and durable mode transitions

**Files:**
- Modify: `apps/api/src/loopers-sales-bot.js:15-90,190-230,270-325,515-550`
- Modify: `apps/api/scripts/run-loopers-sales-bot.js:10-35`
- Test: `apps/api/test/loopers-sales-bot.test.mjs:90-140,250-315`

- [ ] **Step 1: Write failing configuration and persistence tests**

Extend the options test:

```js
assert.equal(defaults.sweepAnimationUrl, 'https://helixa.xyz/multipass/loopers-sweep.gif');
const configured = parseLoopersSalesBotOptions(['--sweep-animation-url', 'https://helixa.xyz/multipass/loopers-sweep.gif'], env);
assert.equal(configured.sweepAnimationUrl, 'https://helixa.xyz/multipass/loopers-sweep.gif');
assert.throws(
  () => parseLoopersSalesBotOptions(['--sweep-animation-url', 'https://evil.example/sweep.gif'], { HOME: '/h' }),
  /sweep animation URL/i,
);

const fromEnv = parseLoopersSalesBotOptions([], {
  HOME: '/h',
  LOOPERS_SALES_SWEEP_ANIMATION_URL: 'https://helixa.xyz/multipass/loopers-sweep.gif',
});
assert.equal(fromEnv.sweepAnimationUrl, 'https://helixa.xyz/multipass/loopers-sweep.gif');
```

Before implementation, extend the existing runner-help test:

```js
assert.match(output.join('\n'), /--sweep-animation-url/);
assert.match(output.join('\n'), /LOOPERS_SALES_SWEEP_ANIMATION_URL/);
```

Update the late-sibling test so the injected edit function returns `{ messageId, mode: 'animation' }`, then assert:

```js
assert.equal(h.getState().deliveredTransactions[TX].mode, 'animation');
```

Add a render spy proving both finalization and late edits receive `sweepAnimationUrl`. Add a failing `--no-images` test before implementation: prove the initial `sendCard` receives no animation/photo candidates and a late sibling cannot trigger `editMessageMedia` because the rendered card has `animationUrl: null`.

- [ ] **Step 2: Run bot tests and verify RED**

```bash
node --test apps/api/test/loopers-sales-bot.test.mjs
```

Expected: missing option/validation and unchanged delivered mode failures.

- [ ] **Step 3: Implement configuration and mode persistence**

Import the approved animation constant/validator from `telegram.js` or expose one focused validator there. Add:

```js
sweepAnimationUrl: env.LOOPERS_SALES_SWEEP_ANIMATION_URL || LOOPERS_SWEEP_ANIMATION_URL,
```

Parse `--sweep-animation-url`, validate it after argv parsing, and list the flag/environment variable in runner help. Pass it into every `renderCard` call, but suppress it at render time when images are disabled so late edits cannot accidentally animate:

```js
renderCard(cardGroup, {
  floorSnapshot,
  multiplier,
  sweepAnimationUrl: options.sendImages ? options.sweepAnimationUrl : '',
});
```

For initial sends with images disabled, also clear `animationUrl`, `imageUrls`, `imageUrl`, and `fallbackImageUrl` before Telegram delivery.

Capture edit results and persist a returned mode transition:

```js
const editedDelivery = await editCard({ ... });
delivered.mode = editedDelivery.mode;
```

- [ ] **Step 4: Run bot tests and verify GREEN**

```bash
node --test apps/api/test/loopers-sales-bot.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Run combined sales tests**

```bash
node --test apps/api/test/loopers-sales-*.test.mjs
```

Expected: all sales tests pass.

- [ ] **Step 6: Commit orchestrator changes**

```bash
git add apps/api/src/loopers-sales-bot.js apps/api/scripts/run-loopers-sales-bot.js apps/api/test/loopers-sales-bot.test.mjs
git commit -m "feat: persist Loopers sweep media delivery mode"
```

### Task 3: Immutable asset and production configuration

**Files:**
- Modify: `.gitignore`
- Create: `apps/web/public/loopers-sweep.gif`
- Modify: `deploy/systemd/loopers-sales-bot.service:10-20`
- Modify: `apps/api/test/loopers-sales-rollout.test.mjs:1-45`

- [ ] **Step 1: Write failing asset/unit regression tests**

Import `createHash` from `node:crypto` and `stat` from `node:fs/promises`. Add:

```js
const sweepAssetPath = path.join(root, 'apps/web/public/loopers-sweep.gif');

test('approved sweep animation and production URL are pinned', async () => {
  const bytes = await readFile(sweepAssetPath);
  const details = await stat(sweepAssetPath);
  assert.equal(details.size, 2_234_613);
  assert.equal(bytes.subarray(0, 6).toString('ascii'), 'GIF89a');
  assert.equal(bytes.readUInt16LE(6), 720);
  assert.equal(bytes.readUInt16LE(8), 900);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    '19fd7f4b4be9ea1aa7dc1a6763419a53c03533fea0f4c7a6eb8a9dc2cbd08572',
  );
  const unit = await readFile(unitPath, 'utf8');
  assert.match(unit, /Environment=LOOPERS_SALES_SWEEP_ANIMATION_URL=https:\/\/helixa\.xyz\/multipass\/loopers-sweep\.gif/);
});
```

- [ ] **Step 2: Run rollout test and verify RED**

```bash
node --test apps/api/test/loopers-sales-rollout.test.mjs
```

Expected: missing asset and missing unit setting.

- [ ] **Step 3: Copy the exact approved asset and update the unit**

```bash
printf '\n!apps/web/public/loopers-sweep.gif\n' >> .gitignore
cp /home/ubuntu/.openclaw/workspace/media/generated/epifani-looper-sweep.gif apps/web/public/loopers-sweep.gif
if git check-ignore -q apps/web/public/loopers-sweep.gif; then echo 'asset is still ignored' >&2; exit 1; fi
printf '%s  %s\n' '19fd7f4b4be9ea1aa7dc1a6763419a53c03533fea0f4c7a6eb8a9dc2cbd08572' 'apps/web/public/loopers-sweep.gif' | sha256sum -c -
test "$(file -b --mime-type apps/web/public/loopers-sweep.gif)" = image/gif
node - <<'NODE'
const { readFileSync, statSync } = require('node:fs');
const p = 'apps/web/public/loopers-sweep.gif';
const b = readFileSync(p);
if (statSync(p).size !== 2234613 || b.readUInt16LE(6) !== 720 || b.readUInt16LE(8) !== 900) process.exit(1);
NODE
```

Expected checksum:

```text
19fd7f4b4be9ea1aa7dc1a6763419a53c03533fea0f4c7a6eb8a9dc2cbd08572
```

Add to the unit:

```ini
Environment=LOOPERS_SALES_SWEEP_ANIMATION_URL=https://helixa.xyz/multipass/loopers-sweep.gif
```

- [ ] **Step 4: Run rollout test and verify GREEN**

```bash
node --test apps/api/test/loopers-sales-rollout.test.mjs
```

Expected: all rollout tests pass.

- [ ] **Step 5: Build the web package and verify the built bytes**

```bash
corepack pnpm web:build
for p in apps/web/public/loopers-sweep.gif apps/web/dist/loopers-sweep.gif; do
  printf '%s  %s\n' '19fd7f4b4be9ea1aa7dc1a6763419a53c03533fea0f4c7a6eb8a9dc2cbd08572' "$p" | sha256sum -c -
  test "$(file -b --mime-type "$p")" = image/gif
  P="$p" node - <<'NODE'
const { readFileSync, statSync } = require('node:fs');
const p = process.env.P;
const b = readFileSync(p);
if (statSync(p).size !== 2234613 || b.readUInt16LE(6) !== 720 || b.readUInt16LE(8) !== 900) process.exit(1);
NODE
done
```

Expected: both checksums pass, MIME is `image/gif`, size is `2234613`, and dimensions are `720x900`.

- [ ] **Step 6: Commit asset/configuration changes**

```bash
git add .gitignore apps/web/public/loopers-sweep.gif deploy/systemd/loopers-sales-bot.service apps/api/test/loopers-sales-rollout.test.mjs
git commit -m "feat: pin Loopers sweep animation asset"
```

### Task 4: Verification and code review

**Files:**
- Inspect only; fix only reviewed defects in the files above.

- [ ] **Step 1: Run focused regression suites**

```bash
node --test apps/api/test/loopers-sales-*.test.mjs apps/api/test/loopers-activity-bot.test.mjs
```

Expected: all tests pass, including the 99-test baseline plus new media tests.

- [ ] **Step 2: Run syntax checks**

```bash
node --check apps/api/src/loopers-sales/telegram.js
node --check apps/api/src/loopers-sales-bot.js
node --check apps/api/scripts/run-loopers-sales-bot.js
bash -n docs/superpowers/plans/2026-09-19-loopers-sales-media-deploy.sh
```

Expected: all exit 0.

- [ ] **Step 3: Inspect the exact feature diff**

```bash
git status --short
git diff --check c76b1a7..HEAD
git diff --stat c76b1a7..HEAD
git diff --name-status c76b1a7..HEAD
```

Expected: no uncommitted changes, no whitespace errors, and only the planned paths plus this plan.

- [ ] **Step 4: Request code review**

Use `superpowers:requesting-code-review` against base `c76b1a7` and feature `HEAD`. Fix Critical/Important findings with TDD, rerun Steps 1-3, and re-review until approved.

### Task 5: Controlled production integration and deployment

**Files:**
- Create and execute: `docs/superpowers/plans/2026-09-19-loopers-sales-media-deploy.sh`
- Reviewed worktree: `/home/ubuntu/.config/superpowers/worktrees/multipass/feature-loopers-sales-media`
- Production checkout: `/home/ubuntu/multipass`
- External rollback root: `/home/ubuntu/.local/state/helixa-deploy-backups`
- Live asset: `/var/www/helixa.xyz/multipass/loopers-sweep.gif`
- Installed unit: `/etc/systemd/system/loopers-sales-bot.service`

Use `multipass-static-deploy` for the live static write and `verification-before-completion` before any success claim. The committed deploy harness is the concrete one-process rollout interface; it carries a single `ERR`/`INT`/`TERM` trap through every production gate.

- [ ] **Step 1: Audit and syntax-check the exact deployment harness**

Read `docs/superpowers/plans/2026-09-19-loopers-sales-media-deploy.sh` completely and verify that it:

1. defines all manifest, backup, service, hash, size, and dimension values in one process;
2. requires an exact reviewed worktree HEAD, proves that the worktree is clean including untracked files before backup or mutation, and aborts on any tracked-dirty or pre-existing untracked/ignored production manifest overlap;
3. records Git HEAD/ref, unrelated staged patch, service active/enabled/PID/restarts, and state-file metadata;
4. backs up every repository, built, live, and installed-unit path outside the repository with existence, mode, UID, GID, size, and SHA-256;
5. copies only reviewed files and uses `git commit --only ... <exact pathspecs>`;
6. proves the unrelated staged patch is byte-for-byte unchanged after the path-limited commit;
7. runs integrated tests and syntax checks, then invokes the sales runner directly as `ubuntu` with `--probe`, the existing OpenSea config, and an isolated removed-before-use temporary state path; proves zero Telegram calls and an unchanged live-service PID without changing config/state-directory metadata;
8. fail-closed verifies source/built/live GIF checksum, MIME, size, and dimensions;
9. installs the reviewed unit, restarts once, then samples PID/restart count twice across five seconds and requires readiness;
10. traps every failed gate, stops the new service, manifest-restores/deletes every path and metadata field, rolls the Git ref/index paths back without touching unrelated paths, verifies restoration, then restores and proves the exact prior service state.

Run:

```bash
bash -n docs/superpowers/plans/2026-09-19-loopers-sales-media-deploy.sh
git diff --check c76b1a7..HEAD
```

Expected: both exit 0.

- [ ] **Step 2: Execute the single trap-protected rollout command**

From the reviewed worktree, run exactly:

```bash
LOOPERS_MEDIA_REVIEWED_HEAD=<final reviewed feature SHA> \
  docs/superpowers/plans/2026-09-19-loopers-sales-media-deploy.sh --install
```

Replace `<final reviewed feature SHA>` with the exact 40-character commit SHA approved in final review, not a branch name or other moving ref. Before creating the backup or mutating production, the harness requires that exact feature HEAD, requires actual production HEAD to equal its hardcoded reviewed base `c76b1a7635c4bc80b93c6619a5ed347a03b4d18a`, and requires an empty `git status --porcelain --untracked-files=all`; the ignored dist GIF is verified separately against the reviewed tracked public GIF. Expected success output names the retained external rollback directory. Any failed copy, test, direct no-mutation probe, HTTP asset verification, unit installation, restart, readiness, PID/restart stability, or state-permission check automatically runs the manifest rollback before exiting nonzero.

- [ ] **Step 3: Independently inspect success evidence**

Using the backup directory printed by the harness, verify:

```bash
cat "$BACKUP/pre-head" "$BACKUP/post-head"
cat "$BACKUP/pre-active" "$BACKUP/pre-enabled" "$BACKUP/pre-pid" "$BACKUP/pre-restarts"
cat "$BACKUP/pre-state-stat"
cat "$BACKUP/probe.log"
cat "$BACKUP/post-restart-journal"
systemctl is-active loopers-sales-bot.service
systemctl is-enabled loopers-sales-bot.service
systemctl show loopers-sales-bot.service -p MainPID -p NRestarts --no-pager
```

Expected: the production integration commit is recorded; probe reports ready with `telegramCalls:0`; service is active/enabled; readiness is in the post-restart journal; the harness already proved stable PID/restart count and `600 ubuntu:ubuntu` state permissions.

- [ ] **Step 4: Record verification evidence and finish the branch**

Keep the external rollback directory through final health verification. Update the progress card, record the repository-specific completion in the current daily memory with the required `<!-- project: github.com/Bendr-20/helixa -->` marker, and use `superpowers:finishing-a-development-branch` to close the isolated worktree safely.
