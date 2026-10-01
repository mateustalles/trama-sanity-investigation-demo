# Content Lake original-evidence pilot

Status: experimental, synthetic-only. Started 2026-09-23. This does **not**
move Trama's authoritative State or change the live application connector.

## Question

Can Sanity Context help locate an original without making its synthesized
Knowledge Base entry the evidence? The target flow is:

`KB outline/entry → stable source ID → scoped exact GROQ read → original text → answer`.

Compare against a simpler `scoped semantic GROQ → exact GROQ read → answer`
baseline. `raw-full` remains an all-evidence ceiling, not a fair retrieval
baseline when the corpus grows.

## Retrieval-only comparison (2026-09-25)

`node scripts/compare-sanity-retrieval-pilot.mjs` runs a read-only POC against
the existing pilot dataset and Context MCP endpoint. It asks the same nine
questions of keyword BM25 (`text::query` over `title` and `body`) and dataset
embeddings (`text::semanticSimilarity`), with the same exact workspace/scope
filter and top-ten limit. Eight questions use the existing R01–R08 source gold;
X01 uses four original records declared before retrieval. It records candidate
IDs, ranks, and latency, never original bodies or credentials. This isolates
retrieval coverage; it does **not** measure Llama answer quality. Do not compare
the opaque `_score` values between modes or questions.

The first live artifact, `retrieval-poc-2026-09-26T01-09-55-589Z.json`, found
11/12 expected sources in each mode and complete source coverage on 8/9
questions. Semantic search recovered the Provider A retry observation for R04
at rank 4 when keyword top-ten missed it. Keyword search recovered all four
X01 records; semantic search found three and missed the postal sample. This
small, correlated synthetic corpus does not establish a winner, but it shows
both semantic value and a real multi-facet coverage failure. Next compare a
hybrid or generic facet-diversity retrieval method under the same ten-original
and prompt-character budgets, then run the unchanged answer model and rubric.

The current `evidenceSource` schema does **not** classify sources by hypothesis
or subject. Structured `workspaceId` and `scopeId` narrow the eligible corpus;
the dataset embeds the `{title,body}` projection to rank by meaning. Stable
`sourceId`, source revision/locator, and hashes make the original verifiable.
If generic descriptive metadata is added later, evaluate it separately so its
effect is not attributed to embeddings. The pilot contains fictional payment
records only; user Tramas should not be imported without a distinct privacy,
authorization, and consent design.

## Fifty-document full-suite stress test

On 2026-09-25, 26 additional synthetic, non-gold records were added
idempotently to the **private pilot dataset**, for exactly 50 documents in the
same benchmark scope. The records include adjacent vendors, dates, retry,
postal, fraud, and unrelated-subject distractors. They are not user data and
were not added to or rebuilt into the existing Knowledge Base. The additive
loader `scripts/ingest-sanity-evidence-pilot-50.mjs` refuses to overwrite
divergent records and verifies the 50-document count. Old 24-document benchmark
artifacts remain historical; new results are not directly comparable to them.

The full structured v4.5 run uses all 40 cases, one repetition, and two
retrieval arms: `sanity-groq-only` (semantic) and `sanity-keyword-only` (BM25).
Both use the same Context MCP, question, exact scope, top-ten candidate limit,
exact-original validation, 12,000-character source pack budget, local model,
and scoring contract. This asks whether retrieval differences affect the final
structured answer, not merely candidate recall. One repetition estimates
neither model variance nor latency distribution; repeat after inspecting the
first complete result. State-only cases are included but cannot demonstrate
evidence-retrieval value. A top-ten budget is still 20% of this corpus; future
work should add top-three/top-five and larger scoped corpora.

## 145-document full-suite stress test

After the 50-document run completed, another 95 synthetic, non-gold records
were added to the same private pilot scope, for 145 documents total (24
originals and 121 distractors). `scripts/ingest-sanity-evidence-pilot-50.mjs`
accepts `plan`, `ingest`, or `verify` with target `145`; ingestion uses
`createIfNotExists` and verifies the exact count and fixture hashes. The
145-document fixture is `scripts/fixtures/sanity-pilot-145-distractors.mjs`.
These are deliberately adjacent hard negatives, but many share a generated
template. Corpus size and ranking interference are tested; natural real-world
document diversity is not.

