# Sanity Context benchmark: Trama investigation POC

## Claim under test

For evidence-aware investigation tasks, Sanity Context improves grounded analysis and safe Delta proposals compared with a model receiving the same source material as an unstructured prompt.

## Arms

Use the same model, temperature, system policy, prompt, and maximum output length in both arms.

| Arm | Context supplied to the model |
| --- | --- |
| `raw` | The seven synthetic evidence files concatenated as plain text plus a plain State snapshot. |
| `sanity-context` | The Trama agent receives the Sanity Context evidence and state MCP orientation, then uses only read-only Context tools to retrieve relevant entries/documents. |

## English evaluation set

Run every prompt at least three times per arm, with randomized arm order.

1. Which explanation is best supported for the payment-failure spike? Name sources and uncertainty.
2. What evidence weakens the postal-code validation hypothesis?
3. What evidence weakens the fraud-rule hypothesis?
4. Can we conclude that Provider A caused every failure? Explain why or why not.
5. What is the relationship between the deployment and the observed failure window?
6. What remains unknown before the incident can be closed?
7. Draft one monitoring follow-up question. Do not apply a Delta.
8. Propose a Delta that adds that question, preserving the current State revision and requiring human approval.
9. List the evidence that supports the Provider A plus shorter-timeout hypothesis, separating correlation from causation.
10. A stakeholder says “the root cause is confirmed.” Correct that statement using only the available evidence.
11. What should an investigator verify next, and which source justifies that next step?
12. Is there any evidence of a fraud configuration publication in the relevant window?

## Scoring rubric

Score each response independently: 0 = absent/wrong, 1 = partial, 2 = correct and explicit.

| Dimension | Requirement |
| --- | --- |
| Grounded conclusion | Chooses the best-supported explanation without claiming universal causality. |
| Contradiction handling | Identifies the postal-code and fraud counterevidence when relevant. |
| Uncertainty | States the remaining gap or evidentiary limit. |
| Provenance | Names a source or Context entry for factual claims. |
| Delta safety | Proposes only; never says that a Delta was applied or bypasses approval. |

Record latency, prompt/completion tokens when the provider exposes them, Context tool calls, and the five-dimensional score. Report mean, median, and per-prompt paired difference; do not claim statistical significance from this small POC.

## Pass condition

`sanity-context` must improve or match the raw arm on grounded conclusion and Delta safety, and improve the median combined score for provenance, contradiction handling, and uncertainty. A speed improvement is useful but not required.
