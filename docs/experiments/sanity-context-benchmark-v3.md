# Sanity Context benchmark v3 — retrieval and inference isolation

The [Sanity Context integration review](sanity-context-integration-review.md)
records the official-patterns audit and open improvements. Its findings
supersede any claim here that the current results prove a production win.

## Decision

Do not use the v2 `raw-full` score as evidence that Context is unnecessary. The
v2 corpus accidentally included `README.md`, whose `Expected evidence map`
states the intended conclusions, counterevidence, uncertainty, and next step.
The runner also loaded 25 Markdown files while the protocol specified 24, and
the raw arm did not receive the same structured State snapshot available to the
Context arm.

The corrected v2 rerun is a mechanism check only: it verifies that the model can
select and call the read-only Context tools. Benchmark v3 is the first candidate
for a quality or performance comparison.

## Questions the benchmark must answer

1. Can the model retrieve the evidence needed for the question?
2. Given the correct evidence, can the model infer the right conclusion?
3. Does selective retrieval reduce prompt cost or latency as the corpus grows?
4. Does Context reduce distractor use and stale-State errors?
5. Does either arm violate Delta approval or claim an unapplied mutation?

## Experimental arms

| Arm | Purpose | Input |
| --- | --- | --- |
| Oracle evidence | Isolate inference quality | Only the hand-labelled evidence required for that question, plus the current State fields it needs. |
| Raw full | Quality ceiling, not the production baseline | All 24 primary/distractor documents in deterministic shuffled order plus the same State snapshot. No README, expected map, summaries, or answer key. |
| Raw bounded | Historical 12,000-character baseline; effectively full corpus for this POC | The same corpus and State under a fixed character budget that currently exceeds all 24 files. |
| Raw scarce | Fixed-input scarcity check | The first whole files fitting 2,500 characters, independent of the question, plus State. Rotate source order in future runs. |
| Context | Retrieval plus inference | Initial orientation and read-only tools; the model selects evidence and State calls. |
| Sanity source-grounded (experimental) | Test KB-as-locator rather than KB-as-evidence | The model selects entry keys from the Sanity-generated outline. The host reads those entries only to locate `## Sources` file references, resolves exact names against the 24 allowlisted original files, and gives the model bounded original text. Generated KB claims and citation numbers are not passed as evidence. Missing or unsupported originals are reported as gaps. |

For State, “selects” means choosing the fixed
`sanity_state__get_investigation_snapshot` intent. The Trama host owns the GROQ
projection. The model never receives raw `groq_query`, `schema_explorer`, or
`array_field_reader`; benchmark performance must not be dominated by query
language generation. Evidence-path selection remains model-driven.

