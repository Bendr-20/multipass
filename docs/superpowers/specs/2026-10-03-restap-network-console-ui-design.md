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

The Network button displays a small accessible status indicator derived only from the existing selected-Looper RESTAP state:

- **Locked:** network controls are unavailable in the current rollout phase.
- **Ready:** the Looper is eligible and has an active lease, but network participation is off.
- **Active:** the Looper is opted in.
- **Paused:** the Looper has network configuration but cannot currently participate because its lease or eligibility is unavailable.

Color is never the only status signal. The visible text and an accessible label carry the same meaning.

Switching Loopers clears the previous Looper's RESTAP projection and loads the new Looper's state using the existing request-ID isolation. No RESTAP state appears in Chat, Codex, Wallet, or Multipass content.

## Workspace structure

### 1. Readiness header

The top of the workspace identifies the selected Looper and answers three questions immediately:

- Can this Looper participate?
- Is its activation lease active?
- What has it used today?

Eligibility, lease, and usage appear as compact status cards. Rollout-locked state uses a calm explanatory banner: **Foundation installed · participation unavailable**. It must not present policy controls as actionable while the server rejects policy access.

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

A calm informational banner states that pilot conversation text stays in memory and transcripts are unavailable. It must not imply that provider processing or durable non-content accounting is absent.

The emergency stop sits in a collapsed **Danger zone** at the bottom. Expanding it reveals the existing exact stop boundary and **Stop network participation** button. Stop still requires the current policy version and the existing confirmation step. Ordinary Console chat and onchain ownership remain unchanged.

## Responsive behavior

Desktop uses a two-column command-center layout:

- left: permissions, limits, topics, advanced controls;
- right: plan an introduction, scheduled work, privacy note;
- readiness spans both columns;
- danger zone spans both columns at the bottom.

At narrow widths, the workspace becomes one vertical flow in this order:

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
- Loading, save success, conflicts, unavailable states, and errors use appropriate live/status regions without stealing focus.
- Every interactive state has a visible focus style and sufficient contrast against the existing dark Console palette.
- Reduced-motion preferences disable nonessential transitions.

## Data flow and boundaries

This redesign reuses the existing RESTAP Console state, strict response normalization, authenticated API client, form field names, event actions, policy version checks, stale-response rejection, and selection isolation.

The UI may transform canonical values only for display. Form submission must continue producing the exact current policy, intent, cancel, and stop request bodies. No grant, lease ID, wallet value, operation ID, private policy, message content, or transcript state enters the DOM, browser storage, or response projection.

No backend schema or route change is required. If implementation reveals that a desired visual status cannot be derived from the existing normalized state, the UI must use a conservative generic state rather than widening the API.

## Error handling

- Loading uses a structured skeleton within the Network workspace rather than raw text.
- A rollout-locked 404/503 uses the locked presentation and exposes no controls.
- Other load errors show a bounded retry action.
- A 409 policy conflict retains the visible projection, announces that state changed, and provides Refresh before another save.
- Save and intent errors preserve entered values where safe and use bounded copy; raw server errors are never displayed.
- Switching Loopers aborts or ignores stale requests and immediately clears the previous owner's projection.
- Stop and cancel retain their existing confirmation and state rules.

## Testing and acceptance

### Deterministic tests

- Network is a fifth desktop and mobile workspace destination.
- Multipass no longer renders the RESTAP owner panel.
- Navigation status maps correctly to locked, ready, active, and paused using existing normalized state.
- Workspace switching and Looper switching cannot leak another Looper's projection.
- Every existing field and action remains present with the exact request contract.
- Advanced controls preserve values while collapsed.
- Limits enforce current maxima.
- Topic chips submit canonical values.
- Conflict, unavailable, error, saving, empty, scheduled, and danger-zone states render correctly.
- Keyboard navigation, labels, expanded states, and live regions are covered.

### Browser proof

Capture and inspect authenticated sample-state renders at desktop and mobile widths. Prove:

- no clipping or horizontal overflow at 320px, 390px, and desktop widths;
- readable hierarchy and touch targets;
- visible focus states;
- selected Looper identity and network state match;
- no private content, grant, raw wallet, or internal ID appears;
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
