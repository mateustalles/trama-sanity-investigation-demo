# Delivery one publication checklist

The first submission is the read-only investigation agent and its Path One
post. The player-led State and Delta game is a separate second submission.
Do not delay the agent submission to add game mechanics.

Lead with a short recorded walkthrough; offer the restricted hosted app as
an additional exploration path once it has been verified. Hosting does not
replace the explanation of the case, the retrieval trace or the limitations.

## Required publication assets

- [ ] Review `docs/experiments/sanity-challenge-writeup.md` as the Path One post.
- [x] Include a verified live demo link **or** an embedded recorded walkthrough,
  as allowed by the Path One template. A localhost address is not a public demo.
  Live URL: https://trama.beautyqueenz.com/poc/sanity/investigate.
- [ ] Link the public GitHub source matching the demonstrated version.
- [x] Update the repository description to describe the read-only KB agent.
- [ ] Confirm the repository website field points to the verified public URL.
- [x] Include Sanity project ID `swuqfubs` and describe the private synthetic
  dataset and KB rather than implying public dataset access.
- [x] Verify the hosted page and paid API with the existing restricted judge
  account through a temporary session, then sign that session out.
- [ ] Complete the password form and deliver judge credentials privately;
  temporary session testing does not verify a password-based sign-in.
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

- [x] Offline tests and typecheck pass with a dedicated monitor: 233 tests on
  October 4 (158 application and 75 Node script tests).
- [x] Production builds pass locally on Windows and on the Linux VPS.
- [x] A live native KB question succeeds with the reviewed configuration:
  complete 14,093-character context, 3,916 input and 295 output tokens.
- [ ] English brief, prompts, loading state, errors, context labels and controls
  render correctly. Generated context is never labeled a verified original.
- [ ] No hidden keyword fallback, host reranking or character truncation.
- [ ] Authentication and quota guards remain in place; secrets stay server-side.
- [x] Public HTTPS boundary verified: login HTTP 200, anonymous investigation
  redirect 307, unsigned paid API 401, unrelated operational API 403.
- [x] Signed-in restricted-judge HTTP walkthrough: page 200, paid native API
  200, operational write API 403. Curated query and full returned context checked.
- [ ] Complete password setup and password-based browser sign-in; the checked
  temporary session did not change the password or account metadata.
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
