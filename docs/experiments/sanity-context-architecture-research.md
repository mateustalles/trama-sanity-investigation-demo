# Sanity Context's role in Trama — research brief

Status: research hypothesis, not an accepted architecture change. Updated 2026-09-23.
This note guides the next investigation; it does not authorize a Knowledge Base
rebuild, endpoint switch, benchmark run, or connector change.

## Product fit and source-of-truth boundary

Trama is a subject-agnostic, auditable reasoning ledger. It preserves the
current interpretation of a situation, its evidence and uncertainty, proposed
Deltas, human decisions, and revisions. It must work even when no external
Knowledge Base exists for the user's subject. See the
[reasoning-ledger design](../architecture/trama-reasoning-ledger.md) and
[domain invariants](../domain/invariants.md).

Sanity can be an evidence retrieval and storage adapter, but its generated
Knowledge Base entries must not silently become approved Trama Findings or
authoritative operational State. The isolated Sanity State/transaction POC is
described in [ADR-012](../architecture/adr-012-sanity-investigation-adapter.md);
the general chat uses Trama MCP for operational State. A move of canonical
hosted State to Sanity would require an explicit decision against the current
SQLite/PostgreSQL repository invariant, not an incidental connector change.

| Layer | Appropriate responsibility |
| --- | --- |
| Trama | Investigation State, provenance, Delta validation, approval, audit, and source-of-truth policy. |
| Canonical source store | Original evidence or a faithfully preserved version, with stable identity, revision, scope, and retrieval path. The implementation may vary by source type. |
| Sanity Context Knowledge Base mode | Prebuilt outline and generated entries that help locate and compare material spread across a supplied corpus. |
| Sanity Context GROQ mode | Direct, structured queries against a live Sanity dataset; potentially an exact-source retrieval route when the originals are stored there. |

