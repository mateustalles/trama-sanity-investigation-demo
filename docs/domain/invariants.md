# Domain invariants

1. The configured repository is the source of truth: SQLite for a personal/local
   installation and PostgreSQL for a hosted installation.
   Every hosted operational record belongs to one Workspace. Reads, writes, agent
   sessions, MCP calls, reviews, notifications, and conversations must retain that
   Workspace boundary.
2. An external agent never directly establishes a fact or semantic conclusion.
3. Every active Action has an effective priority, priority reasons, and a next
   review date.
4. An Action cannot be completed with only a boolean flag; a structured outcome
   and occurrence time are required.
5. Every meaningful Action update triggers contextual reevaluation.
6. Trama may derive operational states such as overdue, stale, or due soon, but
   it must not infer real-world completion without confirmation or authoritative
   evidence.
7. Every mutation creates an immutable AuditEvent in the same transaction.
8. Provider-specific concepts stay outside the core domain.
9. Operational reviews are idempotent for a caller-provided idempotency key.
10. Repeated detection of the same active condition updates one AttentionItem
    identified by a stable fingerprint rather than creating duplicates.
11. Missing authoritative information is represented as RequiredInput and is
    never invented by an agent.
12. Notifications are durable delivery intents; provider-specific delivery
    state stays in adapters.
13. Reported Action progress is appended to an immutable log. Agents do not
    invent future steps, and active progress never overwrites the Action's
    terminal outcome.
14. Every newly created Action has an authoritative deadline supplied or
    confirmed by the user. Existing legacy Actions without a deadline remain
    readable, but no client may create another one.
15. Product hierarchy has two levels: a root Plot is a Trama and its direct
    child is a Case. A Case cannot contain another Case.
16. A Trama may be ongoing or resolvable. Every Case is resolvable, and an
    ongoing Trama cannot enter completed status.
17. Closing an OpenLoop requires explicit human confirmation and a resolution
    note. Completing a related Action never closes the OpenLoop implicitly.
18. Rescheduling an Action changes only its completion deadline. It preserves
    the current resolution and cannot imply completion, cancellation, or
    irrelevance. In conversation, "prazo" means the completion deadline.
19. Action review timing follows one global cadence. Clients and agents do not
    ask the user to choose a review date inside an Action interaction.
20. Relative deadline language is resolved by a deterministic, provider-neutral
    temporal component before mutation. Supported expressions include relative
    minutes, hours, days, weeks, months, years, today, tomorrow, yesterday, and
    the corresponding next-period forms. The resolved timestamp is always shown
    for confirmation.
21. A write proposal must match the entity named by the user and an identifier
    present in authoritative MCP context before it can reach human approval.
    Reopening an Action never changes the status of its Plot.
22. Human approval resolves exactly one pending write. After MCP returns success
    or the user declines, the host ends that write cycle deterministically and
    never asks a model whether the same mutation should be proposed again.
23. Renaming a Trama or Case changes only its title. Its stable identifier,
    hierarchy, operational context, actions, open loops, and history are
    preserved.
24. An operational priority report includes every active Action and every open
    OpenLoop from active Plots. Action bands derive deterministically from the
    effective score (high at 75+, medium at 45–74, low below 45); OpenLoops use
    a separate context band and never receive an invented numeric priority.
25. An entity may own multiple persistent Conversations. The default local
    profile may retrieve previous Conversations only from that same entity;
    related or global context requires explicit user authorization.
26. A ConversationMessage records what was said, while a ConversationOperation
    separately records what the model proposed and whether it was approved,
    declined, executed, or failed. Neither record establishes real-world truth.
27. Expiring an inference runtime session never deletes its persistent
    Conversation, messages, context links, or operation history.
28. When an Action is the authoritative focus, the host derives its allowed
    workflow from persisted state before inference. The model may choose only
    an allowed operation and cannot change the target Action implicitly.
29. Suggested workflow actions are conversation starters, not commands. A user
    selection still requires natural-language interpretation, host validation,
    individual approval, and a successful audited MCP write.
30. Renaming an Action changes only its title. Its stable identifier, Plot
    relationship, state, deadline, progress log, and audit history are preserved.
31. A batch is one confirmation envelope around two or more explicit Action
    mutations, not one domain mutation. Each item is validated and audited
    separately; failures are reported per item and do not roll back earlier
    successful items.
32. Every write confirmation has a natural-language preview that identifies
    each authoritative target and describes both the intended changes and the
    relevant preserved state. Raw tool arguments are supplementary and cannot
    replace this human-readable consent boundary.
33. Deadline proximity contributes continuously to Action priority and becomes
    dominant near or after the completion deadline. Risk and operational state
    may distinguish Actions, but a distant high-risk Action does not make an
    imminent dated commitment disappear from the priority surface.
34. Every newly created Action belongs to an open OpenLoop that requires user
    action. If the caller does not supply one, Trama creates it atomically from
    the Action context. Legacy Actions without an OpenLoop remain readable.
35. An open OpenLoop records one binary operational distinction: it either
    requires action from the user or is waiting only on an external party or
    event. Actions cannot be attached to the latter.
36. A conversational workflow is derived from the authoritative persisted
    entity and its current state. Browser scope identifiers may request a
    workflow, but cannot supply, alter, or authorize its allowed operations.
