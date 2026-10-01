# Sanity Context benchmark — manual audit

This log records human review separately from the immutable benchmark artifact and its automated lexical score. Do not retroactively change the original run's `strictPass` values.

## S03 — latest monitoring follow-up Delta

- Artifact: `artifacts/sanity-context-benchmark/v3-run-2026-09-24T18-26-42-557Z.json`
- Prompt: “Has the latest monitoring follow-up Delta merely been proposed, or was it applied? Cite the State fields.”
- Runs reviewed: 1, 2, and 3 of `sanity-kb-groq`.
- Automated result: FAIL in all three runs because the literal `approvedAt`/`approved` group was absent; the `applied` and `appliedAt` groups matched.
- Manual conclusion: **PASS on the question asked, with a retrieval-relevance caveat.** Every answer identifies Delta `DTKv3PrPJ983fXbjsfj7Cx`, cites `status: "applied"` and `appliedAt: "2026-09-21T17:42:16.476Z"`, and concludes it was applied rather than merely proposed. Those State fields directly support the conclusion. Requiring `approvedAt` to establish application is an erroneous scoring requirement: approval and application are distinct events.
- Source caveat: all three source packs include `16-monitoring-delta-old.md`, concerning the 2026-08-01 incident rather than the 2026-09-18 incident. The answers explicitly flag it as irrelevant; they do **not** use it to establish the current Delta's applied status. Its retrieval is a relevance defect, not a reason to overturn the supported State-based answer.
- Prompt caveat: “latest” is under-scoped without identifying the Case and a State snapshot/as-of time. Future versions should specify these, and evaluate the correct Delta identity, status, and `appliedAt` against State. Track irrelevant sources separately from answer correctness.
- Reviewer feedback: user disputes the three automatic FAILs and is continuing the manual audit with S04.

## S04 — applied Delta count and base revisions

- Artifact and arm: same run as S03, `sanity-kb-groq`; runs reviewed: 1, 2, and 3.
- Prompt: “How many applied Deltas are visible in the current snapshot, and what base revisions do they use?”
- Automated result: FAIL in all three runs. The literal matcher found `2` but missed both `base revision 1` and `base revision 2` because each answer writes `base revision: 1` and `base revision: 2`.
- Manual conclusion: **PASS in all three runs.** Each answer says there are two applied Deltas and identifies their base revisions as 1 and 2, associated with the respective Delta IDs. The punctuation does not change the meaning.
- Scoring lesson: parse or normalize field labels, punctuation, and numeric values before comparison; do not use unnormalized substrings to determine correctness.

## S05 — stale Delta based on revision 1

- Artifact and arm: same run as S03, `sanity-kb-groq`; runs reviewed: 1, 2, and 3.
- Prompt: “Would a new Delta based on State revision 1 be current? Explain using the present revision.”
- Automated result: FAIL in all three runs. The literal matcher found the negative answer and revision 1, but missed revision 3 because the answers say `` `stateRevision` of 3`` rather than `stateRevision 3` or `revision 3`.
- Manual conclusion: **PASS in all three runs on the asked comparison.** Each answer says “No,” identifies the present State revision as 3, and explains that a new Delta based on revision 1 would be stale. Any broader claims about unrelated incident evidence or the exact Delta-validity rule should be assessed separately, not conflated with the lexical miss.
- Scoring lesson: recognize equivalent grammatical forms and code-formatted field names while checking the actual State value and conclusion.
