# Knowledge Base navigation pilot

## Purpose and status

This read-only pilot tests the existing Sanity Knowledge Base as a librarian:
choose relevant index entries, follow their source IDs, and reason over verified
original records. It does not replace the active demo's retrieval route.

On October 4, 2026, five OpenAI investigations completed using `gpt-6-sol`.
All five passed the output-contract and original-source identity checks.
Manual inspection found four substantively adequate answers and one partial
answer. These are smoke-test observations, not a full benchmark accuracy score.

## Existing corpus, not a rebuild

The ready KB `kbkpWkNaMVN6` was built from 145 synthetic documents.
Its live outline exposed 17 paths and its entries referenced 82 distinct
registered originals, with no unknown IDs in this audit. The build report
records 63 discarded sources and one issue; importing 145 documents does not
mean all 145 remain navigable through generated entries.

The four primary records used by the synthesis question were all referenced.
No build, dataset mutation, endpoint reconfiguration, or production switch was
performed for this pilot.

## Pipeline

1. Read the authorized KB outline and a host-scoped original-source registry.
2. Ask the model to select one to five existing entry codes. The planner sees
   paths and available descriptions, not gold answers or original bodies.
3. Read those entries through `knowledge_base_read`.
4. Extract allowlisted stable IDs from their Sources sections. Generated prose
   and citation numbers are not accepted as evidence.
5. Retrieve exact originals with scoped GROQ queries, in batches of ten;
   validate IDs, scope, hash, and revision. No `semanticSimilarity` is used in
   this experimental route.
6. Apply the existing lexical ranking among those verified candidates, then
   deliver at most ten whole originals within 12,000 characters.
7. Ask the model for an answer, conclusion, limitations, and supplied source
   names. Reject invented citations or malformed output.

The initial all-entry audit is diagnostic overhead, separate from per-question
latency and model token counts. Original retrieval is deterministic after entry
selection; model planning and reasoning are not deterministic.

## Observed results

| Question | Input tokens | Output tokens | Total latency | Finding |
| --- | ---: | ---: | ---: | --- |
| Incident timeline | 2,941 | 345 | 9.56 s | Relevant timeline and deployment, qualified causality |
| Pre-incident change | 2,923 | 270 | 7.31 s | Correct 09:58 UTC timeout change, 10 to 4 seconds |
| Open explanation | 2,977 | 489 | 9.74 s | Plausible qualified mechanism, incomplete fraud counterevidence |
| Synthesis | 3,037 | 609 | 9.56 s | All four primary originals delivered and cited |
| July/September separation | 2,684 | 326 | 7.61 s | Correctly separates unrelated events sharing a provider name |

Tokens include both planning and answering. Each question produced 24–28
candidate originals; ten entered its answer packet. In the open question,
`04-fraud-score-report.md` was in the candidate set but omitted by the host's
ranking/budget. The answer disclosed that it lacked the broader fraud audit.
This isolates a packet-selection limitation rather than an absent KB locator.

Earlier attempts remain preserved: OpenAI was blocked by exhausted credits;
an explicitly interrupted local diagnostic run yielded only two attempts and
must not be compared as a completed five-question run.

## Remaining risks and recommendation

- Some generated KB citation numbers misattribute statements even when source
  IDs are valid. Read the originals; identity validation is not claim validation.
- The flat lexical top-ten cut can crowd out an alternative explanation after
  the KB correctly locates it. Next, evaluate coverage-aware selection across
  selected topics, rather than simply raising the limit or tailoring to X01.
- Paths without descriptions make topic selection less informative. Evaluate
  richer authorized navigation metadata without feeding gold answers.
- One run of five questions cannot establish variance, superiority over dataset
  embeddings, or reliable performance across arbitrary investigations.
- Preserve the working demo until this experimental route passes broader
  coverage checks and a deliberate integration decision is made.

## Reproduction and artifacts

Run from the repository root with server-side environment variables configured:

```powershell
node scripts/probe-sanity-kb-navigation.mjs audit
node scripts/probe-sanity-kb-navigation.mjs run
pnpm test
pnpm typecheck
pnpm build
```

The live runner is separate from the offline test harness and spends API quota.
It accepts `OPENAI_API_KEY` or the existing `OPEN_API_KEY`, plus the Sanity
organization token and Context endpoint. Never publish environment files.

This run is stored locally under
`artifacts/sanity-context-benchmark/kb-navigation-2026-10-04T14-20-30-745Z/`:
audit, per-question results, raw model-stage prompts/responses, checkpoint, and
final JSON. Artifacts are ignored and are not a public credential or evidence
distribution mechanism.

Seven new offline tests cover KB selection, exact-original provenance, scope
isolation, missing evidence, contract rejection, MCP failures, and bounded local
diagnostics. Domain entities, persistence, application commands, production MCP,
UI, authentication, and plugin packaging are unaffected.

Validation on October 4: 157 application tests plus 55 script tests passed
(212 total), and typecheck passed. The first build lacked required Sanity
environment configuration; rerunning with the existing environment files
loaded into the process passed. No credentials were copied into this checkout.
