# ADR-010: Hosted identity and workspace tenancy

## Status

Accepted for implementation.

## Context

Trama supports a private local installation backed by SQLite. A hosted beta also
needs durable login sessions, invitation-only enrollment, per-user AI credentials,
and a hard authorization boundary between personal operational records. A login
screen without tenant-aware persistence would not provide that boundary.

## Decision

- Keep SQLite as the local/personal adapter.
- Use Supabase Auth for hosted identities and cookie-backed Next.js sessions.
- Use PostgreSQL as the hosted persistence adapter.
- Connect the trusted server through the pooled PostgreSQL URL. Supabase's
  browser client remains responsible for identity and preferences; it is not a
  substitute for transactional domain persistence.
- Introduce `Workspace` as the tenant boundary. Every persisted operational record
  belongs to exactly one Workspace, either directly or through an enforced parent.
- Carry an authenticated `ActorContext` and `workspaceId` from the web request into
  application services, repositories, agent sessions, and MCP transports. Hosted
  web chat creates an in-process MCP server over that request-scoped service; it
  must never spawn the local SQLite MCP process.
- Enable Row Level Security on every exposed hosted table and grant no anonymous
  access to personal operational records.
- Create beta accounts only from expiring, single-use invitations issued by a
  Workspace administrator.
- Store provider credentials encrypted and make decrypted values available only to
  trusted server-side execution. Never send an OpenAI key back to the browser.
- Associate the existing SQLite records with the initial administrator Workspace
  during an incremental import; never reset the local database.
- Use composite `(workspace_id, id)` keys and foreign keys for hosted operational
  records. Do not derive tenant authorization from fields inside JSON payloads.
- Make the import dry-run-first, idempotent, and additive. Activating hosted mode
  remains a separate decision after adapter and cross-tenant validation.

## Consequences

The domain and MCP remain provider-agnostic. Local development continues without a
cloud dependency. Hosted deployment requires Supabase project configuration and a
PostgreSQL repository implementation. Authorization tests must prove cross-workspace
reads and writes fail even when an entity ID is known. The externally launched
local MCP adapter remains SQLite-only; an authenticated external hosted MCP
endpoint is a separate future design.