GROQ is Sanity's query language, not a second model. Context offers distinct
GROQ and Knowledge Base modes. GROQ fits structured, current documents; a
Knowledge Base fits the harder task of finding relevant information across
prose. Dataset embeddings can help rank less-structured content in GROQ mode.
An MCP endpoint does not combine both tool sets: a dataset source takes
precedence over Knowledge Base sources. See Sanity's
[retrieval-mode guide](https://www.sanity.io/docs/ai/sanity-context-retrieval-modes)
and [MCP tool reference](https://www.sanity.io/docs/ai/sanity-context-mcp-tools).

## Leading hypothesis: use the Knowledge Base as a locator

The promising pattern is **KB-guided, source-grounded retrieval**:

1. Give the agent the complete, current Knowledge Base outline as a map of the
   connected material, scoped to the current user/workspace/investigation.
2. Select a small set of plausible entries. Read a generated entry only to
   identify candidate claims and the *original sources* it points to; do not
   treat its prose or citation numbering as the final evidence.
3. Resolve those references through a trusted, source-type-specific adapter and
   retrieve the original document or relevant excerpt. Preserve source id,
   version/time, exact location, and access scope.
4. Answer from the retrieved originals, distinguishing direct observations from
   inference. Cite the original source and report a gap if it cannot be
   resolved or does not support the claim. Never convert an entry's synthesis
   into a Trama Finding without the normal review and Delta flow.

This is a hypothesis, not a claim that Context already implements the whole
flow. In Knowledge Base mode the documented MCP tools are `initial_context`
and `knowledge_base_read`; the latter returns **generated entries**, not a
general raw-source-read API. Original-source access therefore needs another
route: for example Trama's preserved file, a case-scoped direct document read,
or a separate GROQ-mode endpoint when the original is a Sanity dataset
document. Sanity's CLI has a read-only `context imports download` command that
returns a short-lived signed URL for an uploaded file's original bytes. We
verified one experimental import's downloaded SHA-256 matches its local
original, but the CLI uses a logged-in personal session and is not yet a
validated production server API. The 24 experimental sources are file imports,
not dataset documents, so GROQ alone cannot query those uploads. Uploaded
files, websites, and dataset documents may require
different resolvers. Verify what stable identifiers and source locations the
actual KB response exposes before committing to this design. See the
[tool reference](https://www.sanity.io/docs/ai/sanity-context-mcp-tools),
[Knowledge Base guide](https://www.sanity.io/docs/ai/sanity-context-knowledge-bases),
[source types](https://www.sanity.io/docs/ai/sanity-context-source-types), and
[Context CLI](https://www.sanity.io/docs/cli-reference/cli-context).

A generic provenance registry may be needed to map an ingested source to its
canonical original: workspace/investigation scope, source id, source type,
revision or content hash, and retrieval address. This is **not** a
subject-specific question manifest or a requirement that a Knowledge Base
pre-exist. The exact schema and whether Sanity's returned source metadata is
sufficient remain research questions.

Why insist on originals? KB entries are synthesized Markdown. Our experimental
base has produced unsupported dates and citation-to-file mismatches even
after targeted rewrites; choosing the correct entry cannot fix a wrong claim
inside it. See the [integration audit](sanity-context-integration-review.md)
and [source-fidelity report](sanity-context-source-fidelity-report.md). A KB
refresh may detect source changes without rewriting served entries, and
uploaded files do not auto-refresh. See Sanity's
[maintenance guide](https://www.sanity.io/docs/ai/sanity-context-maintain-knowledge-base).

## Constraints before implementation

- **Authorization:** Knowledge Base mode does not use `groqFilter`; a consumer
  can read every KB served by its endpoint. Select and authorize the KB at the
  workspace/investigation boundary before exposing its outline or entry keys.
  A process-wide evidence endpoint is only safe when all its content is meant
  for every consumer. See [Sanity access rules](https://www.sanity.io/docs/ai/sanity-context-security).
- **Prompt and evidence retention:** live chat currently drops Sanity's second
  system message during prompt bounding and clips combined tool results to
  4,000 characters. The benchmark keeps the outline in its first system
  message and passes full read results. Those paths must be made comparable
  before judging the retrieval design. See
  [`agent.ts`](../../apps/local-agent/src/agent.ts) and
  [`run-sanity-context-benchmark-v3.mjs`](../../scripts/run-sanity-context-benchmark-v3.mjs).
- **Freshness:** cache an outline or source result only with a version/rebuild
  boundary and invalidate it when the KB or original changes. A cache saves
  network reads; it does not automatically save model prompt tokens.
- **Failure behavior:** if the KB points to a missing, unauthorized, stale, or
  unsupported original, do not answer as though its generated entry were
  verified. A source may be relevant to several investigations; scope and
  provenance must remain explicit.
- **Operational State:** State, revision, approval, and application status
  must come from the authoritative Trama path. The POC's fixed GROQ State
  query is deliberately not a general multi-Case retrieval strategy.

## Research questions and decisive evaluation

1. For each KB source type we intend to support, what stable source reference
   does `knowledge_base_read` actually return? Can it be mapped unambiguously
   to the original bytes and a precise excerpt without relying on a fragile
   citation number or filename alone?
2. Should newly supplied or rapidly changing evidence bypass KB synthesis and
   use direct, case-scoped retrieval until a KB build is useful? What is the
   build/refresh/revision latency in a real investigation?
3. Does a generic, case-scoped evidence dataset queried with deterministic
   GROQ (with optional ranking) work better than a synthesized KB for dynamic
   sources? Do not ask the model to generate authoritative State queries.
4. How should the host allocate prompt space among the full outline, latest
   question, original excerpts, and tool definitions without losing citations
   or exceeding the local model's context/memory budget?
5. Does the extra KB-to-original hop improve source selection enough to offset
   its latency and token cost? Does it reduce wrong dates, unsupported claims,
   and citation errors in manually audited answers?

Compare four arms on the **same original corpus and authoritative State**:
direct source retrieval; KB entry as answer evidence (diagnostic control);
KB-guided retrieval of originals; and `raw-full` only as an all-evidence
ceiling when the corpus fits. Use multiple unrelated subjects, larger corpora
with distractors, newly added/changed evidence, multi-turn sessions, and
questions whose answer is absent. Hold model, question, context window,
retrieval budget, and evaluation rubric constant where possible. Record exact
sources and excerpts seen by the model, retrieval recall, original-source
claim support, citation correctness, answer quality, prompt tokens, reads,
cache hits, and end-to-end latency. Manually adjudicate discordant cases;
the current literal scorer has known false negatives.

Only after that evaluation should we choose whether the KB is the default
locator, a specialized accelerator for mature corpora, or unnecessary for
some investigation types. Do not interpret the existing 24-file benchmark as
Sanity's performance ceiling.

The first implementation slice is an isolated `sanity-source-grounded`
benchmark arm. It resolves KB-listed file names against a scoped allowlist of
local originals and passes only those originals to the model. It does not yet
use the Sanity import-download route, migrate sources into a GROQ-queryable
dataset, change the live connector, or establish source-level recall. See the
[v3 benchmark protocol and smoke result](sanity-context-benchmark-v3.md).
