# ADR 009 — Focus-based deterministic agent workflows

## Decision

Trama uses a deterministic host workflow when an Action is the authoritative
screen focus or is explicitly named. Persisted Action state determines the
allowed operation set before the model receives tools.

The web client also projects one explicit conversational scope from the
visible screen. Focus precedence is: expanded Action, entity selected on the
investigator map, visible Plot or Case, Calendar, then the investigator desk.
Each non-Action scope exposes a bounded set of contextual prompts; an Action
scope exposes its mutation workflow. DOM attributes carry only identifiers,
titles, and view type. MCP context remains authoritative for operational data.
The client observes this projection continuously: navigation and opening or
closing an Action invalidate the previous session and immediately refresh the
scope, conversation list, and bounded suggestions. A context explicitly
opened from the investigator map remains pinned until the user returns to the
whole-screen context.

For an active Action, the initial paths are:

- record a reported step without changing state;
- record progress and wait for an external response;
- complete or otherwise terminate the Action with an explicit outcome;
- reschedule the completion deadline;
- rename the Action while preserving identity and history.

For a terminal Action, the only mutation path is reopening it. Existing domain
rules may additionally require a new deadline. If the user's message does not
support an allowed path, the agent asks one minimal clarification.

The graphical chat exposes these paths through a guided mode. Selecting one
opens a bounded form containing only the required fields. The host converts
that form into a typed write proposal without model interpretation, validates
it against the focused workflow, and presents the existing natural-language
confirmation. It never calls MCP, grants write permission, or approves a
mutation merely because the user selected a path.

## Enforcement

The host filters write tools to those allowed by the workflow and validates the
exact Action ID and target resolution before an operation can reach the normal
confirmation boundary. Authoritative entity validation and audited MCP writes
remain mandatory second layers.

## Consequences

- Smaller local models choose among fewer semantically valid paths.
- Prompt interpretation remains useful without making the model the workflow
  engine.
- Guided Action updates remain usable even when the local model is unavailable
  or unreliable; the model is not involved between form submission and human
  confirmation.
- Workflows can later be added for Plot and OpenLoop focus without enlarging
  the first Action workflow.
- Suggestions and enforcement share one provider-neutral contract.

## Evaluation

Guided-mode acceptance uses a separate Agenda-based contract suite. Each case
contains an authoritative visible Action, its persisted state and deadline, a
typed guided request, and the exact expected MCP proposal or rejection. This
suite does not invoke an LLM because intent and operation have already been
selected by the user; it measures workflow, validation, and payload safety.

Free-conversation model evaluation remains a separate diagnostic for optional
language understanding and must not be used as the reliability score of guided
mutations.

Model comparisons receive the typed screen projection that the browser would
produce, followed by the authoritative MCP dashboard the host resolves from
it, including candidate entity IDs, persisted state, deadline, focus,
conversation facts, and the exact workflow derived for that focus. Raw DOM is
not treated as authoritative. Human labels remain outside the inference prompt. Both
development and holdout sets use the same contract; only development failures
may influence prompt or workflow tuning.
