# Frozen-evidence model-capacity comparison

Status: 28 September 2026 diagnostic. This is a **response-model** comparison,
not a new Sanity retrieval test or a production integration.

## Question and design

Can a smaller local model and a stronger OpenAI API model interpret the same
original evidence selected by Sanity Context? The source is the completed
v4.5, 145-document synthetic pilot artifact
`artifacts/sanity-context-benchmark/v4-run-2026-09-26T02-28-29-960Z.json`
(SHA-256 `e76d9612be592bb319e9d5fce34933b024d7c886223f513b283360c7a34d8908`).
No Content Lake or MCP calls are made by the replay. Each model receives the
*exact* stored system/user messages for a case and retrieval arm, including
the same bounded, verified original-source packet. This isolates answering
from source selection. Both original retrieval arms remain visible:
`sanity-groq-only` (dataset embeddings) and `sanity-keyword-only` (BM25).

The twelve case IDs were frozen in the runner before the new calls:
`R02,R03,R05,R06,I01,I02,I03,I04,T02,T04,D06,X01`. They cover factual
retrieval, inference, temporal discrimination, an operational decision, and
multi-source synthesis. State-dependent questions are excluded because their
answers do not test evidence retrieval. The sample is diagnostic, selected
from an already inspected synthetic benchmark; it is not an unbiased
generalization estimate. One repetition does not measure variance.

`scripts/compare-sanity-model-capacity.mjs` validates the source artifact's
corpus and rubric identity, saves each answer and its exact input hash to a
resumable checkpoint, and applies the unchanged v4.5 structured scorer. It
reports decision, required facts, JSON format, tokens, and inference-only
latency separately. Source IDs and revisions were frozen by the prior run;
they cannot improve when a different answer model is replayed. Model-family
token counts and latency are not intrinsically comparable measures of
computational efficiency.

The local call uses `think:false`, temperature zero, and `num_ctx=4096`, as in
the original Qwen3 4B run. The OpenAI branch uses an explicitly named API
model, low reasoning effort, 2048 maximum output tokens, and `store:false`.
It deliberately does *not* force the API's JSON Schema output, because the
local benchmark relied on a prompt-only JSON contract; format adherence must
remain an observed metric. This cross-provider comparison is still diagnostic,
not a perfectly matched sampling experiment.

## First local result

The Qwen3 1.7B model was pulled from Ollama and run on all 24 frozen inputs.
Artifact: `artifacts/sanity-context-benchmark/model-capacity-qwen3-1.7b.json`.
It completed without execution errors or empty answers.

| Answer model / frozen retrieval arm | Structured PASS | Decision | Facts | Format | Mean inference latency |
| --- | ---: | ---: | ---: | ---: | ---: |
| Qwen3 1.7B / semantic | 6/12 | 8/12 | 9/12 | 12/12 | 6.65 s |
| Qwen3 1.7B / keyword | 7/12 | 8/12 | 11/12 | 12/12 | 6.75 s |
| Original Qwen3 4B Instruct / semantic | 7/12 | 7/12 | 11/12 | 12/12 | 13.49 s |
| Original Qwen3 4B Instruct / keyword | 7/12 | 7/12 | 12/12 | 12/12 | 14.08 s |
| GPT-6 Sol (low reasoning) / semantic | 9/12 | 11/12 | 10/12 | 12/12 | 5.43 s |
| GPT-6 Sol (low reasoning) / keyword | 12/12 | 12/12 | 12/12 | 12/12 | 5.23 s |

The 4B rows are selected from the prior complete 145-document artifact, not
a new contemporaneous run. Different model variants and one repetition limit
any claim that parameter count alone caused a difference. The 1.7B model's
R02 answer contains the correct 10→4-second values but selects
`timeout_increased`, a clear answer-model decision error despite available
facts. On X01, its semantic arm selects the expected qualified mechanism but
misses the postal count; the keyword arm has the postal count but picks an
incorrect fraud conclusion. These observations require manual source-support
audit before being called factual accuracy rates.

## OpenAI result and manual triage

The OpenAI arm completed 24/24 calls with no API or format errors. Artifact:
`artifacts/sanity-context-benchmark/model-capacity-gpt-6-sol.json`.
The user-provided key was read from the original application's `.env.local`;
its nonstandard `OPEN_API_KEY` name was mapped to `OPENAI_API_KEY` in the one
process only. Neither the key nor a copy of the env file was saved in the
worktree or artifact. Only the synthetic corpus was sent to the API.

The automatic semantic-arm 9/12 includes one clear *scorer false negative*:
for I02, the model gave the correct decision, mechanism, and `deploy_utc` as
`09:58 UTC`, but v4.5 requires the exact string `09:58`. A manual
time-normalized count would be 10/12; the immutable automatic score remains
9/12. Do not silently patch the existing benchmark rubric or relabel old
artifacts. A later contract revision should normalize time-zone suffixes in
time fields and rerun affected cases.

The other two semantic misses are substantive source-packet limitations:

- D06's semantic packet contained fraud drafts and a later release follow-up,
  but none of the four primary originals needed to report the qualified
  Provider A + timeout hypothesis with postal/fraud counterevidence. The
  model chose `unknown`, a defensible abstention on that packet, whereas the
  keyword packet contained the deployment, latency, postal, and fraud records.
