# Sanity investigation game — second delivery concept

Status: design proposal only; no game mechanics or scoring are deployed.

## Player premise

The player receives only the fictional September 18 checkout failure window
and a short story: payments suddenly failed, several teams left records, and
the archive also contains unrelated incidents. Trama starts without a
confirmed cause, a preloaded solution, or the benchmark gold labels. The
challenge is to investigate by asking questions, inspect retrieved originals,
and submit a defensible explanation with remaining uncertainty.

The first delivery's guided prompts teach the retrieval workflow. The game
mode should be a separate route or explicit mode so its spoiler policy cannot
silently alter the current evidence-answer demo.

## Loop

1. **Ask:** The player poses a free-form question. Optional hint tiers suggest
   an investigative *action* (establish timeline, compare evidence, test a
   competing explanation), not the name of the correct document or cause.
2. **Retrieve:** The same scoped Sanity Context MCP semantic search locates
   candidates. Trama verifies exact Content Lake originals and reveals only
   the records used to address that question, along with retrieval limits.
3. **Record:** A local progress board tracks discovered source IDs and the
   player's own notes. Discovering a source is not the same as proving a
   claim; no Case State or Delta is changed.
4. **Conclude:** The player submits a hypothesis, supporting originals,
   counterevidence, and what remains unknown. The game evaluates these axes
   separately and shows an evidence-backed debrief.

## Design boundaries

- The engine's steps are topic-agnostic. This scenario may have its own
  server-side answer key, but incident-specific categories must not become
  hardcoded retrieval intents in Trama. Reuse the existing pilot dataset;
  do not create a new KB per player or copy real Tramas into it.
- Do not expose source IDs, hidden scoring criteria, benchmark gold labels, or
  a ready-made root-cause summary in the initial browser payload. A direct
  question such as “What caused it?” should return the retrieved observations
  and uncertainty, not silently mark the mystery solved.
- Feedback should score evidence coverage, temporal separation, hypothesis
  quality, and uncertainty handling. Do not grade by exact keywords. Require
  human review of semantic support before reporting game accuracy.
- Keep the experience read-only, accessible without time pressure, and
  explicit about fictional data and model fallibility. A browser-session
  progress board can avoid personal-data storage; any server persistence
  would need a separate privacy and authorization decision.

## Acceptance checks before release

- A new player sees only the brief and generic challenge; no answer leaks in
  prompts, HTML, API payloads, or static assets.
- At least three different question paths can uncover the key originals.
- Broad requests that ask for every explanation at once must not be scored as
  complete merely because the model sounds cautious. In the first-delivery
  live smoke, broad prompts missed central originals; the game should detect
  missing evidence coverage and offer a topic-agnostic next-step hint.
- A misleading same-vendor/different-event document can be found and then
  correctly excluded.
- The final debrief distinguishes observation, inference, contradiction, and
  unresolved questions with clickable original-source provenance.
- Repeated players cannot mutate Sanity data or Trama State, and the game has
  a bounded request/token budget and a clear reset path.
