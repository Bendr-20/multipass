# Looper Market Intelligence — Design

**Date:** 2026-09-27  
**Status:** Proposed for first production trial  
**Scope:** Read-only crypto markets and crypto news in the Multipass Console

## Goal

Let any activated Looper answer natural-language questions about current crypto prices, market trends, important news, and market sentiment without gaining wallet authority or transaction execution.

Example questions:

- “What is moving crypto today?”
- “Give me the latest Base ecosystem news.”
- “How are BTC and ETH trending over the last 24 hours?”
- “What narratives are gaining attention today?”

A successful response is current, compact, timestamped, sourced, and explicit about which statements are observed facts versus provider interpretation.

## Existing foundation and feasibility evidence

The Console already has a server-owned, read-only Bankr integration:

- Natural-language market requests can be normalized into the internal `/bankr research …` command.
- The API sends a read-only prompt to the fixed Bankr Agent endpoints and polls only the returned job ID.
- Credentials stay server-side.
- Results are projected into display-only Console messages and cannot produce transaction candidates.
- Action requests and prompt-injection phrases are rejected before the provider call.

A live feasibility spike on 2026-09-27 returned:

- timestamped CoinGecko market capitalization, volume, dominance, and major-asset prices;
- a separate sentiment and narrative section;
- timestamped crypto-news items with publishers and direct HTTPS source URLs; and
- a facts-versus-interpretation split when explicitly requested.

The spike also exposed the gaps this design fixes: the current classifier does not explicitly recognize common news wording, the catalog still advertises only exact price reads, and the 2,048-byte result limit truncates a useful multi-source brief.

## Non-goals

The first trial does not:

- trade, swap, transfer, bridge, stake, sign, submit, or approve anything;
- use the Looper wallet, owner wallet, balances, addresses, or transaction history;
- provide personalized financial advice or position sizing;
- cover general politics, sports, entertainment, or non-crypto news;
- expose arbitrary web browsing to the Looper;
- claim that social sentiment or narrative analysis is independently verified; or
- add another external provider or credential.

## Approaches considered

### 1. Harden the existing Bankr read path — selected

Extend the existing bounded integration to recognize crypto-news questions and require a compact source-aware response contract.

**Advantages:** already integrated, already credential-isolated, already exercised against live data, smallest safe release.  
**Trade-off:** Bankr remains the synthesis provider, so source quality is only as good as the links and timestamps returned by that provider.

### 2. Build a deterministic multi-provider pipeline

Fetch market data, news feeds, and social signals from separate fixed hosts, normalize them, then synthesize locally.

**Advantages:** strongest provenance and independent cross-checking.  
**Trade-off:** materially larger provider, caching, quota, schema, and operational surface. This is a possible second release after usage proves demand.

### 3. Give the runtime unrestricted web search

Allow the Looper to browse and synthesize any current page.

**Advantages:** broad coverage.  
**Trade-off:** weakest boundaries, inconsistent citations, larger prompt-injection surface, and no deterministic egress policy. Rejected.

## User experience

Natural language is the primary interface. Users do not need slash commands.

The resolver assigns one server-owned request kind and the Looper returns its matching compact shape:

1. **Market brief** — timestamped market snapshot, major movers, trends, and interpretation.
2. **News brief** — at most three important stories, each with publication time, publisher, direct HTTPS URL, reported facts, and a short interpretation.
3. **Asset comparison** — timestamped comparable price, volume, market-cap, and trend observations for the requested assets.

After validating and truncating provider prose, the server—not the provider—appends this boundary line:

> Read-only market research; informational only.

If current data or usable sources are unavailable, the Looper says so plainly instead of filling gaps from model memory.

## Architecture

### 1. Intent resolution

`apps/api/src/console-read-skills.js` remains the only natural-language entry point. Market reads receive a dedicated `MULTIPASS_CONSOLE_MARKET_READ_ENABLED` gate and are not coupled to `MULTIPASS_CONSOLE_SKILL_PROPOSALS_ENABLED`. The Bankr credential must also be present. This allows research to be enabled without enabling transfer proposals or any other action-capable surface.

