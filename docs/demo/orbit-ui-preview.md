# Orbit UI: post-submission preview

This UI is developed on `codex/delta-game-orbit-ui`, separate from the submitted
version on `main`. It does not change the judges' deployed game, KB, endpoints,
quotas, provider prompts or operational Trama State. The original Path Two
template and screenshots describe that submitted version.

## Flow

1. Choose the line of inquiry. Suggestions list questions not yet explored on
   the active branch first; explored is not the same as resolved.
2. Click **Ask Sanity for Clues**. No curated starting clues appear in a new
   draft. Native KB Search supplies the context; it makes no OpenAI answer call.
3. Hover or focus an orbiting clue to read its full text. Tap/click is available
   on touch screens. Add or remove clues; there is a ten-clue selection limit.
   The full unmodified search response and declared query remain inspectable.
4. Choose a hypothesis, then **Done selecting · generate rationale**. This is
   one explicit model action, not a paid request for every checkbox or hover.
   The model still assesses the selected context against the causal hypothesis;
   the line of inquiry is saved as the Delta's question.
5. Read the proposal and its limitations. Adopt or dismiss it, choose conclusion
   strength, then **Confirm Delta**. A cautious local template remains available.
6. The confirmed triangle moves into the smaller left-hand position and a new
   draft opens on the remaining questions. Any question can be revisited.

Core actions and readers use floating panels over the triangle. Long context
scrolls inside its reader, not down to a separate page section. Keyboard focus,
Escape dismissal, click/tap alternatives and reduced-motion preferences are
supported. The Delta map, old evidence, export, reset and quota details also
open inside the board.

## Compatibility and failures

Version-1 notebooks remain readable, including old frozen source excerpts.
Archived clues remain inspectable in Delta history but are not silently offered
as the current draft's live search results. No schema migration or data deletion
is required. New/reset notebooks start empty. Reset requires confirmation and
does not renew server-side allowance.

Changing a question clears the current draft and its search packet, not accepted
history. Changing clues/hypothesis invalidates rationale and conclusion.
Provider failures preserve selections; a reset invalidates in-flight replies.
Invalid stored notebooks are not automatically overwritten. Drafts and pending
proposals are still not saved. Generated context remains labeled as interpretation,
not independently verified original proof.

## Validation

New offline tests cover empty starts, no archived fallback, current-clue review
gates, ten-clue selection, stale-rationale invalidation, remaining-question
suggestions after branching/contestation and old notebook compatibility.
On October 5, 2026, all 286 offline tests passed (202 Vitest + 84 script tests),
including nine new UI-flow tests. Workspace typecheck and production build passed.
An independent read-only test monitor confirmed these results.

Browser checks used the loopback-only development preview at
`http://127.0.0.1:3003/poc/sanity/game`. Two native Sanity searches and one OpenAI
rationale request succeeded. The check confirmed no starting clues, explicit
question/search gating, full clue text, manual rationale adoption, accepted-Delta
preservation, the next issue-first draft, remaining/revisitable questions, history
inspection and notebook restoration after reload. A previously saved version-1
notebook remained readable; it was not reset. Keyboard focus opened a full-text
reader and Escape closed it without changing the selection.

At 1280 × 900 and 375 × 812, the document matched the viewport dimensions without
horizontal or page-level vertical scrolling. Long text scrolls inside its panel.
These are focused browser smoke checks, not an exhaustive accessibility audit.
No new benchmark, KB build or live dataset mutation is part of this UI change.
