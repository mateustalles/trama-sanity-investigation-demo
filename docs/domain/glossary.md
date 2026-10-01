# Domain glossary

## Plot

A bounded context with its own goal, central question, lifecycle, and related
entities. In product language, a root Plot is a **Trama** and a direct child Plot
is a **Caso**. A Trama may be `ongoing` (permanent and never completed) or
`resolvable`. Every Caso is `resolvable`, has a possible ending, and cannot
contain another Caso.

## OpenLoop

An unresolved operational thread inside a Trama or Case. It either requires
one or more Actions from the user, or records that progress currently depends
only on an external person, institution, or event.
The UI label in Portuguese is **Ponta Solta**. An OpenLoop is not an Action: it
explains why work or waiting exists, while an Action is concrete movement
inside that thread. New Actions always belong to an OpenLoop; when no suitable
thread is supplied, Trama creates one implicitly. Legacy Actions without this
relationship remain readable. An open
Hypothesis is not itself an OpenLoop, although it may generate many OpenLoops.
An OpenLoop starts as `open` and may become `resolved` when authoritative
context closes it, or `dismissed` when the user confirms it is no longer
relevant. Closure preserves the original context, a resolution note, and the
time of closure.

## Action

Something that a person or agent must do. Active Actions must always have an
effective priority, reasons for that priority, and a next review date.

## ActionProgress

An immutable, user- or agent-reported step that already happened while an
Action is being carried out. It is a log entry, not a planned checklist item.
It may be appended independently without changing the Action, or accompany a
confirmed state transition such as completion.

## Event

Something alleged, scheduled, or observed in the investigated world.

## AuditEvent

An immutable record of something that changed inside Trama.

## Conversation

A durable chat thread attached primarily to the workspace, a Plot, an OpenLoop,
or an Action. An entity may have multiple Conversations. Its memory scope says
whether inference may use only the current thread, earlier threads on the same
entity, related context, or global context.

## ConversationMessage

An immutable user, assistant, system, or tool utterance persisted inside a
Conversation. Conversation history is operational memory, not proof that a
real-world event occurred.

## ConversationOperation

The durable record of an operation the model decided to propose during a
Conversation. It preserves the tool name, exact arguments, approval lifecycle,
result, and error independently from the Action domain entity it may affect.

## Evidence

Preserved material that supports analysis: text, conversation, URL, file,
image, document, audio, or another record. The artifact may be concrete while
its meaning or probative value remains disputed.

## Hypothesis

A provisional explanation, solution, interpretation, scenario, or candidate
decision investigated within a Plot.

## Finding

A human-approved investigative determination grounded in Evidence. A Finding
may support, contradict, qualify, or remain neutral toward a Hypothesis. The UI
label in Portuguese is **Constatação**.

## Proposal

A governance envelope containing a suggested creation or semantic mutation.
Agents submit Proposals; they do not directly establish facts or conclusions.

## Relation

A typed connection between domain entities. Relations allow one item to inform
multiple Hypotheses without exclusive ownership.

## ReviewRun

A durable, idempotent execution of an operational review. It records its
trigger, policy version, lifecycle, counters, and failure without depending on
the scheduler or agent that initiated it.

## AttentionItem

A durable observation that something requires attention. Its fingerprint keeps
repeated reviews from creating duplicates, and it remains open until the
underlying condition disappears or the user explicitly handles it.

## RequiredInput

A structured request for authoritative information that Trama cannot safely
infer. It records the target, expected answer type, lifecycle, and supplied
answer.

## Notification

A provider-agnostic outbox record expressing an intent to inform the user.
Delivery adapters may use ChatGPT, MCP, email, desktop notifications, or other
channels without changing the domain entity.
