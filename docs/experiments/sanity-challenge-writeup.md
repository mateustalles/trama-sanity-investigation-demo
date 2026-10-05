---
title: "Trama: Investigating Uncertainty with Sanity Context"
published: true
published_url: "https://dev.to/mateustalles/trama-investigating-uncertainty-with-sanity-context-2a9j"
published_at: "2026-10-05T01:40:55Z"
tags: devchallenge, sanitychallenge, sanity, ai
---

*This is a submission for the [Sanity Challenge, Path One: Ship an Agent That Queries Real Content](https://dev.to/challenges/sanity-2026-09-16)*

## What I Built
I created Trama, a tool that helps people make better-informed decisions when the available information is incomplete, scattered, or contradictory.

Its Investigator starts with an unresolved question and uses the available information to develop a supported, provisional conclusion. The broader product organizes that progress into Deltas: explicit steps connecting a hypothesis, selected evidence, reasoning, and a conclusion.

A Delta is not the final truth. New evidence can challenge it, reopen the investigation, or lead to a different branch. The goal is to preserve not only what we concluded, but why—and what might change our minds.

For this submission, I built a focused investigation assistant around a fictional checkout incident. Users can ask what happened, explore possible explanations, and inspect the context that informed the model’s answer.
This demo focuses on the retrieval-and-reasoning step. It does not automatically apply decisions or modify investigation records.

## Demo
https://www.apptrama.com/poc/sanity/investigate
(The demo is hosted on my existing domain)

Open the demo and sign in with this restricted test account:
- Email: `mateustalles+sanity-judge@gmail.com`
- Password: `Trama-Dw_UxMpBIKPBdOlBotIzA4tng1RM2rDy!`
No personal API key is required. This account grants access only to the demo, not personal workspaces.
The allowance is six questions per minute and 600 accepted requests total, shared across all visitors. Access expires on October 24, 2026, at 02:59 UTC.

**The case:** A checkout release was followed by a fifteen-minute increase in failed payments. The archive contains deployment notes, provider measurements, audit reports, and unrelated records. Can you distinguish what happened from what might have caused it?

**Getting started**
1. Sign in using the test credentials above. No personal API key is required.
2. Select “Establish the timeline”, then click “Ask Trama.”
3. Try “Look for a change” to investigate what changed before the failures.
4. Use “Check a measurement” and “Test alternatives” to explore supporting observations and competing explanations.
5. Ask your own question. For example:
   “What would we need to verify before treating the deployment as the root cause?”

**What to look for**
Read both the conclusion and “What remains uncertain.” The goal is a supported explanation—not a confident answer at any cost.
Expand “See what Sanity returned” to inspect the complete Knowledge Base context supplied to the answer model. Expand “How Trama used Sanity for this question” to see the actual search query and processing details.
Behind each answer, Trama searches Sanity’s built Knowledge Base and passes the complete returned entries to OpenAI for analysis. Suggested questions use predefined search terms; custom questions are sent to Sanity unchanged.

**Access and limitations**

This is a read-only demo using fictional, synthetic records. Each question is processed independently, so include relevant details rather than relying on previous answers. Please do not submit personal or confidential information.

Sanity’s generated entries may contain interpretation. This demo does not independently verify the original documents or create persistent Deltas.

## Code
https://github.com/mateustalles/trama-sanity-investigation-demo/tree/main

## How I Used Sanity
I loaded a corpus of 145 synthetic documents into Sanity, including records about the fictional incident and unrelated material, and used Sanity Context to build a Knowledge Base.

When a user asks a question, Trama calls the native `knowledge_base_search` tool through Context MCP. It passes the complete returned entries to an OpenAI model, which produces an answer with a provisional conclusion and limitations.

Trama does not rerank or filter those results, and this path has no local keyword-search fallback.

Sanity’s role is to turn a scattered collection of information into navigable context for the investigator. Trama’s role is to reason from that context and make uncertainty visible.

The returned entries are Sanity-generated interpretations, not independently verified original evidence. Making that distinction explicit is part of the investigation workflow.

## Sanity Project Details
Project ID: swuqfubs
