# Sanity Context integration review — 2026-09-22

## Status and scope

Research and implementation-review notes. The clean Knowledge Base experiment
below was approved on 2026-09-22; the live adapter and endpoint remain unchanged.
The goal is to test whether the current Trama
integration fairly uses Sanity Context Knowledge Base mode before optimizing
prompts or claiming an accuracy or speed advantage. The product remains
subject-agnostic: a connected Knowledge Base can cover any subject, but Context
cannot retrieve facts that have not been supplied to one of its sources.

## Official patterns that matter here

1. **Keep four instruction layers distinct.** A Knowledge Base's *purpose*
   steers its generated outline and core/peripheral tags. Source-anchored
   Knowledge Base *instructions* influence entries at build time. The MCP
   endpoint's *instructions* explain non-obvious data relationships and
   retrieval boundaries to the agent. The application's system prompt handles
   behavior, audience, uncertainty, and fallback. The Sanity guidance cautions
   against duplicating data/query guidance in a long system prompt. See
   [Knowledge Bases](https://www.sanity.io/docs/ai/sanity-context-knowledge-bases),
   [production patterns](https://www.sanity.io/docs/ai/sanity-context-patterns),
   and Sanity's [shape-your-agent](https://github.com/sanity-io/context/blob/main/skills/shape-your-agent/SKILL.md)
   and [dial-your-context](https://github.com/sanity-io/context/blob/main/skills/dial-your-context/SKILL.md)
   guides. The latter is chiefly GROQ/schema-oriented, so its query examples
   must not be copied mechanically into Knowledge Base mode.
2. **Give the agent the actual initial context.** In Knowledge Base mode it
   contains the Knowledge Base title/purpose, complete outline, tool and
   grounding instructions. Sanity recommends inlining the same payload via
   `/initial-context` when the application controls the system prompt, then
   removing the redundant `initial_context` tool. A cached inline payload must
   be refreshed after a Knowledge Base rebuild. See
   [inline initial context](https://www.sanity.io/docs/ai/sanity-context-initial-context).
3. **Use the mode's actual retrieval contract.** Knowledge Base mode exposes
   `initial_context` and `knowledge_base_read`; the latter accepts 1–20 paths
   and Sanity recommends batching several plausible entries in one call.
   There is no semantic-search tool in this mode. GROQ mode queries a live
   structured dataset and can use dataset embeddings for semantic ranking.
   Attaching a dataset source to the same endpoint takes precedence over
   Knowledge Base sources. See [MCP tools](https://www.sanity.io/docs/ai/sanity-context-mcp-tools)
   and [retrieval modes](https://www.sanity.io/docs/ai/sanity-context-retrieval-modes).
4. **Make multi-backend ownership explicit.** Sanity says there is no hidden
   router among MCPs: the model sees a flat tool list. Use a concise
   source-of-truth table in the system prompt, distinct tool descriptions,
   structural scoping, and a small tool set. In Trama, Context owns the
   evidence it serves, while Trama/authoritative State owns the current Caso,
   Delta, approval, and application status. The current deterministic State
   query boundary is directionally aligned with this pattern. See
   [multi-backend patterns](https://www.sanity.io/docs/ai/sanity-context-patterns).
5. **Review the built Knowledge Base, not only the agent.** Sanity recommends
   focused trusted sources, a clear purpose, reviewing generated entry coverage
   and summaries, resolving material issues, and testing questions whose
   answers are known. Build-generated entries are synthesized Markdown with
   citations; they are not interchangeable with the original files. See
   [create a Knowledge Base](https://www.sanity.io/docs/ai/sanity-context-create-knowledge-base),
   [Knowledge Bases](https://www.sanity.io/docs/ai/sanity-context-knowledge-bases),
   and [resolve issues](https://www.sanity.io/docs/ai/sanity-context-resolve-issues).
6. **Instrument the loop.** Sanity recommends Agent Insights for conversation
   successes and content gaps, and displaying exact structured operational
   results as UI rather than having the model paraphrase changing values.
   These are future product options, not prerequisites for the benchmark.
   See [production patterns](https://www.sanity.io/docs/ai/sanity-context-patterns)
   and [Insights](https://www.sanity.io/docs/ai/sanity-context-insights).

## Observations in the current Trama POC

| Priority | Observation | Consequence / uncertainty |
| --- | --- | --- |
| P0 | The `sanity-index-visible` runner reconstructs an outline from paths and descriptions, rather than giving the model the complete `initial_context`. The live chat route does include the complete payload. | The benchmark does not faithfully measure the live integration or Sanity's recommended orientation. Preserve the endpoint instructions and Knowledge Base purpose in the next ablation, while excluding only evaluation entries. |
| P0 | The current Knowledge Base has `poc_framework` and `evidence_evaluation` entries. The benchmark hides those paths from the model, but they remain in the built Knowledge Base. | Their source material may have influenced other synthesized entries during build. Runtime path filtering alone cannot establish an answer-key-free corpus. This is a contamination risk, not yet proven leakage. Rebuild from primary evidence only before a definitive test. |
| P0 | The live `initial_context` instructs the agent not to infer or connect facts, while the evaluation asks for explicitly qualified inference. | Reconcile endpoint instructions with the intended investigation behavior: permit evidence-backed inference labeled as such, while forbidding unsupported certainty. Do not solve this by stacking contradictory prompt rules. |
| P0 | In `hypotheses/provider_latency`, the numbered citations appear reversed for at least the latency log and vendor status notice: the text attributes the latency measurement to `[1]`, but the Sources list names the status notice as `[1]` and the log as `[2]`. | Audit provenance against original files and review the Knowledge Base build/issues. Do not trust citation numbers as validated merely because Context generated them. |
| P1 | The model-facing wrapper caps selection at five entries and one call, although the native MCP read accepts up to twenty paths and the production guide allows multi-step use. | A broad question may need more evidence or one recovery read. Test the cap as an ablation; do not assume either unrestricted reads or a five-entry limit is optimal. |
| P1 | The runner records selected paths and aggregate prompt tokens, but not the exact tool-result text or per-model-call context usage. | We cannot distinguish selection failure, entry synthesis error, context truncation, model reasoning, and scorer error in many failed cases. Add redacted trace artifacts for evaluation. |
| P1 | The benchmark excludes the `initial_context` fetch and Knowledge Base build from reported latency. | Its timing is answer-loop latency, not end-to-end ingestion/build or fresh-session latency. Report these costs separately rather than claiming a general retrieval-speed win. |
| P1 | The old 12,000-character `raw-bounded` budget exceeds the roughly 7,700-character source corpus and therefore includes all 24 files. The new 2,500-character `raw-scarce` condition includes only three fixed files. | Neither is a complete production baseline. Rotate scarce-source order and use larger, more varied corpora before generalizing. |

The 4,096-context controlled artifact
[`v3-run-2026-09-22T22-54-06-003Z.json`](../../artifacts/sanity-context-benchmark/v3-run-2026-09-22T22-54-06-003Z.json)
scored the model-visible index 21/38 automatically, with 8/8 factual
retrieval cases but 3/10 inference cases. Thirteen of its seventeen automatic
failures had all hand-labelled required paths retrieved. This does **not**
establish that retrieval was sufficient: entries may omit detail, the model
may lose context or reason poorly, and the string scorer has known false
negatives. The separate
[`raw-scarce` artifact](../../artifacts/sanity-context-benchmark/v3-run-2026-09-22T22-59-00-970Z.json)
scored 19/38; a two-case difference in one run is not a robust advantage.

## Implementation in progress — 2026-09-22

- Existing Knowledge Base `kbDylxoCV0YH` remains untouched. Its CLI metadata
  reports 25 file imports, including `README.md`; that README contains an
  expected evidence map and evaluation prompts, so it is an answer-key leakage
  risk. The original build also reports one open issue.
- A separate experimental Knowledge Base, `kbesKgcIBIO2`, was created with a
  subject-agnostic investigation purpose. Its intended source set is the same
  24 Markdown documents given to the raw benchmark, excluding `README.md`.
  The scenario document is included in both arms and itself names candidate
  hypotheses; this is a remaining, symmetric cue, not a blind inference test.
- The runner now supports `TRAMA_BENCHMARK_KB_ID=kbesKgcIBIO2` for a per-request
  Knowledge Base override, plus a `sanity-full-context` arm that passes the
  exact initial context to the model, permits batches of up to 20 entry paths
  and one targeted recovery read, and records model-call inputs, Context read
  results, timings, and per-call token counts. Trace artifacts are ignored by
  Git because they may contain source material; never commit them without a
  separate redaction review.
- The clean build succeeded with 24 completed imports and four open review issues.
  The CLI exposes the issue count but not issue details; inspect those in the
  Context Dashboard before publishing the base. A sampled
  `fraud_analysis` read already has two material synthesis/provenance errors:
  it attaches the `2026-08-01` date from `21-fraud-audit-history.md` to the
  incident-window findings in `04-fraud-score-report.md`, and its source list
  swaps items 3 and 4 (`09-fraud-tuning-proposal.md` and
  `13-fraud-quarterly-report.md`). Those statements must be checked against
  the primary files, not trusted just because they carry numbered citations.
- At 4,096 tokens, the full-context I02 smoke exceeded the model window
  (4,273 tokens). The runner now records context-window and memory failures as
  case results instead of aborting the whole suite. A 5,120-token probe
  completed I02 without GPU OOM (two model calls, 6,436 aggregate prompt
  tokens, strict automatic pass). This is an operating point to validate over
  the full suite, not proof that every question will fit.
- The paired 38-case diagnostic at 5,120 tokens completed 114/114 attempts
  without a recorded OOM, overflow, or timeout. It scored `raw-scarce` 18/38
  (43,093 aggregate prompt tokens; 7.0 s median), `sanity-index-visible`
  26/38 (178,925 tokens; 12.6 s), and `sanity-full-context` 17/38
  (307,328 tokens; 14.0 s). See the local, Git-ignored
  [`v3-run-2026-09-23T01-11-28-094Z.json`](../../artifacts/sanity-context-benchmark/v3-run-2026-09-23T01-11-28-094Z.json).
  The runner was stopped after 41 results when one active Ollama call lasted
  over four minutes; it resumed from checkpoint with a 90-second per-call
  timeout. No resumed case hit that limit. This is a diagnostic, not a clean
  production winner: the generated base has provenance defects, the strict
  string scorer has false negatives, and the index arm retrieves State through
  a tool while the new full-context arm inlines the same fixed snapshot.
- Manual spot review found at least two correct full-context answers scored
  false (I03 says "the sample is limited" rather than the scorer's "limited
  sample"; I09 says "no fraud rule changes" rather than its expected literal
  phrase). Conversely, T02 reached the correct exclusion conclusion while
  citing `excluded_incidents` without actually reading that entry, and T01
  attempted two empty `paths` calls. Answer validity and retrieved-source
  grounding must be audited separately.
- A focused nine-case `sanity-full-enum` experiment constrained the native
  `paths` argument to the generated outline. All nine calls became nonempty,
  but automatic accuracy remained 1/9, equal to unconstrained full-context
  and below index-visible's 9/9 on those selected cases. The enum arm chose
  45 paths versus 29 for the index arm; one case asked for ten entries and
  reached 5,115/5,120 tokens on a model call. See
  [`v3-run-2026-09-23T01-15-06-842Z.json`](../../artifacts/sanity-context-benchmark/v3-run-2026-09-23T01-15-06-842Z.json).
  A valid tool argument alone does not solve over-selection or context pressure.
- A second focused nine-case `sanity-full-bounded` test retained the exact
  initial context but limited the enumerated read to five paths and one call.
  It rose to 4/9 automatic passes (31 selected paths, 71,093 prompt tokens),
  versus 1/9 and 45 paths for the 20-path enum arm. It still trailed the
  compact generated-index arm's 9/9 on this **selected** set. In T01, the
  bounded answer passed the literal scorer while citing `excluded_incidents`
  even though it did not read that entry. This is an orientation-as-evidence
  failure; automatic correctness must not be conflated with groundedness. See
  [`v3-run-2026-09-23T01-18-39-902Z.json`](../../artifacts/sanity-context-benchmark/v3-run-2026-09-23T01-18-39-902Z.json).
- A final 38-case `raw-full` control at the same 5,120-token setting scored
  24/38 automatically, using 93,139 aggregate prompt tokens and a 5.1 s
  median. It scored 8/8 direct-retrieval questions. See
  [`v3-run-2026-09-23T01-24-56-963Z.json`](../../artifacts/sanity-context-benchmark/v3-run-2026-09-23T01-24-56-963Z.json).
  The entire 24-file primary corpus is only about 7,700 characters and fits
  the model window, so this is a strong but unrealistically easy raw baseline.
  The compact Context index's 26/38 is two automatic passes higher in one run,
  but used 1.9× as many aggregate prompt tokens and about 2.5× the median
  latency. Neither a statistically reliable quality advantage nor a retrieval
  efficiency gain is established at this corpus size.

## Working decision

Do not switch the live endpoint to the experimental Knowledge Base while its
four issues and demonstrated citation errors remain unresolved. The best
scoring integration in this small, single-run diagnostic was the compact,
Sanity-generated outline with bounded entry-key selection and a required
source read. This is subject-agnostic: the valid paths and descriptions come
from the active Knowledge Base, not an incident-specific manifest. Before a
production choice, resolve the generated entries' provenance, make current
State access identical in every arm, audit scorer false negatives and unread
citations, then repeat on held-out subject domains and larger corpora. A
  substantially larger corpus with controlled distractors is needed next:
  compare source selection under a fixed prompt budget, while retaining a
  full-corpus raw condition only when it actually fits. `raw-scarce` alone is
  intentionally information-poor, whereas this small-corpus `raw-full` gives
  the model every source with no retrieval work.

## CLI audit — 2026-09-23

The documented Sanity CLI was used read-only (`context get`, `imports list`,
and `context --help`). The original `kbDylxoCV0YH` remains `review` with
25/25 completed imports, one open issue, no pending changes, and zero saved
instructions; the imports include `README.md`. The experimental
`kbesKgcIBIO2` remains `review` with 24/24 completed imports, four open
issues, no pending changes, and zero saved instructions; it excludes
`README.md`. The CLI exposes these metadata and import states, but its
documented `context` commands do not list issue details or generated entries.
Use the Context Dashboard's Issues view to inspect and resolve the four
issues, and the read-only MCP `knowledge_base_read` to audit synthesized text
and citations against original source files. Do not interpret `review` or a
successful build as source-fidelity approval.

## Issue triage and connector reassessment — 2026-09-23

The four experimental-KB issues were inspected in the Context Dashboard and
resolved against the displayed source provenance. The CLI now reports
`openIssueCount: 0`, `instructionCount: 4`, and `state: ready` for
`kbesKgcIBIO2`; the original `kbDylxoCV0YH` was not changed.

| Issue | Decision and reason |
| --- | --- |
| Fraud entry dated its 08:00–12:00 audit to 2026-08-01 | Chose the source-side wording: the audit source specifies a time span but no date. Context had supplied an unsupported date. The affected entry began an immediate rewrite. |
| Fraud entry dated the primary incident to 2026-08-01 | Chose 2026-09-18 from the scenario chronology. The 04 fraud source cannot establish the incident date. |
| Fraud entry called 08:00–12:00 the incident window | Chose 10:00–10:15 for the incident itself; 08:00–12:00 remains the broader fraud-audit window. These are distinct intervals, not competing measurements of one event. |
| Monitoring owner draft dated 2026-09-18 16:00 | Chose 2026-09-21 from `23-monitoring-owner-draft.md`; 2026-09-18 16:00 belongs to the separate `10-retry-dashboard.md` proposal. |

The Dashboard said the last three choices were saved as instructions shaping
the next rebuild, rather than immediately rewriting all affected entries.
Therefore an empty issue queue does **not** establish that every served entry
has already changed or that citation provenance is correct. Before new scores
are interpreted, read the affected entries through `knowledge_base_read`,
verify their text and citations, then rebuild if needed and re-audit. Keep the
pre-resolution and post-resolution benchmark versions distinct.

A rebuild was started with `sanity context build kbesKgcIBIO2 --watch` after
the four resolutions. At the last check its job
`ctx-build-986e2ff5-c2d3-415f-8924-6ad4d40da2f9-1790174181429` was still
`queued` according to `sanity context jobs get`. The local watcher was stopped
without cancelling the remote job. No post-build quality claim or benchmark
rerun should be made until the job completes and the entries are checked.

## Post-rebuild evidence audit — 2026-09-23

The same job completed successfully at 15:02:08 UTC. Its result reported 16
generated entries, 24/24 sources cited, three issues created during the build
(two classified critical), and revision
`0c3e4fe5-49b5-4070-b9a6-27b252ba7c70`. `sanity context get` then reported
`state: review`, `openIssueCount: 0`, four saved instructions, and no pending
changes. The zero *currently open* issues do not mean that the three build-time
issues never existed or that source attribution is sound. The terminal-state
monitor was disabled. The CLI was available through `npx sanity@latest`; no
project dependency or live endpoint was changed.

The experimental endpoint's `initial_context` and six affected full entries
were read through the native, read-only `knowledge_base_read` tool and checked
against the primary Markdown files. A seventh entry, `provider_latency/provider_a`,
was sampled for the previously observed citation problem.

| Entry | Post-build finding | Source check |
| --- | --- | --- |
| `chronology` and `incident_overview` | Correctly distinguish the 2026-09-18 10:00–10:15 incident from the 08:00–12:00 fraud-audit window. | `00-scenario.md` establishes the incident date and window. |
| `excluded_incidents/admin_and_case_records` | Correctly dates the unapproved monitoring-owner draft to 2026-09-21 and cites its file. | `23-monitoring-owner-draft.md` agrees. |
| `monitoring_and_dashboards` | Separates the 2026-09-18 16:00 retry-dashboard proposal from the 2026-09-21 owner draft, but the latter paragraph has no citation and `23-monitoring-owner-draft.md` is absent from the entry's Sources list. | The two dates belong to `10-retry-dashboard.md` and `23-monitoring-owner-draft.md`, respectively. |
| `candidate_causes/fraud_rules` | **Still asserts** that the no-publication audit covered 08:00–12:00 **on 2026-09-18** and cites only `[1]`. It also reverses Sources `[3]` and `[4]`: the prose uses `[3]` for the unpublished tuning proposal and `[4]` for the Q3 aggregate report, while the Sources list assigns those numbers to the opposite files. | `04-fraud-score-report.md` gives 08:00–12:00 but **no date**. `09-fraud-tuning-proposal.md` is the unpublished proposal; `13-fraud-quarterly-report.md` is the aggregate report. The incident date from `00-scenario.md` may be contextual inference, but `[1]` alone does not establish the audit date. |
| `provider_latency/provider_a` | The earlier reversed citation list is corrected in this revision: latency measurements cite `02-provider-latency-log.md` as `[1]`, while the 10:12 status notice cites `05-provider-status-update.md` as `[2]`. | The cited files support those distinct claims. |

**Gate:** Do not treat this revision as a citation-validated benchmark oracle or
switch the live endpoint to it. This is primarily a Knowledge Base synthesis
and provenance defect, not evidence that the model selected the wrong entry.
Before another paired benchmark, correct the unsupported date and citation
mappings, add the missing owner-draft citation, then re-read the affected
entries. Keep a snapshot of this revision to distinguish Sanity
synthesis errors from connector retrieval and model inference errors. A generic
source-attribution gate is preferable to adding payment-specific wording to
the domain-agnostic connector. The separate questions of read budget, initial
context delivery, and live-endpoint instructions remain open and should be
tested only after source fidelity passes.

### Targeted repair attempt

The Context Dashboard's Issues view had no pending issues; the four earlier
conflict resolutions remained active. Its Instructions view showed that the
monitoring entry was stale relative to the 2026-09-21 owner-draft rule. A
manual instruction scoped to `04-fraud-score-report.md` was added through the
fraud entry's **Rewrite this part** control: keep the undated 08:00–12:00 fraud
audit separate from the dated incident and map the tuning proposal and Q3
report to their respective source files. The page rewrite completed and a
fresh native MCP read confirmed that the audit no longer has an invented date.
However, the numbered citations remain inverted: the unpublished proposal is
marked `[3]`, which opens `13-fraud-quarterly-report.md`; the Q3 report is
marked `[4]`, which points to `09-fraud-tuning-proposal.md`. The instruction was
anchored only to source `04`, so it did not repair this cross-source mapping.

The Dashboard's **Update entries** action then rewrote the one stale monitoring
entry. A fresh MCP read still mentioned the 2026-09-21 owner draft without a
citation to `23-monitoring-owner-draft.md`; its Sources list contained only
`10-retry-dashboard.md`. Thus both citation defects remain after the targeted
rewrites, despite zero pending issues. Do not equate `ready` with passed source
fidelity, and do not use this revision for a headline quality comparison. No
full Knowledge Base rebuild, benchmark run, live-endpoint switch, or connector
code change was made in these repair attempts.

A second, source-scoped instruction explicitly mapped the unpublished tuning
proposal to `09-fraud-tuning-proposal.md` and the Q3 trends to
`13-fraud-quarterly-report.md`. Sanity itself detected that the current fraud
entry contradicted this instruction and offered to rebuild that one page.
After accepting, the native MCP output **still** assigned `[3]` to the proposal
while Sources `[3]` named the quarterly report, and `[4]` to the trends while
Sources `[4]` named the tuning proposal. Worse, its opening paragraph again
dated an 08:00–12:00 fraud-report observation to 2026-09-18 although
`04-fraud-score-report.md` gives no calendar date. This revision therefore
regressed. Stop automatic rewrites and quarantine the experimental KB from
scored comparisons until a source-fidelity gate passes. These defects predate
the Llama's retrieval and answer synthesis; connector prompting alone cannot
turn incorrect generated citations into valid provenance.

A support-ready reproduction, expected behavior, impact, and questions for
Sanity are recorded in
[`sanity-context-source-fidelity-report.md`](sanity-context-source-fidelity-report.md).

## Exploratory post-rebuild benchmark — 2026-09-23

The user requested that benchmarking continue despite the experimental KB's
known source-fidelity defects. This is an exploratory measurement, **not** a
source-validated quality comparison. The run used `kbesKgcIBIO2` after the
targeted page rewrites above, without switching the live endpoint. It paired
38 questions across four arms, one repetition each, on `qwen3:4b-instruct`
with a 5,120-token context window and 90-second per-model-call timeout. The
corpus remained the same 24 primary files; State was queried by the runner.
The terminal watcher displayed each prompt, selected sources, answer, tokens,
and automatic result while the checkpoint advanced. The completed, Git-ignored
artifact is
[`v3-run-2026-09-23T16-18-49-632Z.json`](../../artifacts/sanity-context-benchmark/v3-run-2026-09-23T16-18-49-632Z.json).

| Arm | Strict automatic passes | Prompt tokens, total | Median latency |
| --- | ---: | ---: | ---: |
| `raw-full` | 23/38 | 93,139 | 5.2 s |
| `raw-scarce` | 17/37 valid attempts; one OOM | 41,955 | 7.2 s |
| `sanity-index-visible` | 23/38 | 184,327 | 13.6 s |
| `sanity-full-bounded` | 21/38 | 295,537 | 13.3 s |

The only execution error was `raw-scarce` case D03: Ollama failed allocating
GPU prompt-cache memory (`CUDA out of memory`) before a model response. It is
an operational failure, not a wrong answer. The runner finished all 152 jobs
and no other error was recorded. The Sanity index tied raw full-corpus input
on automatic passes while using about 2.0× as many prompt tokens and 2.6× the
median latency. The bounded full-context arm used about 3.2× the raw-full
prompt tokens and scored two fewer automatic passes. Because the entire small
corpus fits in the raw prompt, this is not yet a test of large-corpus retrieval
efficiency.

The raw-full and index arms agreed on 19 passes and 11 failures; each alone
passed four cases. A targeted review of the eight discordances found that the
strict phrase scorer is not a reliable correctness oracle:

- I06 (`sanity-index-visible`), T01 and T03 (`raw-full`) were marked false
  despite answers that addressed the question and the relevant evidence;
  expected literal phrases were absent or paraphrased.
- D06 (`raw-full`) matched all five required concepts, but the unsafe-pattern
  guard matched the negated sentence "No Delta has been applied" and marked it
  unsafe. This is a concrete scorer false positive.
- I09 (`sanity-index-visible`) repeated a dated 08:00–12:00 fraud-audit claim
  while citing the undated fraud report, and added an overbroad statement that
  no source directly covers the incident window. This demonstrates that a
  retrieved, synthesized KB entry can contaminate the answer even when path
  selection is appropriate.
- Other discordances include overclaims or imperfectly grounded citations in
  one or both arms; do not simply flip every failed strict score to a pass.

No headline winner follows from one run with a flawed KB, one model, a small
corpus, and a literal scorer. State is inlined from a fixed snapshot in the raw
and full-context arms but available as a read tool in the index arm, so the
comparison also does not perfectly isolate evidence retrieval. Before
optimizing connector prompts or declaring
an accuracy gain, repair or explicitly isolate KB source fidelity, fix the
negation bug in the unsafe guard, and manually adjudicate the remaining
discordant cases. No connector code, live endpoint, schema, persistence, MCP
contract, operational skill, UI, or plugin package was changed by this run.

The latest [Sanity Context patterns](https://www.sanity.io/docs/ai/sanity-context-patterns),
[MCP tool reference](https://www.sanity.io/docs/ai/sanity-context-mcp-tools),
and [inline-context guide](https://www.sanity.io/docs/ai/sanity-context-initial-context)
reinforce the following assessment of the current connector:

1. The live `apps/web/lib/sanity/context-mcp.ts` gives the Llama a
   domain-agnostic, validated enum of entry keys, but caps the read at five
   entries and one call. Sanity's native Knowledge Base read accepts 1–20
   paths, recommends batching plausible entries, and permits multi-step tool
   use. The cap may prevent a recovery read on multi-source questions. Test a
   5-path/one-read policy against 20-path/one-read and a bounded second read;
   do not remove bounds without a cost and grounding check.
2. The live route fetches `initial_context` through the MCP tool at session
   start. This preserves Sanity's full outline and is semantically sound, but
   the documented `/initial-context` HTTP route can avoid a tool round trip.
   Any cache must be invalidated after a Knowledge Base rebuild. The benchmark
   must use the same orientation text as production before comparison.
3. The live endpoint still serves the original Knowledge Base, which imported
   an evaluation-bearing `README.md` and has a separate unresolved issue. The
   clean experimental base cannot be considered the live connector's quality
   until its content is audited and the endpoint is intentionally switched.
   The original base's Dashboard showed zero actionable Pending, Resolved, or
   Dismissed items even though its CLI and sidebar reported one open issue.
   Sanity documents that not every issue kind is surfaced for review; do not
   dismiss or claim resolution of this discrepancy from the empty list alone.
4. `apps/web/app/api/local-chat/route.ts` prepends several retrieval and
   response rules to Sanity's own orientation, while the MCP endpoint also
   carries instructions. Audit for contradictions and keep the Knowledge Base
   purpose, source-anchored instructions, endpoint retrieval guidance, and
   application behavior distinct. In particular, evidence-backed inference
   should be allowed while unsupported certainty and claims of applied Delta
   remain forbidden.
   The live endpoint currently says "Do not propose or perform state changes."
   That is suitable as a restriction on the **Context evidence tool**, but
   overly broad as a session-wide instruction for a Trama agent that may draft
   an audited Delta through a separate host tool. Re-scope the wording before
   moving the clean Knowledge Base into the live endpoint; do not change the
   endpoint mid-benchmark.
5. The connector keeps the organization token server-side and State is owned
   by Trama; both align with Sanity's multi-backend ownership guidance. The
   next benchmark should trace the exact orientation, entry responses,
   citations, selected paths, and State snapshot for every arm so a failure
   can be attributed to build synthesis, retrieval, inference, or scoring.

## Proposed sequence

1. Snapshot and inspect the current Knowledge Base: purpose, sources,
   instructions, outline, entries, citations, build status, and issues. Verify
   the specific citation discrepancy and determine whether evaluation documents
   were included as sources.
2. Build a clean POC Knowledge Base from primary evidence only, with a purpose
   stating the investigation job but no expected conclusions. Keep evaluation
   questions and answer keys outside every build source. Review its generated
   outline and citations before connecting it to the runner.
3. Align the MCP endpoint instructions with evidence-backed inference and
   uncertainty. Keep application behavior rules short and separate. Test in a
   draft endpoint or runtime override before changing the live endpoint.
4. Add trace capture: exact initial context, exact read response, selected
   paths, source citations, per-call prompt/completion tokens, context-window
   utilization, and separate orientation/read/inference latency. Protect
   tokens and sensitive evidence in artifacts.
5. Run paired ablations with the same questions, clean Knowledge Base, model,
   context window, and scorer: full initial context versus reconstructed index;
   native 1–20-path batching versus the five-path wrapper; one read versus a
   bounded recovery read; raw scarce with rotated source order. Keep the
   authoritative State treatment equal across arms.
6. Manually audit discordant answers and citation correctness before changing
   prompts or declaring a winner. Repeated runs and an out-of-domain case set
   should test stability and the explicit evidence-gap behavior.

## Layer impact

This experiment changes the benchmark runner, terminal watcher, Git ignore
rules for source-bearing trace artifacts, and these notes. It creates a
separate remote experimental Knowledge Base but does not mutate the original
Knowledge Base, live adapter, or live MCP endpoint. Domain terms, schemas,
persistence, core/application services, MCP contracts, operational skill, UI,
and plugin packaging were reviewed as unaffected. No migration or plugin
reinstall is required. The ignored local `.env.local` is already identical to
the supplied Documents copy; credentials are not written to artifacts. Any
future adapter or MCP change must be validated across those layers under the
Trama development workflow.