The v4.5 runner records a distinct `stress145` corpus identity with all 145
source revisions in its checkpoint. The full run keeps the same 40 questions,
two retrieval arms, `qwen3:4b-instruct`, top ten, 12,000-character source
budget, structured rubric, and one repetition as the 50-document run. The
145-source count and ready embeddings were confirmed before launch. Differences
from the 50-document run may reflect the added corpus, not a change in model or
rubric. One repetition cannot quantify variance, and source support still
requires manual audit.

## Ollama-planned semantic facets (retrieval-only experiment)

`scripts/compare-sanity-facet-retrieval.mjs` tests an alternative to embedding
the whole question once. A local `qwen3:4b-instruct` call extracts up to four
independent search phrases, validated against the question's vocabulary. Each
phrase gets a separate scoped `text::semanticSimilarity` GROQ request; the
candidate lists are deduplicated round-robin into the same ten-original budget.
This is an isolated retrieval POC, **not** a change to the active connector or
the structured-answer benchmark. The planner call's tokens and latency are
recorded separately. A comma-joined single query is deliberately not treated
as multiple semantic searches.

The nine-case run `facet-retrieval-2026-09-26T02-59-31-980Z.json` tied the
single-query baseline: 7/9 cases with complete gold coverage and 9/12 gold
sources found. It recovered R01 (0/1 to 1/1), lost R04 (1/1 to 0/1), and left
X01 at 2/4. The planner sometimes copied question instructions as search
phrases or combined distinct aspects (`postal/fraud`), while equal round-robin
slots excluded sources deeper in a facet ranking. An earlier unconstrained
prompt invented dates and misread postal evidence as postal delivery. Do not
interpret this prototype as an improvement or run an answer benchmark with it
unchanged. Next investigate a generic planner contract that identifies distinct
entities/claims without inventing context, and a candidate-selection method
that preserves facet coverage under ten sources; compare planner cost and
answer quality only after retrieval recall improves.

An isolated X01 all-candidates probe (`scripts/probe-sanity-x01-all-facets.mjs`)
used four manually selected facets: release timeout, Provider A latency,
postal counterevidence, and fraud counterevidence. Each top-ten list included
its corresponding gold original (ranks 2, 4, 2, and 5), and the four lists had
40 distinct documents. Sending all 40 verified originals made a 17,939-character
evidence packet and a 19,619-character prompt. With the benchmark's current
`qwen3:4b-instruct` and `num_ctx=4096`, Ollama rejected the request before
generating an answer: 6,500 prompt tokens exceeded 4,096 available. Artifact:
`x01-all-facets-2026-09-26T03-12-08-492Z.json`. This establishes a context
capacity failure for the current setting, not an answer-quality result. Raising
the context window would require a separate memory/cost experiment; selecting
the final evidence set remains the main retrieval problem.

A subsequent *manual-facet* selector POC (`scripts/probe-sanity-facet-selector.mjs`)
used the same four X01 search phrases but gave `qwen3:4b-instruct` only the
titles and capped Sanity `_embeddings` match fragments of each top-ten
candidate. It chose two candidate codes per facet. The run
`facet-selector-2026-09-26T03-20-07-184Z.json` selected eight verified
originals, including all four X01 gold sources. The selector consumed 3,297
prompt tokens; its separate answer call used 1,911 prompt tokens, within
`num_ctx=4096`, and correctly reproduced all four numeric facts. The answer
prose also stated the intended qualified mechanism, yet the literal decision
was `all_causes_ruled_out` rather than
`provider_timeout_plausible_not_proven`. This is one manually planned case,
not evidence that the selector generalizes. It isolates an answer-contract
inconsistency from retrieval coverage and motivates testing separate
mechanism/certainty fields without retroactively changing the v4.5 gold.

### Automatic facet planning and guarded routing (26 September 2026)

