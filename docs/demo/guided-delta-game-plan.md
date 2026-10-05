# Guided Delta game: next-step proposal

Status: proposed after the Path One submission, not implemented or deployed.
The current game is described in [the walkthrough](game.md). This plan does
not change its notebook format, hosted endpoints, quotas or game state.

## Why this direction

Prewritten investigative questions reduce the blank-page problem while the
player still owns the hypothesis, evidence selection, rationale and decision.
The experience should reward revisable reasoning, not copying an agent's
ready-made conclusion. A question card guides an inquiry; it must not encode
which hypothesis the player should choose.

## Proposed loop

1. Choose a question: establish the sequence, inspect a change, inspect a
   measurement, or challenge an explanation. Reuse the existing declared
   questions and native KB query mapping rather than building a new corpus.
2. Retrieve clues through Sanity's native Knowledge Base search. Show all
   returned entries and their provenance before giving a synthesized answer.
3. Select the entries to add to the Delta. Include challenging material as
   well as supporting material. Write a hypothesis and a rationale.
4. Optionally choose **Review my Delta**. The reasoning model reviews the
   player's draft against only the selected context, with clearly stated limits.
5. The player accepts, revises, leaves open or concludes the branch. Preserve
   the existing triangle transition, return-to-earlier-node, contestation,
   branching and export mechanics. A review never applies a Delta automatically.

Retrieval and review are separate actions. Today's optional game search also
generates an answer and adds the whole KB response as one notebook item; that
is not yet the proposed retrieval-first, individually selectable experience.

## What counts as a clue

Native KB Search returns generated entries. Label cards **Generated KB entry**,
not **Original document**. Preserve the native entry identity/path and complete
text where available. Show source references without treating them as proof.
Keep the full native response inspectable and do not silently rerank, omit,
truncate, fall back or invent entry boundaries with another model.

Inspect the real native response contract before implementing card extraction.
If individual entries cannot be extracted reliably, report that limitation
instead of presenting guessed document cards. Rereading referenced originals
would be a distinct provenance feature, not something the current KB Search
route already does. The six frozen local excerpts remain labeled separately.

## Model review versus a game answer key

The useful first review is about **evidence support**, not an invented distance
to a perfect answer. Use explainable categories such as:

- Supported by the selected context.
- Partially supported.
- Contradicted by selected context.
- Insufficient context to assess.

The model must identify which selected items informed its assessment, explain
the causal leaps, distinguish observation from inference, and suggest what
needs checking next. It must not certify that the whole archive has no other
evidence or turn confidence into a percentage-correct score.

If a win condition is desired, author and manually audit a separate fictional
scenario rubric before implementation. Specify what counts as a correct event
window, a supported mechanism, and appropriately qualified uncertainty. Do not
make "Provider A was the proven sole cause" the target: the shipped sources do
not establish it. Keep that rubric on the server, separate from retrieval and
player-editable browser state. Model feedback can explain the rubric's review,
but must not be the only authority for exact facts or a hidden success score.

## Implementation and validation gates

- Preserve existing browser-local notebooks, ancestry, contested branches and
  export. Version and validate any added persisted review metadata explicitly.
- Preserve restricted authentication, server-only provider credentials and
  atomic shared quotas. Both live actions must have accurate rate-limit and
  timeout feedback; do not retry paid calls automatically.
- Treat context and player text as data, never instructions granting authority.
  Reject review references outside the selected set and validate model output.
- Add deterministic tests for card identity, exact retained text, selection,
  review validation, stale async responses, quotas and unchanged Delta history.
- Test a supported, unsupported and contested draft through the hosted browser.
  Confirm the player can reject feedback and branch without deleting history.
- Update the Path Two writeup only after these behaviors are verified.

## Path Two delivery checklist

The official template asks for What I Built, Demo, Code, My Build Process,
Sanity Project Details, and an optional Agent Session. It asks for a deployed
project link with a walkthrough video or screenshots. Explain prompts, failures
and corrections honestly, not only the final interface.

The current game, frozen-excerpt provenance, local branch model and optional
native KB integration can be shown now, with the remaining hosted-browser
checks disclosed. No Sanity App SDK or Workflows integration exists in this
MVP; neither is required by the challenge. Do not call browser-local history
a Sanity workflow or imply new features in this proposal are already shipped.

Sources: [challenge and criteria](https://dev.to/challenges/sanity-2026-09-16),
[launch post and deadline](https://dev.to/devteam/join-the-sanity-challenge-2500-in-prizes-for-five-winners-514m).
The advertised deadline is October 4, 2026 at 23:59 PDT, October 5 at 03:59
in São Paulo. The challenge page currently displays an Ended badge despite
that announced deadline; publication does not itself certify eligibility.
