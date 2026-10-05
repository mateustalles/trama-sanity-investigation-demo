# Native knowledge-base search versus local keyword retrieval

This pilot tests two independent ways to find investigation context, then
replays each retrieved packet to two reasoning models. It does not change
the live demo, rebuild a knowledge base, or publish new benchmark claims.

The experiment described here completed on October 4, 2026. The read-only
demo now uses the same native-search approach, but is a separate interactive
application; its responses are not substituted for these frozen benchmark
answers.

## Frozen experiment

- 40 existing cases, two retrieval arms, two models, one repetition: 160 answers.
- Models: Qwen `qwen3:4b-instruct` locally and OpenAI `gpt-6-sol`.
- Corpus: 145 synthetic documents, validated against the previous Data Lake
  audit by stable source identity and body hash. No personal Tramas.
- Queries: manually declared keywords in `scripts/fixtures/sanity-kb-search-queries.mjs`.
  The same query goes to both arms. No model generates query keywords, no
  answer key is used by the query fixture, and queries are not tuned after results.
- Contract: the existing v4.5 structured rubric. This is the complete existing
  suite, including factual, keyword-explicit and State cases, not an open-only suite.

## Two independent arms

`sanity-kb-search` calls the native MCP `knowledge_base_search` tool against
the existing ready knowledge base `kbkpWkNaMVN6`, with `return: "entries"`
and `limit: 5`. The native tool currently describes keyword/BM25 search,
not semantic similarity. Its complete returned text is provided to the
reasoning model unchanged. Trama does not rerank it, discard referenced
sources, fetch originals, cap its characters, or fall back to another search.
Empty content and tool errors are explicit failures.

`keyword-local` uses MiniSearch 7.2.0's stock BM25+ ranking over the titles
and bodies of all 145 raw documents. Search uses OR terms, no fuzzy matching
and no prefix expansion. The top five hits supply their complete raw bodies.
This arm never calls Sanity; it operates entirely on the verified local corpus.

Five KB entries are not five raw documents: an entry may refer to many originals.
Therefore this compares retrieval plus context representation, not equal-sized
evidence packets. Report context size and tokens alongside accuracy. Generated
KB statements are not proof that the underlying original supports every claim.

## State and grading

The seven State-dependent cases receive the same frozen application State in
both arms. These cases do not establish that either retriever discovered State.

An answer passes only when decision, required atomic facts and structured
format all pass, with no execution error. Direct quotations and source citations
are not required for this rubric. Each answer records expected versus actual
decision, individual fact checks, format validity and the grader's rationale.
Human review remains necessary for semantic correctness and rubric disagreements.

### Preserved results and grading audit

The original v4.5 final artifact recorded the following totals. PASS means
decision, required facts and format all passed without an execution error.

| Model and arm | Original PASS | Decision | Facts | Format | Execution errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| OpenAI GPT-6 Sol, KB search | 37/40 | 38/40 | 39/40 | 40/40 | 0 |
| OpenAI GPT-6 Sol, local keyword | 32/40 | 35/40 | 35/40 | 40/40 | 0 |
| Qwen 4B, KB search | 30/40 | 30/40 | 36/40 | 36/40 | 4 |
| Qwen 4B, local keyword | 27/40 | 29/40 | 36/40 | 40/40 | 0 |

Four Qwen KB answers hit the output-token limit; these remain failures, not
retrieval errors or evidence of an out-of-memory event. A subsequent offline
audit accepts only equivalent UTC clock formatting in declared time fields.
It promoted R01 in both OpenAI arms and R06 in the OpenAI keyword arm, yielding
OpenAI KB 38/40 versus keyword 34/40; Qwen remains 30/40 versus 27/40. It made
no new model calls and did not overwrite the original final or checkpoint.
See [the audit scope and provenance](kb-search-grading-audit.md).

| Model and arm | Recorded input tokens | Recorded output tokens | Mean inference latency |
| --- | ---: | ---: | ---: |
| OpenAI GPT-6 Sol, KB search | 163,679 | 6,215 | 3.44 s |
| OpenAI GPT-6 Sol, local keyword | 43,225 | 5,757 | 2.77 s |
| Qwen 4B, KB search | 196,629 | 32,518 | 28.59 s |
| Qwen 4B, local keyword | 50,355 | 13,138 | 10.05 s |

These are aggregate model-reported tokens over 40 answers and mean inference
latencies, not retrieval latency or equal evidence budgets. KB generated
context used roughly four times the input tokens. The build imported 145
documents, but audited entries reference 82 distinct originals; its report
listed 63 discarded sources and one issue. Do not equate archive count with
complete build coverage. One repetition, one synthetic incident and seven
shared-State cases limit what the apparent accuracy gain establishes.

## Context safety and reproducibility

Preparation saves the queries, corpus identity, native tool schema, orientation,
full MCP responses and 80 frozen context packets. Both models receive the same
packet for a given case and arm; retrieval is not repeated between models.

Qwen runs sequentially with a 16,384-token context, full GPU offload, batch 64,
and at most 2,048 output tokens. A pinned upstream tokenizer checks the complete
message contents before inference. Overflow, suspected input truncation and
output truncation are failures; they never cause silent input shortening.
Actual model-reported token usage is recorded separately from the preflight count.

Each checkpoint preserves full prompts, provider responses, answers, errors,
input hashes and per-answer rationale. Inference latency is wall-clock time
including local preflight work; retrieval latency is recorded separately and
paid once per frozen packet. OpenAI output tokens include reasoning-token usage
where reported by the provider. One repetition does not measure variance.

## Running and inspecting

Use `scripts/run-kb-search-model-comparison.mjs prepare` with explicit output,
local corpus, source-audit and State-artifact paths. Then run the script with
`run --out=THE_PREPARED_DIRECTORY`. Supply credentials through process environment,
never through repository files or logged arguments. Preparation refuses to replace
an existing manifest; inference resumes only checkpoints matching its frozen identity.
Do not start a second process for an active run.

The output directory contains `manifest.json`, `packets.json`, `checkpoint.json`
and, at completion, `final.json`. The stdout log prints every answer and its
PASS/FAIL explanation as it completes. Results belong in the artifact directory,
not in the public source repository by default.

Offline tests cover the exact 160-job matrix, fixed queries, local-only retrieval,
unchanged full MCP text, no-fallback errors, shared State, explicit execution
failures and full-message token counting. Live results are an experiment, not
a deterministic unit-test guarantee.

## Planned follow-up: same words, different incident

The [hard-negative benchmark plan](kb-keyword-distractor-benchmark-plan.md)
adds realistic records sharing query vocabulary but describing other events,
scopes or evidentiary roles. It compares changes from 145 to 175 synthetic
records in isolated experimental KBs, with the same queries and both models.
It is not yet executed and does not alter the results above or the active demo.
