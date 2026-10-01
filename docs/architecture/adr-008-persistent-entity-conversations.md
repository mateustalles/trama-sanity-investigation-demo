# ADR 008 — Persistent entity-scoped conversations

## Decision

Trama persists Conversation, ConversationMessage, ConversationContext, and
ConversationOperation in SQLite. A Conversation has one primary workspace,
Plot, OpenLoop, or Action target, while an entity may own multiple threads.

The graphical local agent defaults to the `local-complete` profile. It restores
the current thread and, when enabled, retrieves a bounded set of earlier user
and assistant messages from the same entity. The user can disable that memory.
Related-context and global retrieval remain explicit scopes and are never
selected without the user's authorization.

Model-decided operations are first stored as `proposed`, linked to the message
that caused them, then transition through approval and execution. The exact
tool name, arguments, result, and error are retained. This provenance does not
replace domain AuditEvents or establish that a real-world fact is true.

## Consequences

- Runtime sessions can expire or restart without losing conversation history.
- A Trama, Case, Ponta Solta, or Action can accumulate multiple focused threads.
- Same-entity memory improves continuity without silently injecting the entire
  personal database into a local model prompt.
- MCP clients can create, list, read, and append persistent conversations using
  provider-neutral contracts.
- Global contextual exploration remains a future retrieval concern behind an
  explicit authority boundary.
