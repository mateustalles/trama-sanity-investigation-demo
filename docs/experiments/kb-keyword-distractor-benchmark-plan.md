# Same words, different incident: a hard-negative retrieval benchmark

Status: planned, not executed. No documents have been ingested, no Knowledge
Base has been rebuilt, and no new result is claimed by this document.

## Question

Does Sanity's built Knowledge Base help preserve incident scope when irrelevant
records share the vocabulary of an investigation question?

Our hypothesis is that organized KB entries can help separate events better
than ranking raw documents by lexical overlap alone. The opposite result is
possible: the build can conflate events, discard relevant sources, or retrieve
an entry combining unrelated records. This experiment must expose those failures
as well as successes.

This is **not** a semantic-vector-search versus keyword-search comparison.
The native `knowledge_base_search` schema captured in our completed experiment
described BM25 over generated entries. The local baseline uses MiniSearch's
BM25+ over raw titles and bodies. We are comparing retrieval plus representation.
Before running, capture the actual MCP `tools/list` schema again and fail
explicitly if the required native search tool or contract is unavailable.

Sanity describes KBs as pre-built, organized entries with citations, rather
than raw documents read and reconciled for each query. That motivates this
hypothesis; it does not guarantee success:
[Knowledge Bases](https://www.sanity.io/docs/ai/sanity-context-knowledge-bases).

## Corpus

Preserve the verified 145-document corpus: 24 primary records and 121 existing
distractors. Add **30 new synthetic hard negatives**, for 175 documents total,
in an isolated experimental dataset/KB. Do not mutate the demo's active corpus,
KB `kbkpWkNaMVN6`, or endpoint. Preserve source identities and body hashes.

Use ten records in each category:

1. **Different incident:** a checkout deployment, timeout or provider-latency
   observation on another date. Some should share the 10:00–10:15 UTC clock
   interval; the date or case must still distinguish them.
2. **Different scope:** the same date and payment vocabulary, but another
   provider, environment, service or investigation. For example, a staging
   checkout timeout observation must not establish production behavior.
3. **Different evidentiary role:** a runbook, simulation or future proposal
   discussing release timeouts, latency, postal validation or fraud. It must
   not become an observation of the September 18 incident.

Use realistic prose, comparable lengths and plausible titles. Dates, entities
and scope must appear in the original body available to both arms, not only
in metadata accessible to Sanity. Do not label indexed material "distractor,"
"irrelevant," "correct source" or include benchmark expected answers.
Do not stuff repeated keywords just to sabotage the baseline. Deliberate
keyword-stuffing, if tested later, belongs to a separately labeled adversarial
condition, not this primary result.

Write private per-question relevance annotations before retrieval: directly
relevant, useful counterevidence/background, or unrelated. An older incident
can be relevant to a question asking us to distinguish incidents; sharing a
different date does not automatically make a document irrelevant. Do not send
annotations to Sanity or either reasoning model.

## Controlled comparison

Use two corpus conditions: the original 145 and the expanded 175. Build
isolated baseline and treatment KBs with the same purpose, source projection
and configuration. Freeze each build and audit its citations, discarded
sources, issues and source coverage before querying. Keep the original
published experiment untouched; new builds are not identical to the old build.

For each condition:

- Use the existing 40 questions, identical predeclared query terms and frozen
  structured rubric. Do not tune queries after seeing rankings.
- Keep the two independent arms: native KB Search versus local MiniSearch.
  The baseline never calls Sanity. The Sanity arm has no local fallback,
  host reranking, source rejection or answer-key-driven filtering.
- Keep top five in each arm, full returned text and the same inference
  settings as the original comparison. Five KB entries and five raw records
  are different units, not equal evidence budgets.
- Retrieve each case/arm packet once, preserve the entire response, and
  replay that packet to GPT-6 Sol and Qwen 4B. Same packet for both models.
- Run inference sequentially; record context overflow, output truncation,
  timeouts and tool errors separately. Do not silently trim context.

Two conditions × 40 questions × two arms × two models = **320 answers** for
one repetition. This is an exploratory run; it does not establish variance.
Predeclare any additional repeats before running, rather than rerunning only
unfavorable cases until a preferred result appears.

The seven State-dependent questions still receive identical frozen State.
Report them separately: shared State is not a retrieval achievement. Include
factual and open/inferential questions rather than selecting only the examples
where KB Search already won. X01 remains a diagnostic, not the whole result.

## What to measure

Report baseline-to-treatment changes for both arms, not just treatment totals:

- Relevant-source recall and unrelated-source contamination per question.
  For the raw arm, report raw-document precision/recall at five. For KB
  entries, report relevant entry content and cited-source coverage separately;
  do not call a citation alone proof of support or equate the two denominators.
- Whether generated entries preserve dates, providers and scope, or blend
  different incidents into one claim. Record mixed entries explicitly.
- Structured PASS, decision, atomic facts, format, and execution errors.
- Wrong-event attribution: treating a staging, older or unrelated observation
  as evidence for the production incident. Relevance is not an automatic
  FAIL: distinguish harmless background from a false factual attribution.
- Retrieval latency, inference latency, input/output tokens and complete
  per-response grading rationale. Preserve raw scores and label any later
  rubric audit as a separate artifact.

For representative failures and successes, inspect the original source,
full retrieved packet and model answer. A retriever can return useful
counterevidence that a model mishandles; a correct answer can also survive
a contaminated packet. These are different outcomes.

## Execution gates

1. Implement an additive, idempotent fixture and separate experiment identity.
   The existing runner hardcodes the 145-source audit and active KB ID; it
   cannot run this protocol unchanged. Never weaken its old resume guards.
2. Add offline tests for corpus identity, unchanged primary sources, query
   parity, no fallback and refusal to mix builds/checkpoints. Run tests,
   typecheck and build with a dedicated read-only validation monitor.
3. Ingest only into the experimental scope, verify 175 sources and hashes,
   and build the isolated KBs. Wait for terminal builds; record coverage/issues.
4. Freeze manifests, native tool schemas, retrieval packets and annotations.
   Do not change corpora, queries, rubrics or builds during measurement.
5. Start one benchmark process, spawn a read-only monitor and preserve logs,
   checkpoint, final artifact and per-answer rationale.
6. Audit source support and publish the full comparison, including any cases
   where keyword retrieval does better. No live experiment was started while
   drafting this plan.

## Possible addition to Path One

Only after measurement, add a separately dated **hard-negative follow-up** to
the article, without replacing the original results. State corpus size, the
two retrieval methods, token costs, build coverage, model settings and repeats.

An appropriate claim, if supported, would be:
"On this synthetic incident, built KB context reduced wrong-event attribution
when competing records shared the question's vocabulary."

Do not claim that keyword search necessarily fails, that KB Search necessarily
understands relevance, or that this establishes general superiority. If both
arms fail or KB organization worsens attribution, report that result instead.
The DEV post itself is not automatically edited by this plan.

Related: [original comparison](sanity-kb-search-model-comparison.md),
[grading audit](kb-search-grading-audit.md), [offline testing](../testing.md).
