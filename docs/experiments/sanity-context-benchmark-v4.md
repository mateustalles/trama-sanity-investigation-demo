# Structured Sanity Context benchmark v4

## Purpose and comparability

Version 4 replaces v3 substring scoring with a structured final answer. It keeps the 38 original questions, adds two multi-source synthesis cases (`X01`, `X02`), and can run the same case set against raw and Sanity retrieval arms. The old v3 artifacts remain immutable. **Do not compare a v4 PASS rate directly with a v3 lexical PASS rate**: both the answer contract and score have changed.

Run `pnpm benchmark:sanity-context:v4` (or set `TRAMA_BENCHMARK_SCORING=structured-v4` for the historical runner). The output is a separate `v4-run-*.json` artifact and `v4-checkpoint-*.json`; checkpoints cannot be resumed across scoring versions or contract revisions. The v4.1 pilot and aborted early full run are diagnostics, not representative accuracy estimates. The 600-result full artifact used v4.3. Future runs use v4.5 and only three arms: `sanity-groq-only`, `raw-full`, and `raw-scarce`. The GROQ arm now requests up to ten candidates and reads up to ten originals, subject to the 12,000-character whole-source budget; record omissions separately.

## Model-facing contract

Every arm receives the same case-specific JSON contract, three to five literal decision alternatives, required fact keys, and (where applicable) an action enum. The model also receives an answer field and may optionally provide an evidence array for manual audit. The host-only correct decision and expected fact values are never included in the prompt. Numeric fields may be emitted as JSON numbers or strictly numeric strings. Original corpus documents do not override current State.

The final answer must be a single JSON object, not a fenced code block. The runner does not silently repair malformed JSON or issue a second model call for formatting. Format failures, wrong decisions, wrong facts, missing evidence, and execution errors are recorded separately.

## Automatic score and its limits

From v4.5, `strictPass` (the automatic PASS) requires only the correct literal decision (and action where requested) and every required atomic fact in parseable JSON. Citation validity, answer prose, and format completeness are diagnostics only; they cannot flip a correct decision-and-facts result to FAIL. Earlier v4 artifacts retain their original composite `strictPass`, and the workbench derives an additional answer-only count from their decision/fact flags. Do not treat a changed PASS rate across contract revisions as a model improvement. Literal phrase groups from v3 do not affect v4.

This is more deterministic but **not a semantic oracle**. A model can choose the right enum while contradicting itself in prose, or cite a delivered document that does not support its claim. The manual workbench must review those separately. A wrong enum despite correct prose is visible as a contract-consistency error rather than disguised by substring matching. The revised contract removed overlapping qualifier labels after the first smoke test exposed synonymous alternatives. An early full run exposed an ambiguous R04 choice and rejection of a legitimate retrieved original document ID; both were fixed before restarting, with the old checkpoint preserved but never resumed.

`X01` combines deployment, provider latency, postal sample, and fraud audit in one mechanism-and-limit question. `X02` requires separating a current applied monitoring Delta in authoritative State from a similarly named older catalog-cache artifact in another Case. These target synthesis and scope discrimination beyond a single choice.

## Rubric audit before the next full run

The v4.3 full artifact shows that citations were a separate failure mode, not necessarily a wrong answer: among the three retained arms, answer-only decision-and-fact counts were GROQ 101/120, raw-full 103/120, and raw-scarce 83/120; the old composite PASS counts were 92/120, 91/120, and 79/120 respectively. These are **post-hoc descriptive counts, not a v4.5 run**. S03 is a clear example: GROQ and raw-full had the correct `applied` choice and `applied_at` in all three repetitions, but failed the old citation condition.

Other evaluation issues remain. In X01, raw-full repeatedly gave the expected mechanism and all four numerical facts in prose/JSON yet chose `unknown`. In R06, the answer text said no fraud rule was published while its enum said `rule_published`: this is a model output contradiction, not evidence that the gold enum is wrong. In D02, the model drafted the requested routing question but chose `none`, possibly conflating the decision enum with the separate `action: none` field. S02's "latest Delta" wording also merits manual review of ordering and scope. Do not silently reclassify these as PASS: record a manual label for prose correctness and enum/prose consistency, then revise ambiguous choices or questions in a new contract revision. In particular, test whether splitting compound decisions into narrow independently scored axes reduces `unknown` overuse without leaking the gold answer. Keep the raw prompt, structured output, source pack, and token/latency trace for every such judgment.

The v4.5 focused pilot (`v4-run-2026-09-25T19-39-49-742Z.json`) ran X01 and S03 three times in each retained arm. S03 passed 3/3 in all three arms. X01 passed 0/3 in all three: raw-full had all atomic facts correct but chose `unknown`; GROQ retrieved ten verified originals with no character-budget omissions, including fraud but not `03-postal-code-sample.md`, so its postal fact was wrong. This is a retrieval-*coverage* failure, not a top-five pack truncation. The next retrieval experiment should test topic-agnostic facet coverage (multiple query facets and diversity selection) against a single top-K semantic query. Keep the same ten-original and character budgets so the effect is attributable to candidate selection. The X01 choice should be split into independently labeled mechanism and certainty axes in a separately versioned rubric experiment; do not patch its gold after seeing these outputs.

## Safeguards

- Same output contract and model settings across arms within a run.
- Corpus hash, pilot source revisions, KB ID, State snapshot, model, token counts, tool traces, and arm identity retained in the artifact.
- Live State fixture is checked before State-case runs; if its revision, applied Delta count, or latest `appliedAt` changes, the run stops rather than scoring against stale gold.
- V3 and v4 artifacts are selectable separately in the workbench. Manual reviews are keyed by artifact, case, arm, and repetition.
- Evaluate decision accuracy, fact accuracy, evidence validity, token cost, latency, and JSON compliance separately. A failed evidence citation cannot fail the v4.5 automatic score; a correct enum is not necessarily well grounded.
- In the current 24-file corpus, the 12,000-character raw-bounded budget includes the whole corpus, so raw-full and raw-bounded are near-duplicate baselines rather than independent retrieval conditions. Raw-scarce is the distinct restricted-input baseline.
