# Bankr RUNTIME Artifact Manifest

**Project:** Loopers Runtime Console
**Event:** RUNTIME: Build + Demo Day
**Deadline:** 2026-09-20 04:00 UTC

## Public artifacts

| Artifact | Repository path or host | Status | Public URL | Verification |
| --- | --- | --- | --- | --- |
| Judge packet | `apps/web/src/runtime-submission.js` | public | https://helixa.xyz/multipass/runtime | `curl -I https://helixa.xyz/multipass/runtime` + route tests |
| Live Console | `apps/web/src/multipass-console.js` | public | https://helixa.xyz/multipass/console | `curl -I https://helixa.xyz/multipass/console` + desktop/mobile browser smoke |
| Technical proof | `docs/hackathon/bankr-runtime-console-demo.md` | public after push | https://github.com/Bendr-20/multipass/blob/submission/bankr-runtime-clean-2026-09-19/docs/hackathon/bankr-runtime-console-demo.md | Review against fresh test/build/live evidence |
| Demo video | `public visual fallback` | public visual fallback | https://helixa.xyz/multipass/runtime/loopers-runtime-console-demo.mp4 | Public unauthenticated playback before form submission |

## Public proof summary

- **Bankr gateway:** Production verified. A holder-authenticated Console message returned through the Bankr LLM Gateway provider path.
- **XMTP live:** Production verified. The canonical Looper room used XMTP group transport and can be recovered by a fresh signed session.
- **Sibyl memory:** Production verified. The runtime recalls durable context before inference and saves bounded memory after the response.
- **ERC-8004 identity:** Onchain bound. Looper #2431 resolves to its existing ERC-8004 agent #89144 on Base.
- **Review-only:** Enforced. Responses may include proposals, but execution remains disabled and external actions require holder review.

## Publication boundary

This manifest contains only public product links, public onchain identifiers, aggregate verification results, and deliberate demo copy. Operational credentials, signing material, private memory, session material, and raw transport identifiers are excluded.
