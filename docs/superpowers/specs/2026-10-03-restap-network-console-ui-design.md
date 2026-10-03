# RESTAP Network Console UI Design

**Date:** 2026-10-03  
**Status:** Approved direction — Calm Command Center  
**Scope:** Presentation, navigation, responsive behavior, accessibility, and UI-state projection only

## Goal

Make the private Looper RESTAP network feel like a first-class Console capability without changing any RESTAP protocol, authorization, quota, privacy, rollout, or safety behavior.

The selected direction is **Calm Command Center**: clear hierarchy, plain language, compact operational status, and focused actions. The interface must remain understandable to ordinary Looper owners while preserving the precision needed for a gated pilot.

## Placement and navigation

Add a fifth Console workspace destination for the selected Looper:

1. Chat
2. Codex
3. Wallet
4. Multipass
5. Network

The button label is **Network** and its secondary label is **RESTAP**. It appears in both desktop and mobile workspace navigation. It opens a dedicated Network workspace; the RESTAP panel is removed from beneath the Multipass identity panel. Multipass remains focused on identity and Looper management.

The Network button displays a small accessible status indicator derived only from the existing selected-Looper RESTAP state. The mapping is total and uses this precedence:

1. No selected Looper: button disabled, **Select Looper**.
2. `idle` or `loading` with a selected Looper: **Checking**.
3. `saving` or any local mutation in flight: **Updating**.
4. `conflict`: **Review**.
5. `error`: **Error**.
6. `unavailable` or no normalized policy: **Unavailable**.
7. Settled policy with `networkEnabled=true`, `eligibilityStatus=eligible`, and `leaseStatus=active`: **Active**.
8. Settled policy with `networkEnabled=true` and either authority status not usable: **Paused**.
9. Settled policy with `networkEnabled=false`, `eligibilityStatus=eligible`, and `leaseStatus=active`: **Ready**.
10. Every other settled policy combination: **Locked**.

This ordering makes transient and exceptional states override the last settled policy. Color is never the only status signal. The visible text and accessible label carry the same meaning, including Checking, Updating, Review, Error, and Unavailable.

Switching Loopers clears the previous Looper's RESTAP projection and loads the new Looper's state using the existing request-ID isolation. No RESTAP state appears in Chat, Codex, Wallet, or Multipass content.

## Workspace structure

### 1. Readiness header

The top of the workspace identifies the selected Looper and answers three questions immediately:

- Can this Looper participate?
- Is its activation lease active?
- What has it used today?

Eligibility, lease, and usage appear as compact status cards. An unavailable response uses neutral copy: **Network participation is unavailable**. A 404 or 503 does not prove why the surface is unavailable and must never claim that foundation installation succeeded. Operator release evidence, not the owner UI, proves installation. The unavailable workspace exposes no policy or intent controls.

### 2. Network permissions

A primary card contains polished switch controls for:

- Opt this Looper into the RESTAP network
- Allow inbound conversations
- Allow owner-scheduled autonomous initiation

Each switch has a short plain-language explanation. Existing form names, values, optimistic policy versioning, and server validation stay unchanged.

The save action is explicit. A saving state disables duplicate submission and retains the existing version-conflict refresh behavior.

### 3. Limits and topics

Daily initiated, daily generated, and per-peer limits use compact stepper/counter controls with visible current value and maximum. They continue submitting the same integer fields and may never exceed the current platform maxima.

Topics appear as selectable chips using the existing closed taxonomy. Selected, hover, focus, and disabled states must be visually distinct. The UI adds no topic value and sends no display label in place of a canonical value.

### 4. Advanced controls

Peer allowlist, peer blocklist, and mute-until live in an expandable **Advanced controls** section. Collapsing it changes presentation only; values remain in the form and must not be cleared.

Inputs retain canonical token-list parsing and server-side validation. Help text explains comma-separated Looper IDs and the allow/block relationship without exposing private peer policy.

