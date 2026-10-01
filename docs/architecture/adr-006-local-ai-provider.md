# ADR 006 — Local AI provider

## Decision

Trama exposes AI through provider-neutral model boundaries. The conversational
host supports Ollama and OpenAI Responses while preserving one MCP tool loop,
one deterministic workflow layer, and one approval boundary. Ollama remains
the private local option. The BYOK beta uses OpenAI as the higher-capability
remote option without placing provider concepts in domain or application
commands.

Ollama does not replace MCP. A local agent host connects to the Trama MCP server as a client, translates MCP tool schemas into Ollama function tools, executes selected tool calls through MCP, and returns their results to the model's agent loop.

Local AI may summarize, prioritize, connect context, and draft questions. Its output must be schema-validated and cannot mutate domain records directly. All writes continue through audited application and MCP commands.

## Configuration

- `TRAMA_OLLAMA_BASE_URL` defaults to `http://127.0.0.1:11434`.
- `TRAMA_OLLAMA_MODEL` defaults to `trama-agent` for the agent host. Provider-specific structured generation may retain its own compatibility default.
- `TRAMA_OLLAMA_TIMEOUT_MS` defaults to `180000` per inference call.
- `TRAMA_OLLAMA_MAX_TURNS` defaults to `4` and is capped at `8`.
- `TRAMA_OLLAMA_CONTEXT_SIZE` defaults to `8192`; the prompt, bounded
  conversation, retrieved evidence, and tool schemas share this window.
- `TRAMA_OPENAI_BASE_URL` defaults to `https://api.openai.com/v1`.
- `TRAMA_OPENAI_MODEL` defaults to `gpt-5.6-terra`.
- `TRAMA_AGENT_TIMEOUT_MS` and `TRAMA_AGENT_MAX_TURNS` configure the shared
  conversation loop; the older Ollama-specific variables remain compatible.
- `TRAMA_CREDENTIAL_SECRET` encrypts beta-tester API keys in HttpOnly cookies;
  production refuses to persist a key when this secret is absent.
- Local development generates an ignored `.trama/credentials.key` when no
  explicit secret exists. This convenience never applies in production.
- `OPENAI_API_KEY` optionally supplies a server-owned credential instead of
  BYOK.

## Consequences

- Routine analysis can run without remote model usage.
- Domain and persistence remain provider-agnostic.
- Remote providers do not change Trama entities or mutation authority.
- A beta tester can switch providers from the web chat. Changing provider
  invalidates the inference session but preserves persisted conversation
  history.
- The BYOK cookie is encrypted, HttpOnly, SameSite Strict, and Secure in
  production. It is not a replacement for deployment authentication or tenant
  isolation.
- Small-model output is treated as a proposal and rejected when it violates the expected schema.
- The local agent exposes only read-only MCP tools by default. Write tools require the explicit `--allow-writes` flag and remain subject to domain validation and audit.
- The graphical web chat enables write tools only behind an individual approval boundary. Inference runtime sessions and pending approvals remain server-side and expire after inactivity; persistent Conversations, messages, and operation history remain in SQLite. The browser cannot execute MCP or access SQLite directly.
- The web chat starts with a compact read-only toolset. The user must explicitly enable write mode before write schemas are exposed to the model, reducing context cost and keeping authority visible.
- The browser supplies a typed visible-screen hint on each turn. The host deterministically resolves a visible Plot through `get_plot_context` and stores the result as authoritative system context; the model is never asked to copy or infer that ID. An explicit entity reference overrides the screen hint.
- The host builds a lightweight title-to-ID index through `list_plots`. A Plot title explicitly present in the user's message is resolved and prefetched deterministically before inference, rather than relying on a small model to discover the entity through repeated tool calls.
- The host supplies the current absolute timestamp on every turn so relative deadline language is grounded in runtime time rather than model memory.
- `Modelfile` contains stable provider-level behavior and inference parameters. MCP instructions remain dynamic and authoritative so a model rebuild is not required for every tool or domain change.

## Orchestration framework

The first version uses a small in-repository agent loop instead of LangChain or LangGraph. Ollama or OpenAI provides model inference and tool selection; the host owns conversation state, MCP discovery, tool execution, deterministic validation, and write confirmation.

Keep the host behind explicit boundaries so a workflow framework can replace it later. Reconsider LangGraph when Trama needs durable conversation checkpoints, branched workflows, multiple cooperating agents, or resumable long-running executions.

## Execution profiles

Model capability and mutation authority are separate concerns:

- `economical` supplies focused screen context, a compact toolset, bounded output, and minimal retrieval.
- `local-complete` is the default web profile. It persists multiple conversations and retrieves bounded history from the same focused entity while retaining local inference and compact prompt projection.
- `complete` may retrieve wider Plot-family and operational context, expose a broader safe tool catalog, and spend a larger reasoning budget. A capable remote provider may default to this profile.
- Write permission is never implied by either profile. It remains an explicit per-interaction capability followed by individual tool-call confirmation.

The visible-screen contract and MCP domain boundary are provider-neutral. Ollama, OpenAI, or a future provider should consume the same semantic context while adapting retrieval and token budgets to the selected execution profile.

The host bounds prompt history and tool-call turns independently from the
inference timeout. A timeout or exhausted turn budget produces an explicit
no-write result; neither condition is permission to retry a mutation silently.

In the economical profile, visible Plot context is projected to current Plot metadata, Actions, recent Action progress, Pontas Soltas, attention items, and required inputs. Raw audit history remains persisted and queryable but is not injected into every prompt.

The host also bounds conversational memory before every Ollama request. It
keeps the base instructions, the latest authoritative screen context, the
current time, and the most recent complete conversation turns within a fixed
budget. MCP results are projected before entering model memory, and
`get_plot_context` never injects raw audit history. This prevents long-running
web sessions from exceeding a constrained local model's context window while
leaving the full operational record in SQLite.

## Model evaluation

Local-model selection is evidence-driven. Exported language evaluations are run through `pnpm local:eval` with no database or MCP writes. The same versioned Action interpretation policy is supplied to every candidate, and reports remain local because examples may contain personal context.

Evaluation data is split by purpose. Development cases may guide prompt and policy changes. Holdout cases measure generalization and must not be fed back into the policy while they retain that designation. Human labels include both the natural-language expected behavior and a structured primary decision; model scores compare the structured label while detailed reports preserve outputs for qualitative review.

Prefer strict JSON Schema output when the model/runtime combination supports it. The runner also supports `--json-mode`, followed by host parsing and validation, because some Ollama model architectures can answer quickly in JSON mode while stalling under a detailed generation schema. Model quality, first-token latency, total latency, structured-output compatibility, and tool behavior are separate acceptance criteria.

For a focused Action, the local host first requests a constrained structured route.
The schema exposes only decisions corresponding to operations the authoritative
workflow actually offers. A low-confidence route exposes no write tool and
falls back to a minimal clarification or the guided UI. A confident route
narrows the subsequent tool catalog to the matching operation; it still does
not execute a mutation, which remains a separately validated human-approved
MCP proposal. The routing prompt includes a small operation-specific example
set, while the holdout evaluation corpus remains excluded from those examples.
