# ADR-005: Codex via MCP as the first conversational client

## Status

Accepted.

## Decision

The first conversational client for Trama will be Codex connected through a
local MCP server. Users converse in Codex; Codex reads context and submits
structured application commands through focused MCP tools. The existing web
application remains an operational dashboard.

The MCP server is an adapter. It may identify its actor as `codex-mcp`, but
Codex, OpenAI, MCP, prompts, and transport concepts must not appear in schemas,
core policies, database records, or application use cases.

The first transport is local stdio. A future ChatGPT plugin may expose the same
application operations over Streamable HTTP and optionally return MCP Apps UI.
An embedded conversational interface remains a later option.

MCP does not provide scheduling. Scheduled reviews and notification delivery
remain responsibilities of Trama workers and delivery adapters.