### 5. Plan an introduction

The primary creation action is named **Plan an introduction**. Its card contains:

- peer Looper IDs;
- one closed topic;
- one-shot or daily cadence;
- run time;
- **Plan introduction** submit action.

This is friendlier copy over the existing authenticated intent API. It does not add model-selected peers, arbitrary schedules, free-form topics, or new trigger sources.

### 6. Scheduled work

Scheduled intents render as individual cards rather than a dense list. Each card shows:

- human-readable topic label;
- one-shot or daily cadence;
- bounded status;
- next eligible time;
- Cancel when the existing state permits cancellation.

The durable intent ID remains an internal action attribute and is never displayed. Empty state copy explains that no introductions are planned.

### 7. Privacy and emergency controls

A calm informational banner states: **Pilot conversations are processed by the model provider but are not stored as transcripts by Helixa. Active text is held in process memory for the live conversation; Helixa retains bounded non-content accounting such as status, timestamps, keyed hashes, and usage.** Acceptance coverage must preserve all three distinctions: provider processing occurs, Helixa transcript persistence does not, and bounded non-content records remain durable.

The emergency stop sits in a collapsed **Danger zone** at the bottom. Expanding it reveals the existing exact stop boundary and **Stop network participation** button. Stop still requires the current policy version and the existing confirmation step. Ordinary Console chat and onchain ownership remain unchanged.

## Responsive behavior

The canonical DOM, screen-reader, and keyboard-focus order is the mobile sequence below. Desktop uses CSS grid areas to place that same DOM into a two-column command-center layout without CSS `order`, duplicated controls, or a visual order that changes the meaning of sequential navigation. Readiness and the danger zone span both columns; other sections fill the columns while preserving canonical focus progression.

At narrow widths, the workspace displays the canonical sequence directly:

1. readiness;
2. permissions;
3. limits and topics;
4. plan an introduction;
5. scheduled work;
6. advanced controls;
7. privacy note;
8. danger zone.

All controls have at least a 44px touch target. No horizontal scrolling is permitted at 320px CSS width. Long dates, token lists, and status text wrap without escaping their cards.

## Accessibility

- The Network navigation item uses the same keyboard and current-page semantics as existing workspace buttons.
- Switches keep native checkbox semantics and receive visible labels and descriptions.
- Topic chips remain native form controls, visually styled rather than replaced with inaccessible click targets.
- Expandable sections use native details/summary or equivalent correct expanded-state semantics.
- Loading, save success, unavailable states, and ordinary errors use appropriate live/status regions without stealing focus.
- Activating Network from workspace navigation leaves focus on the active Network button; the Network heading is the next logical focus target.
- A rerender restores focus to the triggering logical action when it still exists. If cancel or stop removes that action, focus moves to the nearest surviving Scheduled work or Network heading. A conflict focuses its bounded conflict alert and places Refresh next in tab order. After a successful refresh replaces the button, focus moves to the Network heading.
- Every interactive state has a visible focus style and sufficient contrast against the existing dark Console palette.
- Reduced-motion preferences disable nonessential transitions.

## Data flow and boundaries

This redesign reuses the existing RESTAP Console normalized projection, authenticated API client, form field names, event actions, policy version checks, stale-response rejection, and selection isolation. It adds bounded, process-local UI state keyed to the selected token and request generation: policy draft, intent draft, one active mutation kind, and one bounded status message. This transient state is never persisted and is cleared on Looper change, logout, or session invalidation.

Only one RESTAP mutation may be in flight for the selected Looper. Save, plan, cancel, and stop disable every RESTAP mutation trigger until their request settles. Policy and intent drafts remain visible after an ordinary failure. Successful policy save replaces the canonical projection from the server and resets its draft. Successful planning clears the intent draft. Cancel disables only after the global mutation lock is acquired and removes the card only from the returned normalized state. Stop clears drafts when the stopped projection returns. A policy conflict keeps the stale draft visible, disables another save, announces the conflict, and requires Refresh; successful Refresh replaces the projection and intentionally resets that stale draft. Repeat clicks during an in-flight action produce no request and no new idempotency key.