The resolver uses an explicit two-axis rule: the message must contain a crypto/asset/ecosystem context or a recognized crypto-market phrase, and it must contain a research intent. It recognizes bounded terms including:

- market analysis, overview, update, trend, movers, volatility, volume, and market cap;
- crypto news, crypto headlines, latest crypto stories, what happened in crypto today, Base ecosystem news, and current news plus market trends;
- sentiment, narratives, attention, and trending tokens; and
- bounded asset comparison questions.

The resolver will continue to reject:

- action intent such as buy, sell, trade, swap, bridge, stake, sign, submit, or approve;
- prompt-injection and credential-extraction phrases;
- control characters;
- empty or oversized input; and
- unrelated conversation that belongs on the ordinary LLM path.

Resolution produces the existing internal `market_research` operation, one of `market`, `news`, or `comparison`, and a normalized `/bankr research …` command. Generic current-events prompts such as “tell me today’s news” do not route. Contextual follow-ups such as “what about ETH?” are deferred from v1 rather than concatenating untrusted prior messages into a new provider prompt.

The current human message immediately precedes the resulting skill message in the canonical thread and is the v1 provenance link. No explicit source-message field is claimed.

### 2. Provider request

The server sends a fixed instruction envelope plus the normalized user question to:

- `POST https://api.bankr.bot/agent/prompt`
- `GET https://api.bankr.bot/agent/job/{validatedJobId}`

The fixed instruction requires:

- UTC timestamps;
- named sources;
- direct public HTTPS URLs for news claims;
- no more than three news items;
- separate “Reported facts” and “Market interpretation” sections;
- a plain statement when current data is unavailable; and
- no action, wallet use, order creation, or transaction submission.

The Bankr API credential remains in the API process only and is never added to model context, browser output, logs, or response JSON.

### 3. Result projection

The provider result remains plain display-only text with immutable metadata:

- `skill: bankr`
- `operation: market_research`
- `provider: bankr_agent_api`
- normalized query
- server-owned request kind

For market and comparison briefs, the server requires a UTC timestamp and at least one named source. For news briefs, it additionally requires one to three direct `https://` URLs, rejects non-HTTPS URLs and more than three links, and requires distinct “Reported facts” and “Market interpretation” headings. A response that fails its shape is not published as current research; the Console receives a bounded unavailable/error response instead.

The UTF-8 result ceiling increases from 2,048 to 4,096 bytes for `market_research` only. Exact price reads keep their current smaller contract. Truncation remains code-point safe and reserves room for the server-owned boundary line. The runtime projection uses the same operation-specific ceiling so it cannot independently remove that boundary.

Provider output cannot create wallet proposals, candidates, approvals, or executable controls. The runtime accepts only the expected skill, operation, and provider tuple before publishing a message.

Direct HTTPS source URLs remain visible as text in the first trial. Clickable-link rendering is deferred rather than widening the HTML rendering surface during a provider change.

### 4. Independent feature gate and capability catalog

The Bankr descriptor will truthfully advertise:

- exact current-price reads;
- read-only crypto market research; and
- read-only crypto-news summaries with provider-returned citations.

Constraints will state that:

- no Bankr wallet is used;
- no credential is exposed;
- research is display-only;
- source links are provider-returned and not an independent Helixa verification; and
- transaction actions remain unavailable.

No proposal or execution capability is added. When market reads are enabled but skill proposals are disabled, the returned capability catalog contains read-only Bankr and Helixa descriptors only. Existing transfer-proposal behavior remains behind its separate flag and is outside this release.

## Failure handling

