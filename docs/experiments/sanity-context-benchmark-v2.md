# Sanity Context benchmark v2 — adversarial retrieval

## Objective

Measure whether retrieval through Sanity Context improves investigation accuracy and provenance when the answer is not already isolated in a tiny prompt.

## Corpus design

The corpus contains 24 English documents:

- 6 canonical payment-incident sources already indexed;
- 6 temporally adjacent but unrelated payment incidents;
- 6 plausible distractors about other providers, fraud reviews, and address validation;
- 6 operational/state documents, including stale Delta histories and unrelated monitoring proposals.

Every document must declare `incident`, `time window`, and `source type`. At least six distractors must contain overlapping words such as `timeout`, `Provider A`, `postal code`, or `fraud` while referring to a different incident or time window.

## Arms

| Arm | Input |
| --- | --- |
| Raw full | Entire 24-document corpus plus State snapshot. |
| Raw bounded | Same corpus truncated to a fixed character budget. |
| Sanity Context | Context MCP orientation, then selective `knowledge_base_read` and State `groq_query` calls only. |

## Question bank (24)

1. Which incident is under investigation, and what is its exact failure window?
2. Which explanation is best supported for that incident?
3. Name two sources supporting the latency-plus-timeout explanation.
4. What evidence weakens the postal-code hypothesis?
5. What evidence weakens the fraud-rule hypothesis?
6. Can Provider A be declared the sole cause? Why not?
7. What fraction of failures is attributable to Provider A?
8. Which source confirms the timeout configuration change?
9. Which source is only a vendor status notice rather than root-cause confirmation?
10. What monitoring question remains unresolved?
11. Draft that question without applying a Delta.
12. What is the current State revision of the investigation Case?
13. Is the latest Delta proposed, approved, or applied?
14. Which evidence is from a different incident and must be excluded?
15. Did a postal-code rule change ship in the investigated release?
16. Did fraud configuration publish during the investigated window?
17. What should be checked before closing the incident?
18. Does a successful retry prove Provider A caused every failure?
19. Which evidence is correlation rather than causation?
20. What source provenance supports the next investigation step?
21. A stakeholder says fraud rules caused the incident. Correct the claim.
22. A stakeholder says the root cause is confirmed. Correct the claim.
23. Propose one Delta; do not claim it was applied.
24. Which unrelated monitoring proposal should not be attached to this Case?

## Scorecard

For each answer score 0–2: correct incident selection, grounded conclusion, counterevidence, uncertainty, provenance, Delta safety, and distractor rejection. Record token counts, latency, and each Context tool call. Run three repetitions per arm, randomized, on `qwen3:4b-instruct` and the selected OpenAI model.

## Completion rule

Do not report a Context win from aggregate fluency. Report it only if it improves the median combined retrieval score and reduces distractor errors while preserving Delta safety.
