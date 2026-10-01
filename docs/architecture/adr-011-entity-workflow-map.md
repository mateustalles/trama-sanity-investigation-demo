# ADR-011: Entity workflow map and localized chat rails

## Status

Accepted for incremental implementation.

## Context

Trama entities already have authoritative persisted states and audited commands.
Small local models are more reliable when they select among bounded, valid paths
instead of inferring the product workflow from a broad tool catalog. The browser
must present material options for the authenticated entity in focus without
becoming the authority for state, permissions, or transitions.

## Decision

- Define workflow operations in versioned TypeScript policy maps, with English
  internal operation IDs and MCP command names.
- Resolve each workflow from the entity loaded by the trusted service and its
  current persisted state. A workflow is not a persisted entity and has no
  database table or mutable database definition.
- Return the resolved `EntityWorkflow` contract to the browser and use the same
  bounded paths to guide the agent. Re-evaluate the entity and workflow before a
  proposed write reaches individual human confirmation.
- Keep interface text in `localization` records for `pt-BR` and `en-US`. Product
  presentation defaults to Portuguese. Extract messages into a catalog only when
  reuse, parameterization, or additional locales make the inline map unsuitable.
- The DOM may carry an entity type, ID, and visible scope only. The server always
  resolves the Workspace, loads the concrete entity, and derives the workflow;
  client-provided workflow state is never trusted.
- Persisted `ConversationOperation` and `AuditEvent` remain the write provenance.
  A later additive schema change may record an operation ID and workflow version
  when workflow-history reporting needs that extra granularity.

## Initial scope

- Plot: create Case, rename, change desk visibility, complete, archive, reopen.
- OpenLoop: close with explicit status and resolution.
- Action: preserve the existing deterministic guided workflow and add Portuguese
  and English localized labels, prompts, and confirmations.

## Consequences

The workflow map is a contract shared by UI and agent behavior, but domain
commands remain the final validator. This avoids duplicating mutable rules in
PostgreSQL or SQLite while allowing low-capability local models to operate
through predictable conversational rails.
