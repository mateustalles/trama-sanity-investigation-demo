# Guided Delta game: implementation decisions

Implemented after Path One, following the author's revised direction:
predefined questions, hypothesis alternatives and conclusion strengths, with
player-owned evidence selection and an optional model-proposed rationale.
The previous free-text prototype's version-1 notebook and branch history are
preserved. [Player walkthrough](game.md).

## Responsibility boundaries

- **Sanity:** native KB Search over its existing generated build; declared
  question-to-query mapping, five entries requested, full response preserved.
- **Presentation:** deterministic Markdown sections with honest generated
  provenance, stable content/query IDs and eight-hour HMAC receipts.
- **Player:** chooses A/B/C, selects clues, adopts or rejects the rationale,
  chooses conclusion strength and explicitly accepts a Delta.
- **OpenAI:** reviews only selected, authenticated context using strict
  structured output. Returns support category, public rationale, limitations,
  next check and selected references. No hidden answer key or truth meter.
- **Local game:** preserves accepted nodes, ordered events, ancestry, returns,
  contested assumptions and branches. It never writes operational State.

Native KB output does not supply separately verified original documents in
this route. Card boundaries are presentation boundaries, not claims about
native entry identity. No local retrieval fallback, silent clipping or second
source-ranking model is used. Source verification is a separate future feature.

## Safety and compatibility

Both live actions retain trusted authentication, judge-only access and the
same atomic shared quota. Invalid questions and receipts are rejected before
spending quota. Cross-origin requests are rejected against the proxy's public
Host. Provider keys stay on the server. Frozen evidence bodies resolve from
host-owned records. AI references outside the selected set are rejected.

Changing hypothesis or selection invalidates draft rationale and feedback.
One in-flight request is allowed; a reset aborts waiting and invalidates its
result so it cannot overwrite a fresh notebook. Provider failures never accept
or change Deltas. Browser aborts do not promise a provider billing refund.

The notebook remains version 1; receipts are optional for restoring older
history. Older generated material without a valid receipt is still readable
but must be retrieved again to enter a live review. Review proposals are not
persisted as authority. A receipt authenticates delivery, not truth.

## Tests

Deterministic tests cover exact context preservation, stable identities,
receipt tamper/expiry, host-owned frozen records, selected-only prompts,
strict review output, invented references, absent model calls during retrieval,
no fallback, authentication, origin checks, quotas and provider timeouts.
Lifecycle tests cover reopening, branching, contestation, restore and reset.
Real provider/browser verification is recorded separately from unit tests.

## Deliberately outside this MVP

No audited winning score, multi-user sync, operational State writes, automatic
Delta approval, image inference, per-player KB build, App SDK or Workflows.
The interaction demonstrates revisable decisions, not that one model can
certify the only correct cause.
