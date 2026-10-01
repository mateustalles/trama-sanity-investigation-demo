# ADR-001: LLM-agnostic core

## Status

Accepted.

## Decision

Trama is an independent local-first application. LLMs and agents integrate
through adapters and submit structured proposals or commands to stable
application ports.

MCP is a possible adapter, not the product boundary. OpenAI, Ollama, Llama, and
future providers must not appear in core entities or use cases.

The stable boundary is not a generic `LLMProvider.chat()` abstraction. It is the
set of structured operations Trama accepts, such as submitting a Proposal,
reading Plot context, and recording an Action update.

