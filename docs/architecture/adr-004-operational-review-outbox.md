# ADR-004: Durable operational review and notification outbox

## Status

Accepted.

## Decision

Operational review results are durable domain records. A ReviewRun reconciles
deterministic observations into fingerprinted AttentionItems, opens
RequiredInputs when authoritative information is missing, and writes
provider-agnostic Notifications to a local SQLite outbox.

Schedulers, ChatGPT, Codex, MCP, and delivery providers are adapters. They may
trigger application commands or deliver pending notifications, but their names,
protocols, and payload formats do not appear in core entities.

System-wide ReviewRun audit events use a null `plotId`; entity-specific events
remain associated with their Plot.

The review command also returns a provider-neutral operational priority report.
That report is a deterministic projection rather than an AI-authored summary:
it contains every active Action and open OpenLoop, ordered by explicit priority
bands, score, deadline, and title. MCP clients render the same projection as a
Markdown table, so Codex and local-model hosts share one reporting contract.
