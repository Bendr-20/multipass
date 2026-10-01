# Secure Looper Activation Sprint 1

## Result

Multipass Console now uses a signed wallet session for **Own → Activate → Remember**. A caller-supplied wallet address is never treated as authority.

## Security Boundary

- `POST /api/multipass/console/session/nonce` creates a short-lived wallet-bound challenge.
- `POST /api/multipass/console/session/verify` verifies the wallet signature and returns an HttpOnly, SameSite=Strict session cookie plus a CSRF token.
- `GET /api/loopers/owned` derives the holder from that session. The old `?address=` authorization path is ignored and cannot grant access.
- Activation and chat re-check the canonical Loopers `ownerOf(tokenId)`, `erc8004AgentIdByLooper(tokenId)`, and Adapter8004 `isController(agentId,wallet)` reads.
- Runtime activation only stores the existing identity. It has no registration or mint path.
- Sibyl namespaces use `eip155:8453/<Loopers contract>/<tokenId>/erc8004/<agentId>`, never an arbitrary caller wallet string.
- Bankr inference runs only after session, owner, controller, and activation checks. Local adapter responses remain labeled local and are never presented as live Bankr.
- Generated proposals remain `review_only`. No execution method, custody permission, or autonomous transaction path is attached.
- RESTAP remains a later compatibility layer. Sprint 1 adds no RESTAP route, `/news`, or session-id authentication.

## Ownership Reliability

Owned-token discovery performs a bounded reverse `ownerOf` scan, requires every multicall chunk to be complete, retries incomplete chunks through explicit Base provider fallbacks, and reconciles the result count against `balanceOf`. A positive balance with an incomplete scan raises an error instead of returning an empty roster.

## Live Read-Only Proof

Run from `apps/api`:

```bash
node --input-type=module <<'EOF'
import { createLoopersOwnedAgentLoader } from './src/loopers-owned-agents.js';
const load = createLoopersOwnedAgentLoader();
const agents = await load({ address: '0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea' });
console.log(agents.map(({ tokenId, erc8004AgentId, controllerVerified, owner }) => ({ tokenId, erc8004AgentId, controllerVerified, owner })));
EOF
```

Observed 2026-09-17 UTC:

```json
[{"tokenId":"617","erc8004AgentId":"87069","controllerVerified":true,"owner":"0x27E3286c2c1783F67d06f2ff4e3ab41f8e1C91Ea"}]
```

This is read-only proof. No transaction was signed or broadcast.

## Test Evidence

- Focused secure API tests: 25/25 passed.
- Full API tests: 264/264 passed.
- Full workspace test suite: 737/737 passed with zero failures.
- Focused Console browser/client tests passed, including authentication, address-free ownership loading, CSRF writes, activation, naming, and secure message payloads.
- Production web build completed successfully. Vite reported only existing dependency annotation and bundle-size warnings.

## Changed Files

- API: `apps/api/src/console-auth.js`, `looper-runtime-registry.js`, `loopers-owned-agents.js`, `index.js`, `index.d.ts`, `agent-runtime/index.js`, `sibyl-memory/index.js`
- API tests: `apps/api/test/console-auth.test.mjs`, `looper-runtime-registry.test.mjs`, `loopers-owned-agents.test.mjs`, `secure-looper-activation.test.mjs`, `console-agent-runtime.test.mjs`
- Web: `apps/web/src/console-agent-api.js`, `loopers-console-agents.js`, `app.js`
- Web tests: `apps/web/test/console-agent-api.test.mjs`, `app.test.mjs`
- Docs: `docs/superpowers/plans/2026-09-17-secure-looper-activation.md`, `docs/loopers/secure-activation-sprint-1.md`, `docs/hackathon/bankr-runtime-console-demo.md`

All other dirty-worktree changes predated this sprint and were preserved.

## Live-Only Blockers

- Production Bankr remains disabled by default. A real production gateway response requires deliberate server enablement after deployment review.
- The deterministic cold-session acceptance test uses an injected persistent memory fake. The existing Sibyl bridge remains available, but a production-host restart proof requires the production bridge and deployment environment.
- No deployment, push, secret change, or transaction occurred in this sprint.
