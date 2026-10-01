# Sanity Context live evidence-agent demo

Publication update (1 October 2026): this distribution opens the investigation
at its homepage and provides a complete authentication flow in the same
language. It does not expose the general product chat or operational routes.
The walkthrough below records the earlier prototype; its Portuguese-first
product shell is not the current public MVP.

Status: experimental, read-only, synthetic pilot. The UI is
`/poc/sanity/investigate`; its POST endpoint is
`/api/poc/sanity/investigate`. Neither changes the active Trama chat, current
Case State, Delta approvals, the production Sanity dataset, or MCP tool
contracts.

## What it demonstrates

1. A visitor reads an English-language fictional case brief, then asks a
   question, chooses one of four open-ended starting prompts, or expands two
   optional advanced prompts. The brief states the incident window but does
   not identify a cause. The
   host fixes `workspaceId=synthetic-benchmark` and
   `scopeId=payment-incident-2026-09-18`; the model cannot author GROQ.
2. Sanity Context MCP `groq_query` searches the existing private
   `trama-evidence-pilot` Content Lake dataset with embeddings enabled. The
   host first searches the whole question. GPT-6 Sol plans up to four
   question-grounded facets; for three or more facets, the host also searches
   each facet and retains deterministic first-ranked anchors if candidate
   selection fails. A separate keyword query reports candidates for comparison,
   but does not receive a second model answer.
3. The host fetches at most ten exact originals by stable document ID, scoped
   GROQ type/workspace/case filter, and a 12,000-character answer budget. It
   recomputes the deterministic ID and the body SHA-256, checks revision and
   scope, and refuses mismatches. This checks *internal Content Lake identity
   and integrity*, not an independent external source registry. An ingestion
   registry was used in the benchmark, but is not bundled into this UI.
4. GPT-6 Sol receives only the selected original bodies, not generated KB
   prose or benchmark gold labels. It returns an English answer, qualified
   conclusion, limitations, and source names. The host rejects source names
   that were not in the delivered packet. The UI exposes sources, revisions,
   hashes, facets, GROQ calls, budget omissions, and latency for manual audit.

The comparison with keyword search is candidate-level only. It is not an
accuracy claim. The source-name check does not prove that each statement is
semantically supported; a human must still read the cited originals.

The surrounding Trama product remains Portuguese-first. This self-contained
contest demonstration uses English copy, English response instructions, an
English page title, and a route-level `lang="en"`. The unrelated Portuguese
Trama chat launcher is hidden on this route to avoid mixing a writable product
assistant into the read-only investigation. Other Trama routes are unchanged.

## Verified local walkthrough (2026-09-29)

In the current English UI, the four suggested questions each returned HTTP
200 and an English answer in a live local smoke. The timeline question cited
`00-scenario.md`; the change question cited `01-deployment-record.md`; the
Provider A measurement question cited `02-provider-latency-log.md`; and the
alternatives question cited `03-postal-code-sample.md`,
`04-fraud-score-report.md`, and `21-fraud-audit-history.md` (plus the scenario).
None reported missing or budget-omitted sources. These prompts are starting
paths for the visitor, not a guarantee that every free-form query retrieves
the best evidence.

Two broader candidate prompts were rejected during smoke testing: a generic
request for direct observations and a generic request for competing
explanations missed central original records. This remains a retrieval
coverage limitation to address in the second delivery, not a demonstration
that the answer model can recover evidence it never received.

The local route returned HTTP 200 for both curated questions against the live
pilot Context MCP endpoint. X01 read ten exact originals and cited five:
`01-deployment-record.md`, `02-provider-latency-log.md`,
`03-postal-code-sample.md`, `04-fraud-score-report.md`, and
`05-provider-status-update.md`. Their bodies support the reported timeout,
latency, postal sample, fraud audit, and vendor notice. The answer treats the
latency/timeout mechanism as an inference, not a proved sole cause. T01 read
ten originals and cited three July maintenance records; each distinguishes
that event from the September checkout incident. This is a manual audit of
two selected outputs from the earlier walkthrough, **not** a semantic accuracy estimate for free-form
questions or all 40 benchmark cases.

After the final access guard change, `pnpm.cmd test` passed 149/149 tests,
`pnpm.cmd typecheck` passed all nine projects, and `pnpm.cmd build` completed
with the page and API route present. The development server was bound only to
`127.0.0.1:3001` for local review; that URL is not a public contest link.

## Runtime and access

- Server-only `SANITY_ORGANIZATION_TOKEN` and `OPENAI_API_KEY` are required.
  The route also accepts the existing local alias `OPEN_API_KEY`; no key is
  copied into the worktree or returned to the browser. Configure these in the
  Next.js server environment, not in `NEXT_PUBLIC_` variables. The OpenAI
  Responses calls use low reasoning effort and `store:false`.
- `SANITY_CONTEXT_PILOT_GROQ_MCP_URL` optionally overrides the fixed pilot
  Context endpoint. `TRAMA_BENCHMARK_PILOT_GROQ_MCP_URL` is also accepted for
  continuity with the benchmark. Neither changes the active evidence MCP.
- Hosted mode requires a signed-in Supabase user. Without hosted auth, the
  endpoint accepts only `localhost`/`127.0.0.1` requests while running in
  development mode; a production build denies unauthenticated POSTs. Do not
  expose a local development server or use this host-header check as network
  isolation. An in-memory limit
  of six questions per identity per ten minutes reduces accidental API spend;
  it is not a distributed production quota.
- The UI's initial corpus-size label refers to the verified 145-document
  experimental round. The route does not re-count the corpus before every
  question. Confirm the pilot dataset before filming or submission.

## Demo script and submission gate

Open with the case brief and let the visitor pick a starting question. Reveal
the optional cross-source mechanism/counterevidence question, then the
same-vendor/different-event question only after introducing the investigation.
In each case show the actual MCP call, original source text, and answer limits;
do not just show a benchmark PASS.
If a question fails or keyword retrieval finds the same sources, show that
honestly. The 40-case model comparison is supporting evaluation, not a live
retrieval score.

Before sharing publicly: run a live smoke with the configured pilot endpoint,
manually audit at least the two curated answers, verify that the hosted login
and judge testing credentials work (or provide a safe public read-only access
path), check mobile layout, and record a short walkthrough. Include the code
link, Sanity project ID or public dataset URL, and an English DEV submission
post if competing for prizes. Do not publish tokens or personal Trama data.

## Layer impact

This slice adds a server-only demo orchestrator, a read-only API route,
presentation, unit tests, and documentation. Domain language, schemas,
persistence, core/application policies, Trama MCP tools, operational skills,
and plugin packaging are unchanged. No migration or plugin reinstall is
needed. The health check no longer tests one deleted Knowledge Base ID.

The distinct second-delivery investigation-game concept is specified in
`sanity-investigation-game-v2.md`; it is not implemented by this route.