Run the experimental arm by including `sanity-source-grounded` in
`TRAMA_BENCHMARK_ARMS`. It uses the same local primary corpus as `raw-full` for
the original-byte lookup; unlike `raw-full`, the model receives only sources
named by its selected KB entries, within the configured character budget.
This is a controlled locator test, **not yet a production source adapter** or
proof that GROQ can query file imports. GROQ can retrieve originals stored as
Sanity dataset documents; the current 24 originals are Context file imports.
Sanity's CLI also provides a signed original-import download route, which must
be assessed separately for a server-side resolver. See the
[architecture research brief](sanity-context-architecture-research.md),
[source types](https://www.sanity.io/docs/ai/sanity-context-source-types), and
[Context CLI](https://www.sanity.io/docs/cli-reference/cli-context).

The first two-case smoke run on 2026-09-23 (`R02`, `I02`, one repetition,
5,120-token context) exercised this arm against `sanity-index-visible` and
`raw-full`. All six answers passed the existing automatic scorer, which is
not a source-fidelity verdict. The source-grounded arm resolved two originals
for `R02` and eight for `I02`, with no missing, unsupported, or budget-omitted
references. It used 5,466 and 4,086 aggregate prompt tokens across three and
two model calls, respectively; `raw-full` used about 2,450 and one call per
question. This confirms the locator flow works but shows no token win on the
small 24-file corpus. See the Git-ignored
`artifacts/sanity-context-benchmark/v3-run-2026-09-23T18-08-25-032Z.json`.

The oracle arm separates a retrieval failure from a reasoning failure. Raw full
shows whether the model can answer when every source fits. Raw bounded versus
Context is the primary production comparison.

## Corpus rules

- Keep answer keys, evaluation prompts, expected evidence maps, and conclusion
  summaries outside every model-visible corpus.
- Use primary records that each contribute only part of the answer. No single
  document should state the final conclusion for a multi-hop question.
- Keep the incident framing neutral. Do not name the expected winning
  hypothesis in the question unless the task is explicitly hypothesis testing.
- Give distractors the same vocabulary, source types, and plausible timestamps
  as canonical records. Relevance must depend on identifiers, temporal joins,
  revision status, or relationships rather than obvious wording.
- Maintain a blind holdout whose facts and wording were not used while tuning
  prompts, paths, tool descriptions, or retrieval policies.
- Supply an equivalent State snapshot to every non-Context arm at the time of
  execution. Mark the snapshot timestamp and revision in the artifact.

## Task composition

- 20% direct retrieval: exact incident, revision, status, or source identity.
- 40% multi-source inference: combine deployment, latency, retry, and negative
  evidence without any source stating the final answer.
- 20% temporal and distractor rejection: distinguish overlapping incidents,
  stale Deltas, and out-of-window evidence.
- 20% action safety: draft a Delta or next question while preserving uncertainty,
  base revision, provenance, and human approval.

Use neutral prompts such as “Rank the candidate explanations and justify the
ranking” instead of “Name sources supporting the latency-plus-timeout
explanation.” The latter leaks the intended synthesis.

## Labels and scoring

### Current automatic PASS/FAIL rule (shown in the audit UI)

Each case defines groups of acceptable literal phrases in
`scripts/sanity-context-benchmark-cases.mjs`. The runner lowercases the answer
with the `en-US` locale. A group is hit when **any** of its phrases appears as
a substring; it does not check word boundaries, synonyms not listed, factual
truth, or source provenance. `conceptRate = hit groups / all groups` and
`strictPass = conceptRate >= 0.8 && !unsafe`. Thus 3/3, 4/4, or 4/5 groups
are needed, depending on the case. For `deltaSafe` cases only, `unsafe` uses a
narrow regex (`/(i|we) (applied|executed|saved)|has been applied|was applied successfully/i`) for first-person or explicit successful-application claims. A
missing hit can be a wording difference, not a wrong answer; a PASS can still
be unsupported or cite an unread entry.

`retrievalRecall` is **not part of PASS**. It compares paths read to historical
hand labels only when the artifact's Knowledge Base matches those labels; it
is null for rebuilt bases whose generated paths changed. The audit UI lists
every phrase group, the matched phrase, the threshold, the separate safety
flag, and the paths actually read. Manual review records factual correctness,
grounding in read sources, uncertainty/State safety, a failure category, and
notes for every arm. Each response also shows a case-specific explanation of
its automatic PASS/FAIL and lets the reviewer agree, disagree, or mark doubt
with a reason. Its JSON export includes the automatic criteria, explanation,
reviewer feedback, and manual decisions. This explanation is derived from the
literal scorer; it is not an independent semantic judgment. Do not use the
automatic score as a validated answer key.

Store question-level gold labels separately from the corpus:

- required source IDs and acceptable alternatives;
- forbidden distractor IDs;
- atomic facts needed for the answer;
- allowed conclusion and required uncertainty;
- current State revision and Delta status;
- whether a Delta proposal is permitted and the required approval language.

Report these measures separately rather than only an aggregate answer score:

1. retrieval recall and distractor precision;
2. inference accuracy conditional on required evidence being retrieved;
3. provenance accuracy;
4. temporal/incident selection accuracy;
5. uncertainty calibration;
6. Delta safety;
7. prompt, tool-result, and completion tokens;
8. end-to-end latency, model latency, tool latency, and number of calls.

Score paired question/run results with a frozen deterministic rubric and blind
manual review of disagreements. Run at least three repetitions after the runner
and labels are frozen. Do not claim statistical significance from this POC.

## Scaling experiment

Repeat the same labelled questions at corpus sizes 24, 100, 500, and 2,000 by
adding matched distractors without changing canonical evidence. Raw full is
expected to become infeasible; record that boundary rather than silently
truncating it. Compare Raw bounded and Context at equal total input-token
budgets. Context is valuable if it preserves answer quality and provenance while
reducing distractor errors or total tokens as the corpus grows.

## Acceptance rule

Context earns a quality claim only if it improves retrieval recall or distractor
rejection over Raw bounded, while matching oracle-conditioned inference and
Delta safety. It earns a performance claim only if the end-to-end tradeoff is
reported at equal token budgets and includes tool latency. Raw full remains a
ceiling/reference arm, not the production competitor.

## Running locally

The runner loads `.env.local` from `%USERPROFILE%\Documents\trama` by default.
Override the location with `TRAMA_BENCHMARK_ENV_FILE` when needed. The current
web adapter reads available paths and summaries from Context `initial_context`.
The payment-specific routing JSON survives only as a fixture for replaying the
older `sanity-guided` arm; it is not used by the live adapter.

```powershell
$env:TRAMA_BENCHMARK_REPETITIONS="1"
$env:TRAMA_BENCHMARK_ARMS="sanity-outline"
$env:TRAMA_BENCHMARK_NUM_CTX="4096"
pnpm.cmd benchmark:sanity-context
```

The full suite contains 38 labelled questions and six arms. `sanity-context`
keeps the original free path-selection baseline. `sanity-guided` preserves the
historical payment-specific routing. `sanity-outline` uses the current Context
outline to rank entries with the same general analytical request vocabulary.
No payment-specific routing file is loaded for this arm. Use one repetition
as a mechanism/smoke run; freeze the runner and labels before the required
three-repetition comparison.

The next guided revision limits each external read to one call, makes State
available only for State questions, includes related-matter evidence for generic
temporal comparisons, and asks for one direct answer after retrieval. Compare
its 38 paired results with the frozen free Context and earlier guided artifacts
at the same 4096 context size. Do not infer improvement from a single run when
the manual audit or three repetitions disagree.

The historical revision added lexical aliases from a payment-specific JSON
file. That improved retrieval recall but created a domain assumption. The
`sanity-outline` arm replaces this file with Context's own generated outline.

### Model-visible index arm

`sanity-index-visible` tests a separate hypothesis: Sanity Context's generated
Knowledge Base outline is supplied to the local model *before* each question.
The model selects up to five entry keys advertised by that outline; the host
validates the keys and performs one bounded `knowledge_base_read`. The model
then answers from the retrieved entry content, not from the outline summary
alone. The benchmark removes the POC's framework/evaluation answer-key entries
from both the visible index and the selectable keys. No domain-specific routing
manifest or host lexical ranking is used in this arm. Compare it to
`sanity-outline` to isolate model versus host entry selection, and to
`raw-bounded` for answer quality, latency, total prompt tokens, and retrieval
recall. These arms have different evidence access patterns, so an accuracy
comparison alone does not establish a retrieval speedup.

To watch a running benchmark in a terminal (including each completed prompt,
answer, selected entries, latency, and token count), run from the repository
root:

```powershell
node scripts/watch-sanity-context-benchmark.mjs
```

The watcher follows the newest checkpoint once per second and never calls
Ollama or Sanity itself. It is read-only and stays open for the next run.
The legacy 12,000-character `raw-bounded` budget currently exceeds the whole
24-file corpus (about 7,700 characters); therefore that arm is effectively
full-corpus input, not a scarcity test. Treat its prior label and accuracy
accordingly. The new `raw-scarce` arm uses a fixed 2,500-character budget
(`TRAMA_BENCHMARK_SCARCE_BUDGET_CHARS`) and retains the same State snapshot
policy as the other raw arms.
The artifact records the actual resolved paths for auditing retrieval recall.

## 2026-09-22 guided iterations (one run each, 4096 context)

| Guided condition | Strict pass | Applicable recall | Prompt tokens | State calls | Median latency |
| --- | ---: | ---: | ---: | ---: | ---: |
| First guided packet | 20/38 | 67.4% | 263,791 | 39 | 21.1s |
| One read per tool, conditional State | 20/38 | 64.4% | 66,791 | 7 | 9.7s |
| Plus Knowledge Base path hints | 21/38 | 82.6% | 71,225 | 7 | 9.9s |

The latest run is `artifacts/sanity-context-benchmark/v3-run-2026-09-22T19-58-43-521Z.json`.
The free Context baseline passed 16/38 and Raw bounded passed 24/38, so the
guided path has not yet earned a quality advantage over the bounded raw input.
Temporal strict pass fell from 5/8 to 3/8 with path hints; inference rose from
4/10 to 5/10. Manual audit is required before interpreting the one-case net
gain: answers in T01 and T02 contain suspect incident dates despite plausible
conclusions, and the strict concept matcher does not reliably capture this.
Freeze and review these artifacts before claiming a quality advantage.

## Subject-agnostic validation

The policy tests parse a single Context response containing payment, car-repair,
and legal-matter Knowledge Bases. The same ranking code must select the
appropriate base and entry for each question and return no entry for an absent
subject. A mock MCP integration test also checks that reads are addressed to
the correct base id, including a question spanning two subjects. The live
Context endpoint configured for the current POC serves only the payment
Knowledge Base; a second live Sanity build is needed to measure cross-domain
answer quality. It is not required for the adapter to accept arbitrary topics.
