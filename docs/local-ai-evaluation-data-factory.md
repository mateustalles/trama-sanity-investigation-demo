# Local AI evaluation data factory

## Goal

Build a reproducible, multilingual evaluation corpus for Trama's local agent before considering weight adaptation. The corpus must measure whether a model selects a valid deterministic workflow, identifies the authoritative entity, preserves facts, resolves everyday temporal language, and asks for clarification only when required.

## Epic scope

1. Maintain hand-reviewed canonical seeds for each workflow and entity focus.
2. Generate controlled paraphrases in Portuguese and English without changing the expected operation.
3. Add contrastive pairs where a small wording change changes the expected decision: progress versus completion, Action versus Ponta Solta, current versus new deadline, and explicit versus ambiguous targets.
4. Compose realistic multi-turn conversations with DOM-like screen context and mocked MCP records.
5. Add adversarial cases: pronouns with multiple candidates, stale deadlines, conflicting dates, colloquial expressions, typos, code-switching, and nonexistent entities.
6. Isolate development, validation, and blind-test splits by semantic family, not only by exact text.
7. Store provenance, license, locale, generation method, reviewer decision, and privacy classification for every sample.
8. Retrieve only a small set of relevant demonstrations at runtime; never place the full corpus in model context.

## Initial sample families

- Record one progress step and keep the Action active.
- Record progress and move the completion deadline.
- Complete, reopen, reschedule, wait, block, delegate, or do nothing.
- Resolve references from an expanded Action, Case, Trama, or root map.
- Distinguish completion deadline from the global review cadence.
- Refuse or clarify writes whose entity or relationship is not authoritative.
- Interpret everyday dates such as tomorrow, next week, next month, yesterday, and in two hours in both supported locales.

## Quality gates

- Exact target entity accuracy.
- Valid workflow and tool selection.
- Valid schema arguments.
- Deadline resolution accuracy.
- No invented facts or completion.
- Minimal clarification on deterministic requests.
- Mandatory clarification on genuinely ambiguous requests.
- Equivalent behavior across Portuguese and English test families.

## Delivery sequence

Start from the reviewed evaluation set already in the repository. Expand it by controlled generation, review candidates in the existing evaluation UI, then promote accepted samples into versioned fixtures. Only after prompt, workflow, retrieval, and model-size experiments plateau should the team evaluate a LoRA or another adapter.

## Current corpus milestone

The first structured expansion adds 30 samples to the original 36, for a total of 66. New samples carry family, variant, locale, provenance, and optional contrastive-pair metadata. They cover progress/deadline coupling, outcome boundaries, relative time, target resolution, noisy language, topic override, external waiting, multiple entities, and English equivalents. Contrastive pairs are kept inside a single split, and automated corpus tests prevent duplicate IDs, missing labels, missing metadata, and pair leakage between development and holdout.

The next milestone is to review these 30 candidates in `/evals`, export the human labels, run the selected 8B and 14B models, and analyze accuracy by family, locale, and variant rather than only aggregate score.

## Interview policy experiment

The first live review established an interview-derived policy arm for local-model experiments. It adds completion confirmation, natural-language mutation previews, compact progress logging, deadline conventions, external-wait boundaries, same-thread rename suggestions, and clarification before multi-Action batches. Run it with `--policy interview`; the unchanged arm is `--policy baseline`.

Reports measure both the primary decision and a structural interaction gate: clarifications must ask a question and propose no operation, completion candidates must ask for confirmation, and multi-Action decisions must produce multiple operations. Because the live review discussed examples from the previous holdout, that split is now a regression set rather than a statistically blind estimate. A future blind split must use new semantic families or newly withheld natural utterances.