The experimental `scripts/compare-sanity-auto-facets.mjs` now asks the same
local Qwen model for a small JSON retrieval plan with separate `task` and
`facets` fields. The prompt explicitly distinguishes the answer operation
from searchable evidence, bans invented terms, and includes an unrelated
slash-separated example. Code then validates every facet against words in the
question/scope, splits slash-separated concepts, and rejects answer
instructions as search terms. Each independent facet uses its own scoped
Sanity `text::semanticSimilarity` GROQ query. For multi-aspect questions,
the model sees only candidate titles and capped embedding match fragments,
then selects one or two candidate codes per facet. Only validated source IDs
can enter the bounded set of at most ten originals. This is **not** deployed
in the active connector, and it does not change the answer rubric.

The selector alone was not reliable: over nine questions it found 8/12 gold
sources in 5/9 complete cases, versus 9/12 and 7/9 for the whole-question
semantic top ten. It improved X01 from 2/4 to 4/4, but lost R04, R07 and R08.
The final POC therefore routes questions with fewer than three validated
facets to the established whole-question retrieval. For three or four facets,
it selects candidates per facet, deduplicates them and fills remaining slots
from the whole-question list, still capped at ten sources. The selector is
not called for narrow questions. Final nine-case run:
`auto-facet-selector-2026-09-26T18-05-24-280Z.json`: 11/12 gold sources,
8/9 cases complete, X01 4/4, no planner errors. The missed source is R01,
which the baseline also misses. Planner calls used 1,895 prompt tokens in
total; the one invoked selector used 3,248. These figures exclude Sanity
retrieval and any final answer call. The earlier unguarded run is
`auto-facet-selector-2026-09-26T18-00-16-097Z.json`.

This small set was also used to design the routing rule, so 11/12 is a
development result, not an unbiased accuracy estimate. There is only one
run, one synthetic incident and no final-answer comparison. Test on held-out
multi-aspect questions and other domains before integrating it. In
particular, source-ID recall does not establish that the model interprets
evidence correctly; X01's previous answer-contract inconsistency remains.

### Held-out retrieval checks and candidate-anchor guard

Seven new questions (H01–H07) and their three-primary-source gold sets were
pre-registered in `scripts/fixtures/sanity-auto-facet-holdout.mjs` from the
local originals, before querying Sanity for those questions. The initial
run `auto-facet-holdout-2026-09-26T18-40-00-656Z.json` showed **no** gain:
15/21 gold sources and 2/7 complete cases for both the baseline and the
faceted route. One plan was invalid; in two cases the selector omitted a
facet. Among valid plans, it sometimes discarded the first-ranked original
in favor of a synthetic distractor. Thus the original selector-only proposal
failed its first holdout and was not promoted.

A general guard now reserves one first-ranked candidate from each independent
facet before adding the selector's bounded choices and filling from the
whole-question top ten. Partial selector output keeps its valid choices and
the deterministic anchors; malformed codes are rejected. The same seven
questions became development diagnostics after inspection: the guarded
rerun `auto-facet-holdout-2026-09-26T18-43-09-633Z.json` found 19/21 and
6/7 complete, with H03 still missing two originals after a malformed plan.
The prompt was clarified to favor distinct concrete evidence targets and
forbid multiple comma-separated searches in one facet. A stricter JSON
Schema `pattern`/`maxLength` experiment timed out locally and was removed;
the prompt-only H03 check found 2/3. None of these H03 reruns is unbiased.

Before the subsequent run, seven further questions (H08–H14) and their
three-source gold sets were frozen in
`scripts/fixtures/sanity-auto-facet-holdout-v2.mjs` (fixture SHA-256
`475981f9bde8c6f4e00d4aa2ecc761ae122075abbecdd6a025fb4db1e3518716`).
On this prospective set, with 145 scoped sources and a ten-source delivery
budget, the whole-question baseline found 17/21 gold sources and completed
4/7 questions. The guarded faceted route found 19/21 and completed 5/7,
with no per-case source regression and no planner errors. Artifact:
`auto-facet-holdout-v2-2026-09-26T18-47-53-856Z.json`. H08 still missed
`05-provider-status-update.md`; H14 missed `00-scenario.md`. Two selectors
omitted a facet, recovered only by the anchor guard. This is one run in the
same synthetic incident, not a cross-domain or answer-quality result.

