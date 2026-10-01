# ADR-007: Localized scheduling with canonical domain data

## Status

Accepted.

## Decision

Trama separates scheduling into three layers:

1. `trama-ownership` orchestrates operational memory, prioritization, and investigation.
2. `trama-scheduling` defines safe conversational behavior for deadlines, reminders, recurrence, and confirmations.
3. The core temporal interpreter deterministically converts localized expressions into canonical ISO timestamps.

Internal entities, MCP tools, and persisted values remain in English. Locale lexicons and user-facing messages are localized. The initial supported locales are `pt-BR` and `en-US`. Locale, IANA time zone, and region are independent inputs.

The model never calculates relative dates or controls the operational review cadence. The deterministic interpreter covers quantities, common relative periods, and named weekdays (for example, `próxima segunda-feira` and `next Monday`), always resolving a named weekday to its next future occurrence. It asks for clarification only when the deterministic interpreter cannot resolve the expression or the target Action is ambiguous.

## Consequences

- Adding a language means adding and testing a lexicon and message catalog, not duplicating date arithmetic or domain rules.
- The database schema is unchanged.
- Full product-interface localization remains separate from localized agent conversation.