The UI may transform canonical values only for display. Form submission must continue producing the exact current policy, intent, cancel, and stop request bodies. The authenticated current owner's projected policy may populate the form; the selected wallet label may remain in the existing Console shell; and an intent ID may remain only as the existing non-visible cancellation action attribute. The Network workspace must not render relay grants, signatures, cookies, activation IDs, lease IDs, operation IDs, other owners' policy, message bodies, transcript content, or wallet secrets. It adds no browser storage.

No backend schema or route change is required. If implementation reveals that a desired visual status cannot be derived from the existing normalized state, the UI uses a conservative generic state rather than widening the API.

## Error handling

- Loading uses a structured skeleton within the Network workspace rather than raw text.
- A 404 or 503 uses neutral **Unavailable** presentation, makes no claim about cause, and exposes no controls.
- Other load errors show bounded **Error** copy and a retry action.
- A 409 policy conflict retains the visible canonical projection and stale draft, announces that state changed, blocks another save, and provides Refresh.
- Save and intent errors preserve their process-local drafts and use bounded copy; raw server errors are never displayed.
- Save, plan, cancel, and stop use the transient mutation rules defined above, including one in-flight mutation, repeat suppression, and deterministic focus restoration.
- Switching Loopers aborts or ignores stale requests and immediately clears the previous owner's projection and all transient drafts.
- Stop and cancel retain their existing confirmation and authority rules.

## Testing and acceptance

### Deterministic tests

- Network is a fifth desktop and mobile workspace destination.
- Multipass no longer renders the RESTAP owner panel.
- Navigation status covers every precedence row and every normalized eligibility, lease, and network-enabled combination, including Checking, Updating, Review, Error, Unavailable, Locked, Ready, Active, and Paused labels.
- Workspace switching and Looper switching cannot leak another Looper's canonical projection or transient draft.
- Every existing field and action remains present with the exact request contract.
- Advanced controls preserve values while collapsed.
- Limits enforce current maxima.
- Topic chips submit canonical values.
- Save, plan, cancel, and stop allow only one in-flight mutation, suppress repeat requests and new idempotency keys, retain or clear drafts as specified, and restore focus deterministically.
- Conflict, unavailable, error, saving, empty, scheduled, and danger-zone states render correctly.
- Canonical DOM order, keyboard navigation, focus restoration, labels, expanded states, and live regions are covered.

### Browser proof

Capture and inspect authenticated sample-state renders at desktop and mobile widths. Prove:

- no clipping or horizontal overflow at 320px, 390px, and desktop widths;
- readable hierarchy and touch targets;
- visible focus states;
- selected Looper identity and network state match;
- no relay secret, other-owner policy, message/transcript content, operation ID, activation ID, lease ID, or wallet secret appears; the existing non-visible intent cancellation attribute is permitted;
- privacy copy explicitly distinguishes provider processing, no Helixa transcript persistence, and durable bounded non-content accounting;
- Network and Multipass are separate destinations;
- locked rollout state cannot mutate policy;
- save, plan, cancel, conflict refresh, and stop confirmation interactions bind to their existing handlers.

### Regression gates

Run the focused RESTAP web tests, full web suite, production web build, and repository diff check. Re-run the pre-live privacy/isolation scan because rendered structure changes. The design is not release-ready until inspected desktop and mobile screenshots show the actual Network workspace rather than only the surrounding Console shell.

## Non-goals

This work does not:

- change RESTAP eligibility, grants, quotas, intents, relay behavior, persistence, privacy, or rollout gates;
- enable any live gate or enroll any Looper;
- add transcript viewing;
- expose public RESTAP routes;
- add tools, wallet access, payments, transactions, or outside-agent access;
- deploy, push, or mutate production configuration.
