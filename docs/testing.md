# How we test the investigation agent

The question is not just “Did the model produce a convincing answer?” We also
need to know whether it received the right evidence, followed the contract,
and correctly expressed uncertainty.

## Three different checks

| Check | What it can establish | What it cannot establish |
| --- | --- | --- |
| Offline unit harness | Known inputs follow the expected code paths and safeguards | A real model will reason correctly |
| Live benchmark | Measured behavior of a particular model, corpus, prompt, and retrieval strategy | Universal reliability or deterministic repeatability |
| Manual audit | Whether an original actually supports a particular claim | Complete correctness across unreviewed answers |

Passing unit tests is not a model accuracy score.

On October 4, 2026, the current validation passed 158 application tests and
75 Node script tests (233 total), plus workspace typecheck. Windows and Linux
production builds also passed. Live smoke and public boundary checks are
recorded separately in [Demo 1 readiness](experiments/sanity-demo-1-readiness.md);
none of these substitutes for manual answer review or a signed-in judge flow.

## Offline AI harness

```powershell
pnpm install --frozen-lockfile
pnpm test:ai
```

This command runs the Node script unit suites under `__test__/scripts/`.
`pnpm test` runs them too, after the application TypeScript tests.
No provider key is required. A preloaded guard disables global `fetch`, so
accidental live provider requests fail immediately instead of spending quota.
Mocks passed through `fetchImpl` or fake adapters remain available.
The guard is not a general network sandbox.

The harness supplies fixed synthetic originals, candidate lists, model JSON,
and mocked API responses. These fixtures make outcomes reproducible without
calling Sanity, OpenAI, or Ollama. Source IDs and hashes are generated from the
fixture originals, not guessed by a live model.

Examples of existing assertions:

- A multifacet question triggers the expected retrieval plan.
- Queries retain the host-owned Workspace and case filters.
- Facet fusion preserves coverage and deduplicates sources.
- Original bodies pass identity, scope, hash, and revision checks.
- Missing originals produce an explicit evidence gap.
- Source-count and character limits omit whole records rather than silently
  clipping them.
- A tampered original or invented citation is rejected.
- Malformed model output fails the structured contract.
- Frozen input comparisons keep model inputs aligned and reject corpus drift.
- The structured benchmark grader checks expected decisions and facts.

The demo pipeline fixtures currently provide model answers in code. They
test orchestration and validation, not independent answer-generation skill.
Some metadata such as duration or ingestion time varies; assertions focus on
stable behavior rather than byte-for-byte equality of every result field.

### Native KB demo coverage

The current demo is covered by
`__test__/scripts/sanity-kb-native-demo.test.mjs`. Fixed adapters assert that
the host makes one authorized native `knowledge_base_search` call, requests
five entries, forwards its full text unchanged and exposes it as generated
context. Cases cover the six prewritten suggested-query mappings, verbatim
free-form questions, no answer or fallback after empty/failed retrieval,
required answer fields, invalid navigation references, server-only credentials
and the read-only presentation boundary.

Those tests do not establish that a generated KB entry accurately represents
its originals. The historical GROQ/original-source fixtures below test a
different pipeline that remains available for research.

### Adding a case

For the current demo, start with `__test__/scripts/sanity-kb-native-demo.test.mjs`
and inject a fixed `searchKnowledgeBase` result plus `generateJson` response.
Assert the query, complete delivered text and failure behavior without a live
provider call. Include a negative case, not just a plausible answer.

For the historical original-source pipeline, start with
`__test__/scripts/sanity-demo-agent.test.mjs`. Define a small
synthetic evidence set and inject `groqRows` and `generateJson` adapters.
State the expected sources, behavior, and failure mode explicitly, then assert
those properties. Cover a successful path and a negative control—for example,
an unrelated case, a missing source, an invented ID, or an invalid JSON shape.
Do not add production credentials, private records, or a call to a paid API.

## Live benchmarks are a separate evaluation

Live runs use real retrieval and model calls. They may cost money and are not
part of `pnpm test` or `pnpm test:ai`. Research runners and previous methodology
are documented under `docs/experiments/`; local run artifacts are not published.

The [Knowledge Base navigation pilot](experiments/sanity-kb-navigation-pilot.md)
records a separate KB-index-to-originals experiment, including its source-budget
gap. Its five contract-valid answers are not five automatic semantic passes.

A useful future evaluation record should retain the case question, corpus
revision, retrieval inputs, delivered sources, prompt/contract version,
model/version, answer, expected structured facts, grader explanation,
token usage, latency, and manual reviewer feedback. Replay the same source
packet when comparing reasoning models; hold corpus, scope, and retrieval
budget fixed when comparing retrieval methods.

The original native comparison used grader v4.5. A narrow, host-only UTC-time
equivalence correction is recorded in
[the separate grading audit](experiments/kb-search-grading-audit.md). The offline
replay preserved the source run and promoted exactly three answers, without
any retrieval or inference calls. It is a correction to evaluation, not an
improvement in the model. Other enums, actions, timestamps and string facts
remain strict; execution errors cannot become a PASS through the replay.

Repeat cases to measure variation. Temperature settings alone do not make a
remote model deterministic. Report missing evidence separately from incorrect
reasoning or invalid format; don't collapse them into an unexplained FAIL.
An optional model-based grader is advisory, not a replacement for explicit
facts and human review.

## Manual audit still matters

The [native KB search comparison](experiments/sanity-kb-search-model-comparison.md)
documents the frozen 40-case, two-arm, two-model experiment and its limitations.

Read the original behind each important claim. Ask whether it concerns the
right incident and date, whether it supports the claim, and whether a proposed
change is being confused with an applied change. Identity checks only show
that the host retrieved the intended record; they don't prove the model's
interpretation. Record disagreements with the rubric rather than silently
rewriting historical scores.
