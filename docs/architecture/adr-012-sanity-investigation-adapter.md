# ADR-012: Sanity investigation adapter

## Status

Accepted for the isolated architecture experiment.

The [integration review](../experiments/sanity-context-integration-review.md)
records unresolved fidelity, provenance, and benchmark concerns; this ADR is
not a claim that the current adapter is an optimal Context implementation.

## Decision

Trama keeps the provider-neutral policy that validates an approved
investigation Delta against an authoritative State snapshot. The policy returns
a mutation plan; it neither calls a model nor writes persistence.

The Next.js Sanity adapter is server-only. It reads the Case, Delta, and target
revisions, translates the validated plan into one Content Lake transaction, and
uses optimistic revision guards for every existing document. It creates normal
documents without caller-supplied IDs. The adapter requires
`SANITY_API_WRITE_TOKEN`, which must never have a `NEXT_PUBLIC_` prefix.

Applying a Delta increments the Case `stateRevision`, patches existing targets,
creates any approved `NEW` elements, and marks the Delta `applied` in one
transaction. A stale Case, target, or Delta revision rejects the entire write.

## Consequences

- Sanity remains the structured state and transaction substrate.
- Trama remains the control plane for approval, Delta validation, and audit
  semantics.
- A model cannot receive the write token or apply a Delta directly.
- The model does not generate GROQ for authoritative investigation State. The
  isolated payment POC benchmark calls Context MCP `groq_query` with a fixed,
  bounded projection. The general chat uses Trama MCP for operational State;
  it must not receive a snapshot of the POC's first Sanity Case. Raw
  `groq_query`, `schema_explorer`, and `array_field_reader` are not part of the
  normal model tool catalog.
- Evidence retrieval is exposed as the prefixed read-only
  `read_index_entries` tool. Context's `initial_context` Knowledge Base outline
  is shown to the model before it answers a question. The model chooses up to
  five keys from that live index; the host validates each key against the
  session's parsed outline and calls `knowledge_base_read` only for those
  entries. It groups reads by Knowledge Base id when necessary. The outline
  is a map for selecting evidence, not proof for the final answer. No
  subject-specific paths, aliases, manifests, or open-ended Context queries
  are model-facing or required.
- If the connected Context endpoint has no relevant entry, the model must
  report an explicit evidence gap. It must not substitute unrelated records or pretend
  that Sanity holds information that has not been supplied to it. A Knowledge
  Base can be about any subject; the endpoint controls which bases are exposed.
- The POC benchmark includes the fixed State snapshot only for questions about
  current State, revision, Delta, approval, or application. General chat does
  not expose that POC-specific tool. Each external evidence read is limited to
  one call per question. After retrieval, the agent requests a direct final
  answer without another tool cycle.
- The bounded read encourages selecting contrasting and limiting entries when
  the question asks for comparisons or exclusion of adjacent matters.
- After retrieval, the agent must answer the user's exact question with a direct
  conclusion, supporting evidence, material limits, and provenance. A message
  that merely reports retrieval completion is not a valid final response.
- The next integration step is a server route/UI that changes a Delta from
  `proposed` to `approved` only after explicit human review, then calls the
  adapter.