Cost is substantial. For H08–H14 the planner used 2,005 prompt tokens and
7.3 seconds of model latency; the selector used another 17,367 prompt tokens
and 14.0 seconds, across 21 separate facet GROQ queries. These exclude
Sanity latency and answer generation. An offline anchors-only ablation on the
recorded candidates found 18/21 and 5/7 on H08–H14: the expensive selector
added only one gold source and no complete case there. On the already
inspected H01–H07 it added two sources and two complete cases. Further
cost/benefit and answer-quality tests are required before changing the active
connector. No benchmark rubric, State pathway, or production dataset changed.

### Coverage-gated facet search (28 September 2026)

An isolated read-only runner, `scripts/compare-sanity-coverage-gate.mjs`, now
tests a cheaper routing policy. It first performs the same scoped whole-question
semantic top-ten search. A single local Qwen call sees the question and only
short metadata for the first three candidates, and returns one to four
validated evidence facets marked `covered`, `uncertain`, or `missing`. A
`covered` claim must cite one of those candidate codes; uncertain/missing
facets trigger separate scoped semantic queries. For three or more facets,
one first-ranked result per queried facet is deduplicated with the baseline
under the same ten-source delivery limit. The detector never reads original
bodies, scores the answer, or writes State. Its coverage judgment is a
routing heuristic, **not** proof that a source supports a claim.

The first development pass on H08–H14 was overconfident: it called old-event
distractors `covered`, skipped useful searches, and tied the baseline at
17/21 sources and 4/7 complete cases. Limiting coverage claims to the first
three baseline candidates and explicitly requiring the same event/date gave
18/21 and 5/7, matching an always-query-every-facet *anchor-only* comparator
while requiring 11 rather than 18 extra facet queries. One plan was invalid
and fell back to baseline. These are inspected development results, not
prospective evidence. A simple string `"null"` from the model was later
accepted as null for noncovered facets; the prospective run below predates
that parser-only repair.

Ten new questions H15–H24 and three original-source gold IDs per question
were frozen before retrieval in
`scripts/fixtures/sanity-gated-facet-holdout.mjs` (fixture SHA-256
`dbb8e4e3777174bc3f4aeb261ec374834de50cf96bfa2b85a082d666e376b1f5`).
The prospective artifact is
`coverage-gate-prospective-2026-09-28T16-16-48-372Z.json`. In the same
145-source scope, baseline found 24/30 gold IDs and completed 6/10 cases;
the gate found 27/30 and completed 8/10. Querying every detected facet and
using only its first-ranked anchor also found 27/30 and completed 8/10.
The logical gated branch used 13 extra facet queries versus 27 for always
querying facets, plus ten baseline queries in either branch. The runner did
execute the 14 counterfactual extra queries *after* computing the gated result
to measure both policies on the same model plan; they are excluded from the
gate's projected query cost. The detector used 6,341 prompt and 750 completion
tokens with 21.9 seconds accumulated model latency across ten questions.
Recorded sequential component latency was 5.94 seconds for baseline GROQ,
21.88 seconds for the detector, and 7.35 seconds for the gate's added facet
queries: about 35.17 seconds for the ten gated retrievals versus 5.94 seconds
for baseline alone, excluding response generation. The counterfactual's 14
remaining facet queries took another 7.43 seconds. Thus fewer GROQ calls do
not yet mean lower end-to-end latency than the simple baseline.

No gold source previously found by the baseline was lost in this run, but
H15 remained 1/3 and H24 reached only 2/3. H15 includes a false `covered`
judgment for an address-sample facet; H24 searched for the deployment but
ranked the incident overview first instead of the deployment original. A
separate format error in H19 caused a safe baseline fallback (already 3/3).
Thus the detector reduced unnecessary facet queries *in this fixture* but
cannot certify coverage, and top-one facet ranking remains a retrieval
bottleneck. These questions still combine documents from the same fictional
incident; no answer-quality, cross-domain, variance, or production-cost claim
follows. The active connector, data, State pathway, and rubric remain unchanged.