- A missing credential produces the existing bounded disabled-capability error.
- Provider HTTP, JSON, job-ID, status, timeout, and polling failures produce sanitized Console errors.
- A malformed provider result is rejected before publication.
- A source-free or malformed news response is rejected rather than presented as current reporting.
- Duplicate identical requests share the existing in-flight provider call.
- Runtime cancellation propagates through prompt submission, job polling, and waits. A timed-out call stops before its in-flight dedupe entry is released, preventing overlapping retries.
- Intent resolution occurs before durable-memory extraction. Market-read prompts are not written as durable preferences, and a failed read mutates no wallet, durable memory, or published conversation state.

## Safety model

This release preserves four independent boundaries:

1. **Read-only intent boundary:** action and credential requests never reach Bankr.
2. **Fixed-host egress boundary:** only the existing Bankr prompt and validated job endpoints are called.
3. **Display-only result boundary:** provider prose cannot become a proposal, transaction, approval, or wallet action.
4. **Truthful provenance boundary:** reported facts, provider-returned publisher links, and market interpretation are visibly separated; “verified” is never claimed by Helixa.

Market research is informational. It is not financial advice, an execution recommendation, or proof that a linked publisher is correct.

## Testing

### Unit tests

Add positive intent cases for:

- current crypto news;
- Base ecosystem headlines;
- the exact natural phrases “What is moving crypto today?”, “What is the latest crypto news?”, and “Can you tell me current news and market trends?”;
- market movers and narratives;
- BTC/ETH comparisons.

Add negative cases for:

- buy/sell/swap/bridge/stake requests;
- mixed research-plus-action requests;
- credential and prompt-injection requests;
- unrelated current-events questions;
- oversized and control-character input; and
- unsupported explicit commands.

Verify the provider prompt requires timestamps, direct HTTPS source URLs, no more than three stories, and reported-facts-versus-interpretation separation. Verify response validation rejects missing timestamps, missing named sources, source-free news, non-HTTPS URLs, more than three news URLs, and missing required headings.

Verify 4,096-byte UTF-8 truncation with reserved footer space, operation-specific limits in both executor and runtime projection, malformed jobs, provider failures, polling bounds, deduplication, abort propagation, timeout behavior, and immutable projected results.

### Integration tests

Verify an authenticated Console message:

- routes news and market questions through the read-only executor rather than the ordinary LLM;
- preserves participant attribution and canonical human-message-then-skill-message ordering;
- publishes no proposal candidates or wallet controls; and
- proves market reads work with skill proposals disabled; and
- leaves action-oriented prompts on the non-skill path or returns the bounded rejection expected by the existing runtime contract.

Verify successful and failed market reads do not write durable memory. Verify a timed-out provider call is aborted before an identical retry can create a second in-flight request.

Run the focused read-skill and agent-runtime suites, then the complete API suite.

### Live trial

Use one market brief, one news brief, and one asset comparison against the configured provider. Confirm:

- timestamps are current;
- market data names its source;
- news items include direct HTTPS URLs;
- facts and interpretation are visibly separate;
- output stays within the bound; and
- no wallet, proposal, or transaction surface appears.

## Rollout and rollback

1. Implement on an isolated branch based on the reviewed skill-aware runtime.
2. Run focused and complete API tests.
3. Trial the module directly with the configured read-only provider.
4. Inspect and merge the existing systemd environment without whole-file replacement; enable `MULTIPASS_CONSOLE_MARKET_READ_ENABLED=1` only on the production Console unit that serves nginx port 8792.
5. Deploy to the existing Console API service only after review, restart it once, and verify the PID, source revision, dedicated gate, Bankr credential presence, and port.
6. Run authenticated Console smokes for market, news, and asset comparison prompts through the same public endpoint a holder uses—not by calling the executor directly.
7. Roll back the service source and environment to the recorded backup, restart, and verify the prior health state if any live gate fails.

No web bundle deployment is required unless later work adds clickable source rendering.

## Follow-up option

If real usage shows that publisher provenance needs independent verification, build a second release with a fixed-host market-data client and curated news feeds. That release can cross-check Bankr synthesis rather than making unrestricted browsing available to Loopers.
