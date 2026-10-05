# Delivery one publication checklist

The first submission is the read-only investigation agent and its Path One
post. The player-led State and Delta game is a separate second submission.
Do not delay the agent submission to add game mechanics.

The restricted hosted app is verified and supplies the Path One demo link.
A short recorded walkthrough is recommended, not a reason to delay this post:
the template accepts a deployed URL or video. Explain the case, retrieval
trace and limitations in either presentation.

## Required publication assets

- [ ] Review `docs/experiments/sanity-challenge-writeup.md` as the Path One post.
- [x] Include a verified live demo link **or** an embedded recorded walkthrough,
  as allowed by the Path One template. A localhost address is not a public demo.
  Live URL: https://trama.beautyqueenz.com/poc/sanity/investigate.
- [x] Link the public GitHub source matching the demonstrated version.
- [x] Update the repository description to describe the read-only KB agent.
- [x] Confirm the repository website field points to the verified public URL.
- [x] Include Sanity project ID `swuqfubs` and describe the private synthetic
  dataset and KB rather than implying public dataset access.
- [x] Verify the hosted page and paid API with the existing restricted judge
  account through a temporary session, then sign that session out.
- [x] Create a unique password for the existing restricted judge and verify
  password-based sign-in in the hosted browser. Owner access remains unchanged.
- [ ] Deliver judge credentials privately or include sufficient testing
  instructions in the submission. The rules do not require a public password.
- [x] Remove all publication placeholders before posting with `sanitychallenge`.
- [ ] Optionally add a curated, redacted public agent-session link. This is
  encouraged, not mandatory. Never share the entire private research chat blindly.

The [challenge announcement](https://dev.to/devteam/join-the-sanity-challenge-2500-in-prizes-for-five-winners-514m)
sets the deadline at October 4, 2026, 11:59 PM PDT, equivalent to October 5,
2026, 03:59 in São Paulo. Each path requires its own post.

## Three minute walkthrough

1. Introduce the fictional incident and archive. Do not reveal the cause in
   the initial brief; the visitor is the investigator.
2. Ask what changed before the failures. Show the actual native KB search
   arguments and generated entry text, not a canned benchmark answer.
3. Ask what observations support or challenge the explanation. Show the
   answer's limits and source references. Explain that referenced originals
   still need inspection before a consequential conclusion.
4. Ask what is still missing before confirmation. Keep a plausible hypothesis
   separate from proved causality or an applied operational Delta.
5. Finish with the read-only boundary and the observed comparison. State that
   KB context cost more input tokens and the experiment had one repetition.

Use the suggested questions for the first recording, because their fixed
queries are inspectable and the code explicitly distinguishes them from the
verbatim free-form path. Each question is independent; do not imply the current
demo remembers prior answers or builds a State. Keep secrets and private
authentication links out of the recording.

## Final local checks

- [x] Offline tests and typecheck pass with a dedicated monitor: the current
  current friendly-demo integration has 260 tests on October 4 (184 application
  and 76 Node script tests), after the prior 243-test release.
- [x] Production builds pass locally on Windows and on the Linux VPS.
- [x] A live native KB question succeeds with the reviewed configuration:
  complete 14,093-character context, 3,916 input and 295 output tokens.
- [ ] English brief, prompts, loading state, errors, context labels and controls
  render correctly. Generated context is never labeled a verified original.
- [x] No hidden keyword fallback, host reranking or character truncation.
- [x] Authentication and quota guards remain in place; secrets stay server-side.
  Six questions per minute and 600 total are enforced; migration preserves usage.
- [x] Public HTTPS boundary verified: login HTTP 200, anonymous investigation
  redirect 307, unsigned paid API 401, unrelated operational API 403.
- [x] Signed-in restricted-judge HTTP walkthrough: page 200, paid native API
  200, operational write API 403. Curated query and full returned context checked.
- [x] Complete password setup and password-based browser sign-in. Only the
  restricted judge password was changed; owner credentials were not modified.
- [x] Original benchmark artifacts are unchanged; grader replay is separately
  versioned and linked to the source run.

## Second delivery boundary

Keep the game out of the Path One feature claims. The game should let players
formulate their own hypotheses, ask questions and construct Deltas. A past
Delta becomes a smaller triangle on the left; the current triangle is central,
with hypothesis, evidence and rationale orbs. Approval adds a node to the
timeline; returning to an earlier node creates a branch rather than silently
rewriting history. Feedback must distinguish facts, uncertainty and evidence
coverage. Any game progress State is separate from authoritative operational
Trama State until an explicitly approved persistence design exists.

The separate protected game is now hosted at
https://trama.beautyqueenz.com/poc/sanity/game. Its feedback is completeness-only,
not an evaluation of closeness to a hidden correct answer. Use its own
[Path Two writeup](../experiments/sanity-challenge-game-writeup.md), not the
agent's feature or benchmark claims.