### Faceted structured-answer arm (28 September 2026)

The structured v4.5 runner now accepts an **experimental**
`sanity-faceted-groq` arm. It preserves the existing single-question semantic
and keyword arms. For each question it obtains the scoped semantic top ten,
asks the answer model for a validated one-to-four-facet retrieval plan, and,
for three or more facets, performs an independent scoped semantic search per
facet. The selector sees only candidate titles and short embedding-match
fragments. One top-ranked anchor per facet is protected; the selector's valid
choices and then the original whole-question candidates fill the remaining
slots, deduplicated to ten. Invalid plans fall back to the baseline. The
selected IDs are read exactly and verified before originals enter the same
12,000-character answer packet. Both candidate and actually delivered source
IDs are recorded, because the character budget can omit a candidate.

Planner and selector calls use the same configured local answer model but are
accounted for separately in `retrievalMetrics`; `promptTokens` remains the
answer call's prompt count. Total `latencyMs` includes retrieval and all model
calls. This arm changes neither the rubric nor the active Trama connector,
State, dataset, or source schema. Earlier retrieval-only gains are not counted
as answer-quality gains; compare the complete structured answers and inspect
source support manually before promoting this route.

The 145-source, 40-case, one-repetition run completed in
`v4-run-2026-09-28T18-16-20-587Z.json` without execution errors. Under the
unchanged v4.5 scorer, faceted GROQ obtained 30/40 PASS, 31/40 decisions,
39/40 fact sets, and 40/40 valid formats. The earlier 145-source single-query
semantic run obtained 30/40 PASS, 30/40 decisions, 39/40 fact sets, and 40/40
formats; keyword obtained 27/40 PASS. These are separate one-repetition runs,
so answer variation is not attributable solely to retrieval. In two cases
(T07 and T08), PASS flipped even though the delivered source lists were
identical, which reinforces that caveat.

Among the nine cases with predeclared original-source gold (R01–R08 and X01),
the new arm delivered 11/12 required originals and completed 8/9 cases,
versus 9/12 and 7/9 for the earlier semantic baseline. X01 went from 2/4
to 4/4 delivered originals, and all four scored facts passed. The model still
selected the wrong structured decision enum despite prose supporting the
expected qualified mechanism; this is an answer-contract/model failure, not
a missing-source failure. Only six of forty questions invoked the facet
selector; five cases fell back safely to whole-question retrieval after an
invalid plan.
Planner and selector calls added 31,081 prompt tokens in total (13,613 and
17,468 respectively), on top of answer prompts. Mean recorded end-to-end
latency was 18.9 s per faceted case versus 18.4 s in the earlier semantic
run; this non-contemporaneous comparison is not an isolated latency effect.
Do not promote this arm to the active connector on these results alone.

## Isolated data and access

- Sanity project `swuqfubs`, **private** dataset `trama-evidence-pilot`,
  embeddings projection `{title,body}`. This is not `production`.
- The original 24 fictional Markdown records from the existing
  payment-incident benchmark were ingested as published `evidenceSource`
  documents. Additive synthetic stress sets of 26 and then 95 records brought
  this benchmark scope to 50 and 145, respectively. Their `body` fields preserve the source
  text; `contentHash` is SHA-256 of the UTF-8 body.
- Stable `_id` is `evidenceSource.` plus SHA-256 of
  `JSON.stringify([workspaceId, scopeId, sourceId])`. The pilot scope is
  `synthetic-benchmark` / `payment-incident-2026-09-18`.
