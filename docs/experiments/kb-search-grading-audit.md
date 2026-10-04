# Conservative UTC clock grading audit

The completed native KB search comparison used grader `v4.5`. Its string
comparison incorrectly rejected the same UTC clock time written as `10:00 UTC`
instead of `10:00`. That is a presentation difference, not a factual error.

## Scope of the correction

Host-only grader revision `v4.6-utc-time` declares the clock fields in R01, R06,
R07, I02 and T03 as `utc-time`. These fields accept exactly the same zero-padded
`HH:MM`, optionally followed by the literal suffix ` UTC`. Surrounding whitespace
is ignored, as it already was for string facts. This does not change the prompt,
output contract, queries, evidence packets, reasoning models or experiment.

Shifted clock times, offsets (including `+00:00`), ISO timestamps, seconds, clock
ranges, unpadded values, `GMT`, `Z`, lowercase suffixes and explanatory prose
remain invalid for these fields. Other strings and timestamp facts stay exact;
decisions and actions remain exact enums. Numeric comparison is unchanged.
The score preserves the actual string and records its normalized comparison
value so a reviewer can inspect the equivalence. Expected and actual actions
are also explicit in the score and offline audit rationale.

## Preserve the original experiment

Do not overwrite `final.json`, `checkpoint.json`, `manifest.json` or `packets.json`.
The offline audit script reads the completed final artifact without any inference
or retrieval call. It requires the original 160-answer matrix and v4.5 scores,
records the SHA-256 and run identity of the original file, and writes a **new**
audit file with old and new scores, per-answer rationale and both summaries.
It refuses to replace an existing output. Execution errors, including truncated
Qwen outputs, can never become a PASS through this replay. An unexpected grading
change outside the declared UTC equivalence fails the replay rather than silently
changing conclusions.

```powershell
node scripts/regrade-kb-search-utc.mjs artifacts/sanity-context-benchmark/kb-search-v1-20261004/final.json artifacts/sanity-context-benchmark/kb-search-v1-20261004/utc-grading-audit-v4.6.json
```

The narrow correction is expected to promote three answers only: OpenAI R01 in
both arms and OpenAI R06 in the keyword arm. Expected adjusted totals are
OpenAI KB 38/40, OpenAI keyword 34/40, Qwen KB 30/40 and Qwen keyword 27/40.
These are grading corrections, not new model results; compare the generated
audit against those expectations before publishing adjusted figures.

The original representation/corpus/State limitations still apply. This change
does not prove semantic support of claims, address knowledge-base omissions,
improve model decisions or remove output-token truncation. Those require the
manual audit and separate follow-up experiments described in
[the comparison methodology](sanity-kb-search-model-comparison.md).

Offline regressions cover all declared clock fields, rejected variants, unchanged
enum/action/numeric/timestamp checks, immutable source data, provenance, the
three-answer promotion and preserved execution failures.
