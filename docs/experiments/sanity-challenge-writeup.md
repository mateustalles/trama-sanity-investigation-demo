---
title: "Trama: an evidence librarian for investigations that cannot start with the answer"
published: false
tags: devchallenge, sanitychallenge, sanity, ai
---

*This is a submission for the [Sanity Challenge, Path One: Ship an Agent That Queries Real Content](https://dev.to/challenges/sanity-2026-09-16).*

## What I Built

Trama helps a person investigate a messy, evolving problem without confusing a plausible story with a verified conclusion. An investigation has questions, competing hypotheses, evidence, and unresolved uncertainty. The difficult first step is often finding the *right* records among many similar-looking ones. A powerful language model cannot reason its way around an original document that never reaches it.

For this challenge, I built a read-only evidence agent around a fictional September 2026 checkout incident. The visitor starts with a short case brief, then asks their own question or chooses an investigative starting point: establish a timeline, inspect a change, check a measurement, or test alternatives. The agent searches a 145-document synthetic archive, retrieves exact original records, and returns a qualified answer with the records and retrieval trace visible for inspection. It distinguishes what a record observes from what the agent infers and what remains unknown.

This is deliberately **not** a root-cause button. The agent does not approve a hypothesis, apply a Trama Delta, or change authoritative Case State. A separate player-led investigation game—where a user would construct and revise their own Deltas—is a design proposal, not a capability of this submitted demo.

## Demo

**Live demo:** [ADD PUBLIC, READ-ONLY DEMO URL]

The demo presents a fictional case, suggested lines of inquiry, a free-form question box, the agent's answer and limitations, expandable original-source bodies, and the Context MCP/GROQ retrieval trace. A useful first question is: “What changed in checkout shortly before the September 18 payment failures began?” Then ask what the Provider A latency observation recorded, or whether the postal-code and fraud records support alternative explanations. The initial brief does not state the cause.

The current local route is `/poc/sanity/investigate`; `127.0.0.1` is only a development address, **not** a judge-accessible demo. Judges will receive a dedicated, limited test account through the normal invitation flow. [ADD THE DEMO URL AND THE SAFE ACCOUNT-DELIVERY INSTRUCTIONS; DO NOT PUT A PASSWORD OR API KEY IN THIS POST.] The demo makes server-side Sanity and model API calls, so access remains authenticated and read-only.

## Code

**Repository:** [Trama × Sanity investigation demo](https://github.com/mateustalles/trama-sanity-investigation-demo). The public source snapshot includes a setup and walkthrough guide; it excludes the private product repository's history and credentials.

The live agent flow is in `scripts/sanity-demo-agent.mjs`; the scoped query and source-verification helpers are in `scripts/sanity-content-lake-evidence.mjs`; the API and UI are in `apps/web/app/api/poc/sanity/investigate/route.ts` and `apps/web/app/poc/sanity/investigate/`. The benchmark methods and limitations are documented under `docs/experiments/`.

## How I Used Sanity

The archive lives in a private Sanity Content Lake dataset as `evidenceSource` documents. Each document has a preserved original `body` plus structured `workspaceId`, `scopeId`, `sourceId`, `title`, content hash, and source metadata. The dataset embeds the `{title, body}` projection. The current contest agent connects to a **Sanity Context MCP endpoint in GROQ mode with embeddings enabled**. It does not ask a generated Knowledge Base entry to supply the final answer. The [challenge explicitly accepts a full-dataset Context MCP endpoint with embeddings for Path One](https://dev.to/devteam/join-the-sanity-challenge-2500-in-prizes-for-five-winners-514m); I am using that alternative, not claiming that this route reads a built Knowledge Base.

For each question, the server—not the model—fixes the synthetic workspace and incident scope and constructs bounded GROQ queries. Through Context MCP's `groq_query` tool, it first ranks candidate IDs with `text::semanticSimilarity`. It also runs a scoped `text::query` keyword search as a visible candidate-level comparator. For a question with several distinct evidence facets, a model proposes a small, validated search plan; the server may run separate semantic searches and combine their candidates. The model never receives unrestricted GROQ-writing authority. The server then reads up to ten selected records by exact ID and the same scope filter, subject to a 12,000-character original-source packet.

Before an original reaches the answering model, the server checks its scoped identity and SHA-256 against the body returned by Content Lake and requires a source revision. That is an *internal Content Lake consistency check*, not independent proof that an external report is true or a comparison with an external source registry. The answer model receives the verified original bodies—not a generated KB summary or benchmark answer key. It must provide an answer, a qualified conclusion, limitations, and names of sources it actually read. The server rejects a source name outside the delivered packet. The interface exposes original text and provenance so a human can audit whether the cited records really support the claims; name validation alone cannot establish semantic support.

Why structure matters here: `workspaceId` and `scopeId` limit the query to the intended pilot scope, while similar-looking distractors deliberately inside that scope remain a real retrieval challenge; stable IDs support exact reads after ranking; revisions and hashes make the packet inspectable; and original text remains distinct from an AI-generated interpretation. Sanity is the *evidence librarian and structured source store*. Trama is the reasoning layer that asks what the evidence permits us to conclude.

The opportunity may be clearest in open, human questions whose useful concepts are not literal document keywords: what made a change risky, whether a vendor observation is causally relevant, or which record challenges a tempting explanation. A Knowledge Base build can organize prose around these concepts ahead of time, giving an agent an outline and a hypothesis about where to look; dataset embeddings can rank semantically related originals when useful facts live in prose rather than in a clean field. This is a research hypothesis, not a demonstrated advantage of our current direct-originals demo. The critical constraint is that a generated entry is navigation and synthesis, not automatically proof: for a consequential Trama conclusion, the agent should still expose and reason from the underlying source.

That distinction also explains the current implementation boundary. The submitted Demo 1 uses scoped GROQ mode with dataset embeddings and exact originals, because its synthetic corpus is already modeled as consistent `evidenceSource` documents and the final answer must remain source-grounded. Earlier Knowledge Base experiments exposed source-fidelity concerns, so treating generated entries as navigation hints rather than authoritative proof is intentional. It does not imply that Knowledge Bases are generally unsuitable; the proposed next experiment is a genuinely open-question corpus where KB-generated conceptual organization can be evaluated against keyword and embedding retrieval while preserving original-source audit.

### What the experiments did—and did not—show

We tested the retrieval question instead of assuming semantic search always wins. The 145-document synthetic corpus contains 24 primary incident records and 121 distractors. In one 40-case structured-answer run with local `qwen3:4b-instruct`, the single-query semantic arm passed **30/40** and the keyword arm **27/40** under the same v4.5 rubric and source budget. Those totals include State-only questions that cannot show retrieval value; one repetition cannot measure variance. A separate faceted semantic run also passed **30/40** and delivered **11/12** predeclared originals across nine evidence cases, versus **9/12** in the earlier single-query semantic run. The runs were not contemporaneous, and source recall is not answer correctness.

The hardest multi-source case illustrates the boundary: faceted retrieval delivered all four required originals, but the local answer model still chose the wrong structured conclusion. Conversely, in a frozen-evidence diagnostic using a stronger API model, keyword retrieval supplied all four originals for that case while the earlier single-query semantic packet omitted two. A stronger model cannot repair missing evidence, and finding the right evidence does not guarantee a correct inference. These results are from one synthetic incident, not a general claim that embeddings outperform keywords, nor a measured accuracy rate for arbitrary live questions. The current live UI uses an API model and shows a keyword *candidate* comparison, not a second keyword-based answer.

## Sanity Project Details

- **Project ID:** `swuqfubs`.
- **Experimental dataset:** `trama-evidence-pilot` (private; synthetic records only).
- **Schema:** `evidenceSource`, with original text and source identity/provenance fields, plus workspace/case scope.
- **Endpoint:** a fixed-scope Sanity Context MCP endpoint with embeddings enabled over the pilot Content Lake dataset; credentials stay server-side. [CONFIRM WHAT ENDPOINT OR DATASET INSPECTION ACCESS THE JUDGES WILL HAVE.]

No personal Trama data is in this challenge corpus. The current pilot endpoint has a fixed fictional scope; it is **not** a general multi-tenant authorization design. A real-user version would need per-user authorization, consent, stronger rate limiting, and a separate privacy review.

## Agent Session

[OPTIONAL: ADD A CURATED, PUBLIC AGENT SESSION EMBED OR LINK. The [challenge guidance](https://dev.to/devteam/join-the-sanity-challenge-2500-in-prizes-for-five-winners-514m) encourages this but does not require it. Upload at https://dev.to/agent_sessions/new, make the session public for judges, and review/redact secrets and personal data before publishing.]

<!-- Publish gate, not part of the article: replace all bracketed placeholders; verify repository visibility and judge login; smoke-test the deployed demo and review two answers against their originals; confirm project ID, dataset, endpoint, and public-access policy; optionally add a short walkthrough and curated AI session; publish in English with #sanitychallenge by October 4, 2026 at 11:59 PM PDT. Path Two, if entered, requires a separate post. Do not describe the proposed Delta game as shipped. -->
