# ADR-003: Audited mutations

## Status

Accepted.

## Decision

Commands that mutate domain state must write the state change and its
AuditEvent atomically. Audit events describe internal Trama changes and are
distinct from investigated real-world Events.

A client may group multiple explicit Action commands behind one human
confirmation. The group is an execution envelope rather than a new aggregate
transaction: each command retains its own state-and-audit transaction and the
result identifies success or failure per item. A later failure does not undo an
earlier successful command.
