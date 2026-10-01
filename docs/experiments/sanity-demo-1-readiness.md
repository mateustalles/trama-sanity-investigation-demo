# Demo 1 readiness — source-grounded investigation agent

Status: local prototype, 29 September 2026. This is the **first delivery**;
the player-led Delta timeline and mind map belong to the separate game concept
in `sanity-investigation-game-v2.md`.

## Judge access implementation — 29 September

The approved alias account was provisioned with server-owned restricted metadata
and expires on 13 October 2026. The migration was applied directly by the
provisioning script; it is checked in but not registered by that script in
Supabase migration history. Reconcile migration history before a future CLI push.
No existing account was modified. Its ignored setup file is private, not a
submission artifact. Password setup and a signed-in HTTP walkthrough remain
to be completed by the owner before sharing judge access.

Validation: 152 tests and workspace typecheck passed. Database checks confirmed
denied judge Workspace membership, six requests per ten-minute window and the
60-request total cap, with test usage rolled back. These are not a substitute
for testing the authenticated browser flow on the final public deployment.

## Ready for a local walkthrough

- The English `/poc/sanity/investigate` page gives a fictional incident brief,
  four starting questions, optional advanced questions, and free-form input.
- The read-only host fixes the pilot scope. Sanity Context MCP searches
  candidates, the host verifies exact Content Lake originals, and GPT-6 Sol
  answers from the bounded original-source packet. The page exposes the
  answered question, original bodies, provenance, retrieval trace, omissions,
  and uncertainty. It cannot approve a Delta or mutate Trama State.
- The previous four-question live smoke and two manually reviewed outputs are
  recorded in `sanity-live-agent-demo.md`. They are useful walkthrough
  evidence, not a success-rate estimate for arbitrary questions.

## Not yet a shareable judge demo

The working `127.0.0.1:3001` address is local, not a public URL. When hosted
authentication is configured, the page requires a signed-in user. The API's
six-requests-per-identity-per-ten-minutes guard is in memory and is **not** a
distributed quota or a public-abuse defense. The server requires Sanity and
OpenAI credentials; visitors must not supply keys in the browser. The
145-record label reflects the verified pilot round but is not a live corpus
count. None of these points should be obscured in the write-up or video.

The selected access path is a **limited judge test account**. Create a
dedicated Supabase Auth user through `scripts/provision-sanity-demo-judge.mjs`; do
not share an owner's password, a personal account, an API key, or a magic-link
session. The user should receive only its automatically created empty
Workspace, but server-owned `trama_access=sanity_demo_judge` metadata denies
access to that Workspace through SQL RLS and application guards. The account
can only reach authentication pages and the read-only pilot page/API. It expires
after 14 days and has an atomic database quota of 60 questions total and six
per ten minutes. Missing quota configuration fails closed. The route's host-fixed
synthetic scope means that no personal Trama data is needed for this demo.

Before offering access, deploy a stable HTTPS build with hosted tenancy enabled,
provision the judge account, set its password through its private recovery link,
verify the pilot credentials and corpus identity there, and rerun the suggested
questions while signed in as that user. Do not expose the local development
server or a tunnel as the substitute for access control. The in-memory limit
remains a safety backstop for ordinary users; judge quotas are persistent in
Supabase. The private setup link is saved under ignored `.trama/runtime/` and
must never be published in the write-up or repository. If interactive access is not ready, publish a
short recorded walkthrough plus code and be explicit that the live agent
requires access; whether that meets the contest's submission requirements must
be checked against the current rules.

## Final quality gate

1. Confirm that only synthetic pilot records are reachable and that tokens
   stay server-side. Ask visitors not to submit personal or confidential data;
   their question is sent to Sanity Context and OpenAI.
2. Recheck the four starting questions and the two advanced paths on the
   deployment. Record failures and missing or budget-omitted originals rather
   than substituting a canned answer.
3. Manually inspect whether each cited original *supports the claim*. The
   host verifies source identity and rejects invented source names, but it
   does not prove the semantic correctness of an answer.
4. Verify hosted sign-in with the limited judge account, its empty Workspace,
   quota behavior, mobile layout, keyboard access, and a clear failure state
   on the actual judge-facing URL.
5. Make the claim narrowly: Sanity Context helps locate evidence in a scoped,
   noisy archive and exposes provenance. Existing pilot comparisons do **not**
   establish that semantic retrieval generally outperforms keyword retrieval.

No game scoring, hidden answer key, persistent player progress, or Delta
application is part of Demo 1. No production endpoint, dataset, or access
policy should be changed just to satisfy this readiness checklist.