- The separate pilot Studio schema and app live under
  `C:/Users/mateu_fftjp44/Documents/studio-trama/evidence-pilot-studio` and
  [the hosted pilot Studio](https://trama-evidence-pilot.sanity.studio/). The
  production Studio schema does not register `evidenceSource`.
- The [pilot Context MCP endpoint](https://www.sanity.io/@o6xohyg5w/context/mcp/trama-evidence-pilot-groq)
  serves only the pilot dataset in GROQ mode. Its configured filter additionally
  fixes `_type`, `workspaceId`, and `scopeId`. The organization token stays
  server-side.
- The ingestion script reads the existing original `.env.local` through
  `TRAMA_BENCHMARK_ENV_FILE` or the Documents path. No secret copy is needed in
  this worktree. It refuses a different dataset/project and never overwrites an
  existing document with divergent content.

This shared experimental endpoint is **not** a general multi-workspace
authorization design. Before real user evidence, the host must authenticate
the user, authorize workspace/case/source, and then run a server-owned query.
Do not expose the organization token or let a model author an unrestricted
query. A KB endpoint is whole-KB, so its scope must be isolated separately.

## Implementation and verification

- `scripts/sanity-content-lake-evidence.mjs`: scoped query builders, stable
  identity, strict source-ID extraction from the KB `Sources` section, exact
  document/hash/revision validation, and whole-source prompt packing.
- `scripts/ingest-sanity-evidence-pilot.mjs plan|ingest|verify`: idempotent
  synthetic corpus loader. `ingest` is the only write command.
- `scripts/probe-sanity-evidence-pilot.mjs`: read-only Context GROQ smoke check.
  It does not print original text or credentials.
- `scripts/probe-sanity-kb-source-identity.mjs`: reads the pilot KB outline
  and every generated entry, then checks that its `Sources` section contains
  allowlisted Content Lake document IDs. It reports IDs, not source bodies.
- The read-only probe passed: GROQ mode exposed `groq_query`; the projected KB
  dataset query returned 24 identity-bearing sources; semantic retrieval
  returned 5 candidates; exact GROQ retrieval returned 3/3 documents with
  content hashes. The dataset embeddings status was `ready`.

The first Context probe returned `-32004` after schema-only deployment. A
dedicated pilot Studio application had to be deployed to the same dataset;
the probe passed afterward. This is a real prerequisite for this account,
despite the schema deploy having succeeded.

## KB identity gate and evaluation

The projected dataset-source title begins with the exact `_id`, but this does
**not** prove Sanity's generated KB entries retain that ID in their source
references. The KB-guided arm must fail closed when an explicit, allowlisted
ID is absent; a filename or citation number is not sufficient. Inspect its
actual output before accepting retrieval metrics.

The `Trama Evidence Reader` endpoint was migrated to the newer
`kbesKgcIBIO2` KB and probed before and after the user-authorized deletion
of the oldest `trama-evidence` KB (`kbDylxoCV0YH`). The original Markdown
files remain, but that deleted KB's generated content would require a rebuild.
The dataset-sourced pilot KB is `kbhltiJDzx0j`. Its 24-document import and
first build completed successfully: 24/24 sources distilled, state `ready`,
zero open issues. The read-only MCP identity probe found 10 generated entries
whose `Sources` sections cover all 24 expected stable document IDs with no
unknown IDs. This passes the source-ID gate; it does not establish that the
KB chooses the right entry for every question. A one-case `KB → GROQ` smoke
test (`R02`) selected the deployment entry, retrieved the original Content
Lake source and answered the 10→4 second timeout change with an exact ID and
revision.

The first full run was intentionally stopped after 28/114 diagnostic cases:
for `T02`, the model selected the correct Provider B index entry, but the
host's first-five packing order omitted its original document and induced a
false absence claim. This is a connector bug, not a KB identity failure.
The host now fetches and validates all IDs from the selected entries in
bounded batches, ranks only those original documents against the question,
and packs the top five whole sources. The `T02` smoke after this change
included `07-provider-b-timeout.md` first and answered correctly. The full
comparison was restarted from zero; the partial run is not a result set.

When that gate passes, benchmark on identical questions, local model,
retrieval budget, and answer rubric. Log exact source IDs, revisions/hashes,
source-ID recall, factual support/citations, token use, latency, and gaps.
Include unrelated subjects and distractors before treating this as a
subject-agnostic result. A 24-file synthetic corpus alone cannot establish
that the KB is worthwhile.

The automatic PASS/FAIL in v3 is **lexical triage**, not an adjudication of
factual correctness. Each result now carries the matched/missing concept
groups, threshold, safety-guard outcome, a post-answer reference conclusion,
and source names to inspect. The terminal watcher and manual-audit workbench
display this rationale. The reference is never included in the model prompt.
Manual review must still check contradictions, whether the cited source truly
supports the claim, and whether the State snapshot is authoritative. The
current runs finished 114/114 attempts per arm, but their aggregate lexical
scores must not be presented as accuracy rates before that audit.

### Initial same-model comparison (24 September 2026)

Both arms used `qwen3:4b-instruct`, `num_ctx=4096`, the same 38 questions,
three repetitions, and the 24-file synthetic corpus. These were separate
sequential runs, not a randomized paired experiment; the current State and
source corpus should be revalidated before treating them as identical.

| Arm | Valid answers | Execution errors | Lexical PASS | Mean prompt tokens | Mean end-to-end latency |
| --- | ---: | ---: | ---: | ---: | ---: |
| Scoped semantic GROQ → exact originals | 114 | 0 | 64/114 | 1,421 | 9.32 s |
| Raw-full (all 24 originals) | 113 | 1 CUDA OOM | 71/113 | 2,021 | 6.18 s |
| Sanity KB index → ranked, exact GROQ originals | 113 | 1 CUDA OOM | 80/113 | 4,067 | 14.48 s |

The largest category difference is inference (GROQ-only 4/30, raw-full
16/30); temporal separation reverses it (21/24 versus 12/24). This suggests
both a candidate-ranking gap and distractor interference, but the scorer has
known false positives and false negatives. In particular, `T02` passed while
misidentifying the investigated event, and `T07` failed despite a plausible
answer phrased without the rubric's exact negation. The manual audit must
adjudicate factual correctness and source support before an effectiveness
claim. The KB→GROQ arm improved the lexical triage total but cost more
prompt tokens and latency than both alternatives. It retrieved all required
source IDs in the 24 scored case repetitions, and all 113 valid calls read
registered originals with no unknown or missing IDs. These labels cover
only a subset of cases. Of 113 valid answers, 92 contained a recognizable
source citation and all 92 cited only selected IDs/names; 21 had no citation
resolution score. This measures identity matching, not whether the source
supports the claim. Seventy-one calls omitted at least one candidate source
from the five-source answer packet, making source selection a material
limitation.

By category, the KB→GROQ arm scored 18/30 inference (versus GROQ-only 4/30
and raw-full 16/30), 23/23 temporal among valid answers (21/24 and 12/24),
and 6/18 State (10/18 and 12/18). The State bucket is not currently a
reliable arm comparison: `S03` correctly cites `status: applied` and
`appliedAt` but fails for omitting the literal `approvedAt`; `S04` says
`base revision: 1/2` but the rubric requires `base revision 1/2`; `S05`
uses backticks around `stateRevision` and fails the contiguous literal
check. These are visible false negatives, not established model errors.
The KB arm's `T02` had two
valid answers with the correct Provider B original selected first and one
CUDA OOM. The run artifacts are `v3-run-2026-09-23T19-08-33-071Z.json`,
`v3-run-2026-09-24T17-36-47-023Z.json`, and
`v3-run-2026-09-24T18-26-42-557Z.json`. The latter two record the same
`corpusHash`; the earlier GROQ artifact predates that field but has the same
pilot source-label hash as the KB run.

## Sanity references

- [Content Lake dataset sources for KB](https://www.sanity.io/docs/ai/sanity-context-source-types)
- [Context retrieval modes](https://www.sanity.io/docs/ai/sanity-context-retrieval-modes)
- [Context MCP security](https://www.sanity.io/docs/ai/sanity-context-security)
- [Dataset embeddings](https://www.sanity.io/docs/content-lake/dataset-embeddings)