- X01's semantic packet contained the deployment and Provider A latency
  originals but not the postal sample or fraud audit. GPT-6 Sol chose the
  expected qualified mechanism but explicitly reported the postal count as
  unavailable. The keyword packet included all four originals; its full
  structured output passed and its prose preserved the uncertainty.

Thus the stronger model improved use of *available* evidence but did not
invent a missing source. On these twelve previously inspected synthetic cases,
keyword retrieval outperformed the current single-query semantic ranking
for the stronger model. This is not evidence that keyword search wins in other
corpora, nor that Sanity Context's structured scope/provenance lacks value.
It does mean the contest submission must not claim generic semantic-search
superiority from this experiment. Present the read-only Context MCP flow,
structured scope and source identity, exact-original verification, and
qualified answer; show both retrieval successes and limitations honestly.

## Use in the contest

The comparison cannot show that semantic retrieval beats keyword search just
because a stronger model scores higher: both retrieval arms must be compared
*within* each model, and source coverage must be assessed independently from
answer quality. Conversely, model accuracy cannot repair an original that
Sanity did not retrieve. This diagnostic appendix should not delay the main
read-only agent demo or be presented as a multi-domain result.

## Faceted 40-case replay (28 September 2026)

The completed `sanity-faceted-groq` answer benchmark is preserved unchanged at
`artifacts/sanity-context-benchmark/v4-run-2026-09-28T18-16-20-587Z.json`
(SHA-256 `fbcb38f448505a016109663115e626dff83fa6d4b62697d40049891414090692`).
The replay runner now accepts an explicit source artifact, arm, and case set,
while retaining its previous twelve-case/two-arm defaults and outputs. This
round replays the exact stored system/user messages for all 40 cases in the
faceted arm. State-dependent questions retain their frozen State snapshot and
are scored with `stateAvailable`; no Sanity retrieval, dataset mutation, or
new State read occurs. Every model sees identical evidence and the unchanged
v4.5 prompt-only JSON contract.

The comparison targets the original `qwen3:4b-instruct` run, local
`qwen3:1.7b` with `think:false`, temperature zero and `num_ctx=4096`, and API
`gpt-6-sol` with low reasoning effort, at most 2,048 output tokens and
`store:false`. Model token counts and latencies are reported, but are not
intrinsically comparable across providers. The 4B's retrieval-planning and
selector costs are recorded in its original run; replay latency measures only
the final answer call and must not be called end-to-end retrieval latency.
Only synthetic benchmark evidence is sent to the OpenAI API. The API key stays
in the original application environment file and is mapped to the standard
variable only in the testing process; it is never saved in artifacts.

Both new replays completed 40/40 frozen faceted inputs, with the same source
hash as the preserved 4B artifact and zero call errors. Their separate
artifacts are
`artifacts/sanity-context-benchmark/model-capacity-faceted-qwen3-1.7b-40-gpu20-cap2048.json`
and `artifacts/sanity-context-benchmark/model-capacity-faceted-gpt-6-sol-40.json`.

| Answer model | Structured PASS | Decision | Facts | Format | Mean prompt + completion tokens | Mean answer-call latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Qwen3 1.7B | 19/40 | 22/40 | 34/40 | 38/40 | 2,833 + 394 | 25.07 s |
| Original Qwen3 4B Instruct | 30/40 | 31/40 | 39/40 | 40/40 | 2,825 + 514 | 15.74 s |
| GPT-6 Sol, low reasoning | 37/40 | 38/40 | 39/40 | 40/40 | 2,275 + 159 | 3.56 s |

The 1.7B model needed a separate stable configuration: 20 layers on GPU,
`num_batch=128`, and `num_predict=2048` with a 300-second per-call timeout.
Its initial default-GPU attempt stalled after 18/40 and later hit CUDA OOM;
that partial checkpoint is preserved, not mixed into this table. In the
completed run, T01 looped through nested JSON and was truncated at exactly
2,048 output tokens, yielding invalid JSON. D04 put the required `action`
inside `facts` instead of at the top level, so it failed format despite
choosing the right decision string. X01 included all four expected numbers
and a qualified explanation but selected `all_causes_ruled_out`, the same
contradictory enum as the 4B baseline. These are answer/contract failures,
not evidence that the Sanity retrieval missed X01's four anchor sources.

These are one-repetition answer-only replays. Tokenizers, local GPU/CPU
execution, the 1.7B-specific memory settings, and a remote API make
cross-provider token counts and latency non-equivalent measures. The 4B
latency row uses its original answer-call trace, not its full retrieval time.

GPT's R01 automatic FAIL is another time-string false negative: it returned
the correct `10:00 UTC` and `10:15 UTC` intervals while v4.5 expects the
literal `10:00` and `10:15`. The immutable automatic tally remains 37/40;
normalizing that suffix would make it 38/40. Its I08 and D06 decisions were
`unknown` because the frozen packets omitted the primary release or
incident-window originals needed to substantiate the expected choices. In
both answers the model explicitly identified that evidentiary gap. Those
abstentions should be audited as retrieval/ground-truth alignment issues,
not automatically attributed to insufficient model reasoning. X01 passed
all structured dimensions with the four expected facts and qualified
mechanism. Semantic support of every claim still needs manual audit.
