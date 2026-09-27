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

The Looper returns one of three compact shapes based on the request:

1. **Market brief** — timestamped market snapshot, major movers, trends, and interpretation.
2. **News brief** — at most three important stories, each with publication time, publisher, direct HTTPS URL, verified facts, and a short interpretation.
3. **Asset comparison** — timestamped comparable price, volume, market-cap, and trend observations for the requested assets.

Every response ends with a short boundary line:

> Read-only market research; not financial advice or a transaction.

If current data or usable sources are unavailable, the Looper says so plainly instead of filling gaps from model memory.

## Architecture

### 1. Intent resolution

`apps/api/src/console-read-skills.js` remains the only natural-language entry point.

The resolver will recognize bounded crypto-market and crypto-news terms, including:

- market analysis, overview, update, trend, movers, volatility, volume, and market cap;
- crypto news, headlines, latest stories, what happened today, and Base ecosystem news;
- sentiment, narratives, attention, and trending tokens; and
- bounded asset comparison questions.

The resolver will continue to reject:

- action intent such as buy, sell, trade, swap, bridge, stake, sign, submit, or approve;
- prompt-injection and credential-extraction phrases;
- control characters;
- empty or oversized input; and
- unrelated conversation that belongs on the ordinary LLM path.

Resolution produces the existing internal `market_research` operation and a normalized `/bankr research …` command. The operator’s original text remains the provenance source displayed in the thread.

### 2. Provider request

The server sends a fixed instruction envelope plus the normalized user question to:

- `POST https://api.bankr.bot/agent/prompt`
- `GET https://api.bankr.bot/agent/job/{validatedJobId}`

The fixed instruction requires:

- UTC timestamps;
- named sources;
- direct public HTTPS URLs for news claims;
- no more than three news items;
- separate “Verified facts” and “Market interpretation” sections;
- a plain statement when current data is unavailable; and
- no action, wallet use, order creation, or transaction submission.

The Bankr API credential remains in the API process only and is never added to model context, browser output, logs, or response JSON.

### 3. Result projection

The provider result remains plain display-only text with immutable metadata:

- `skill: bankr`
- `operation: market_research`
- `provider: bankr_agent_api`
- normalized query

The UTF-8 result ceiling increases from 2,048 to 4,096 bytes for `market_research` only. Exact price reads keep their current smaller contract. Truncation remains code-point safe.

Provider output cannot create wallet proposals, candidates, approvals, or executable controls. The runtime accepts only the expected skill, operation, and provider tuple before publishing a message.

Direct HTTPS source URLs remain visible as text in the first trial. Clickable-link rendering is deferred rather than widening the HTML rendering surface during a provider change.

### 4. Capability catalog

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

No proposal or execution capability is added.

## Failure handling

- A missing credential produces the existing bounded disabled-capability error.
- Provider HTTP, JSON, job-ID, status, timeout, and polling failures produce sanitized Console errors.
- A malformed provider result is rejected before publication.
- A source-free news response is still labeled as provider synthesis and must not claim independently verified reporting.
- Duplicate identical requests share the existing in-flight provider call.
- A user can retry after failure; no wallet or conversation state is mutated by the failed read.

## Safety model

This release preserves four independent boundaries:

1. **Read-only intent boundary:** action and credential requests never reach Bankr.
2. **Fixed-host egress boundary:** only the existing Bankr prompt and validated job endpoints are called.
3. **Display-only result boundary:** provider prose cannot become a proposal, transaction, approval, or wallet action.
4. **Truthful provenance boundary:** current facts, publisher links, and market interpretation are visibly separated.

Market research is informational. It is not financial advice, an execution recommendation, or proof that a linked publisher is correct.

## Testing

### Unit tests

Add positive intent cases for:

- current crypto news;
- Base ecosystem headlines;
- market movers and narratives;
- BTC/ETH comparisons; and
- common follow-up wording when recent thread context is market-related.

Add negative cases for:

- buy/sell/swap/bridge/stake requests;
- mixed research-plus-action requests;
- credential and prompt-injection requests;
- unrelated current-events questions;
- oversized and control-character input; and
- unsupported explicit commands.

Verify the provider prompt requires timestamps, direct HTTPS source URLs, no more than three stories, and facts-versus-interpretation separation.

Verify 4,096-byte UTF-8 truncation, operation-specific limits, malformed jobs, provider failures, polling bounds, deduplication, timeout behavior, and immutable projected results.

### Integration tests

Verify an authenticated Console message:

- routes news and market questions through the read-only executor rather than the ordinary LLM;
- preserves participant and source-message provenance;
- publishes no proposal candidates or wallet controls; and
- leaves action-oriented prompts on the non-skill path or returns the bounded rejection expected by the existing runtime contract.

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
4. Deploy to the existing Console API service only after review.
5. Run authenticated Console smokes for market, news, and asset comparison prompts.
6. Roll back to the prior service source and restart only if a live gate fails.

No web bundle deployment is required unless later work adds clickable source rendering.

## Follow-up option

If real usage shows that publisher provenance needs independent verification, build a second release with a fixed-host market-data client and curated news feeds. That release can cross-check Bankr synthesis rather than making unrestricted browsing available to Loopers.
