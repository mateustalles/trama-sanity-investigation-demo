# Demo 1 readiness

Status on October 4, 2026: native Knowledge Base demo deployed with verified
HTTPS, anonymous-access boundaries and a signed-in restricted-judge HTTP
walkthrough. Password-based browser sign-in and the recorded video remain
pending. This is the first
delivery, a read-only investigation agent. The player-led Delta timeline and
mind map belong to the separate game concept in `sanity-investigation-game-v2.md`.

## Current agent flow

The page introduces a fictional checkout incident, offers four starting
questions and two advanced questions, and accepts free-form input. The server
uses the existing ready pilot KB `kbkpWkNaMVN6` through Sanity Context MCP's
native `knowledge_base_search`, requesting five complete entries. It forwards
the complete returned text to OpenAI `gpt-6-sol` and shows the answer,
qualified conclusion, limitations, actual query, tool arguments, context,
usage and latency.

The native tool describes keyword/BM25 search over built KB content, not
embedding similarity. Exact suggested-question matches have prewritten query
terms; any other question goes verbatim. There is no host reranking, source
filtering, character cap, original-document follow-up or keyword fallback.
Each question is independent, not a persistent conversation or State update.

The displayed entries are generated interpretations, not independently
verified originals. Source references do not certify claim support. An empty
or failed search does not trigger an answer-model call. The agent cannot
approve a Delta, change Trama State or access the personal organizer.

## Validation completed

On October 4, the current offline validation passed 233 tests: 158 application
tests and 75 Node script tests. Workspace typecheck and production builds on
Windows and Linux passed. The Linux deployment uses Node 24.19, pnpm 11.7 and
Next.js 16.3.5, with one build worker for the small VPS.

A live native-query smoke asked “What might explain the checkout failure?”
through the verbatim free-form path. It forwarded the complete 14,093-character
KB response and recorded 3,916 input tokens, 295 output tokens and 7.285 seconds
total latency. This is one checked flow, not a benchmark success rate or proof
that every free-form query is supported.

The verified public URL is
https://trama.beautyqueenz.com/poc/sanity/investigate. Its login returns HTTP 200;
an anonymous investigation request redirects with 307; an unsigned paid API
request returns 401; and an unrelated operational API returns 403. TLS and
these boundaries are verified.

A temporary authenticated session for the existing restricted judge also
returned page 200, paid native API 200 and operational write API 403. Its curated
question used the fixed query and forwarded all 13,312 returned characters;
OpenAI reported 3,701 input and 127 output tokens with 4.480 seconds total
latency. The session was signed out after testing. No password reset or account
metadata change was made. The password form and password-based browser sign-in
remain untested; this HTTP smoke does not certify that handoff.

The completed frozen comparison has 160 answers over 40 cases, two arms and
two models. Original PASS totals remain OpenAI KB 37/40 versus keyword 32/40,
and Qwen KB 30/40 versus keyword 27/40. The separate offline UTC grading audit
promoted exactly three OpenAI answers, giving 38/40 versus 34/40. It made no new
model or retrieval calls and did not overwrite the original run. See
[the grading audit](kb-search-grading-audit.md) and
[the methodology](sanity-kb-search-model-comparison.md).

The two arms supplied different representations and context sizes; KB used
roughly four times the input tokens. Seven cases had shared application State,
and one repetition does not measure variance. Manual review is still required
for semantic support. These results are not a universal retrieval claim.

## Judge access

The approved dedicated alias account was provisioned on September 29 with
server-owned restricted metadata and expires on October 13, 2026. No existing
account was modified. Its password-setup file and any recovery link are private,
not submission artifacts. Verify password setup and password-based browser
access before sharing credentials; do not recreate the existing account to
deploy the app.

Hosted access requires `TRAMA_HOSTED_TENANCY_READY=true`, Supabase Auth and
the judge quota configuration. Production also sets
`TRAMA_DEMO_REQUIRE_JUDGE=true` and a server-owned `TRAMA_DEMO_OPERATOR_ID`.
Only the restricted judge role or the designated operator can use the paid
investigation endpoint; arbitrary authenticated accounts are not admitted.
The restricted role allows only authentication
and read-only demo routes. Database membership and application guards deny
operational Workspace access. Its persistent atomic quota permits 60 questions
total and six per ten minutes; missing configuration fails closed. The ordinary
in-memory route limit remains only a safety backstop, not a distributed quota.

The original judge-access migration was applied directly by its provisioning
script, not registered by that script in Supabase migration history. Reconcile
that history before a future CLI migration push; deployment does not justify
resetting or replacing the database.

## Remaining publication gates

1. Complete password setup, password-based browser sign-in and private
   credential handoff. The temporary restricted-judge HTTP session verified
   paid access and denied writes, not the password form or every quota edge.
2. Inspect a failure or insufficient-context path without substituting a canned
   answer, and manually review support for the filmed answer.
3. Inspect the English UI, loading and error states, keyboard access and mobile
   layout. Keep generated context visibly separate from verified originals.
4. Record a real three-minute walkthrough without secrets or recovery links.
   The Path One template accepts a video or a deployed link; use the video as
   the primary presentation and verified hosted access as a complement.
5. Sync the validated public source with the deployed version and confirm the
   repository website field. The description and post have been updated;
   include project ID `swuqfubs` and safe judge testing instructions. Keep
   credentials private.

See [the delivery checklist](../demo/delivery-one-checklist.md) for the final
gates and [the setup guide](../demo/README.md) for operation. Historical
September GROQ smoke checks in `sanity-live-agent-demo.md` concern the earlier
original-source route, not proof that the current native demo was exercised.

No game scoring, hidden answer key, persistent player progress or Delta
application is part of Demo 1. Do not change datasets, build another KB or
broaden access to personal Tramas to satisfy this checklist.
