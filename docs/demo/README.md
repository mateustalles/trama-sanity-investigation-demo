# The Checkout Investigation — Trama × Sanity

A read-only investigation agent demo. Explore a fictional
checkout incident, ask your own questions, and inspect the generated KB context
behind the answer. The current research corpus contains 145 synthetic records;
this is a recorded pilot count, not a live count displayed by the application.

[Open the hosted demo](https://trama.beautyqueenz.com/poc/sanity/investigate).
Sign in using approved test access. The paid investigation endpoint accepts
only the restricted judge role or the server-designated demo operator, not
arbitrary Supabase accounts. Passwords are not published in this repository.

## The case

A checkout release was followed by an increase in failed transactions. The
archive contains deployment notes, provider measurements, address samples,
fraud reports, and follow-ups from different dates. Some are relevant; others
describe different events. Your goal is to distinguish observations from
explanations and identify what the available evidence actually supports.

Try questions such as:

- What happened during the incident, and when?
- What changed in the deployment?
- What do the Provider A measurements tell us?
- What evidence supports or weakens alternative explanations?

Use the page's suggested prompts as starting points, then ask follow-ups in
your own words. Each question retrieves context independently; the demo is not
a persistent conversation or an evolving State. KB context points back to
source records, but the UI does not fetch or verify those originals. Inspect
them separately before a consequential conclusion. A plausible answer is not
proof of root cause.

## What Sanity does

The demo reads the existing pilot Knowledge Base through a **Sanity Context
MCP endpoint**, using the native `knowledge_base_search` tool with
`return: "entries"` and `limit: 5`. It forwards the complete generated context
to OpenAI `gpt-6-sol` without host reranking, source filtering, text truncation,
a GROQ read of originals or a keyword fallback. One generated entry may
reference several original documents.

The native tool describes keyword/BM25 search over built KB content, not
embedding similarity. Suggested prompts use predefined search terms; a
free-form question is used verbatim as the native query. The UI exposes that
query and its complete response so the behavior is inspectable.

Only exact matches to the six suggested questions use their declared query.
Editing a suggestion or typing a new question switches to the verbatim path.
There is no query-planning model or automatic semantic keyword extraction in
this delivery. Open-ended reasoning and embedding-based retrieval are different
capabilities; this demo uses the former over native KB search results.

The page shows the answer, conclusion, limitations, generated KB context,
tool arguments, usage and latency. Source references in a generated entry are
not independently verified original documents or proof of claim support.
For consequential conclusions, inspect the originals. The separate historical
GROQ/embeddings implementation is retained for research, not called by this demo.

## Record the walkthrough

Use a real running instance and keep the Sanity query and complete returned
context visible. Introduce the fictional incident, ask what changed, challenge
the explanation and ask what remains uncertain. Show actual loading and error
states; do not splice a benchmark answer into the live interface.

A short video is the primary presentation asset; the restricted hosted app is
an additional way to explore. Do not film environment files, API headers,
Supabase recovery links or private login credentials. The
[delivery checklist](delivery-one-checklist.md) contains the three-minute outline
and the publication gates.

## Run locally

Requirements: Node.js 24+, pnpm matching `package.json`, and valid server-side
Sanity/OpenAI credentials. You need access to the configured pilot endpoint;
cloning the repository does not grant access to its private dataset.

```powershell
pnpm install
Copy-Item .env.example .env.local
```

Edit `.env.local` privately. For a local-only walkthrough, set:

```dotenv
TRAMA_HOSTED_TENANCY_READY=false
SANITY_ORGANIZATION_TOKEN=<server-side Context token>
OPENAI_API_KEY=<server-side OpenAI key>
SANITY_CONTEXT_EVIDENCE_MCP_URL=<authorized Context MCP endpoint>
```

The endpoint must authorize the isolated ready KB `kbkpWkNaMVN6`; the server
fixes KB mode and the KB identifier. It must contain only the reviewed synthetic
pilot archive. This is not a general-purpose KB picker or tenant authorization
design. An unrelated endpoint is not a drop-in replacement. The original
Content Lake archive uses `workspaceId=synthetic-benchmark` and
`scopeId=payment-incident-2026-09-18`. See
[the pilot schema and ingestion notes](../experiments/sanity-content-lake-evidence-pilot.md).
Historical ingestion scripts target the original experimental project and some
expect external corpus files: do not run them blindly against another project.

```powershell
node scripts/start-sanity-demo.mjs .env.local 3001
```

Open [the app](http://127.0.0.1:3001/). The homepage opens the investigation
directly; `/poc/sanity/investigate` also remains available.
The launcher binds to loopback only. It reads credentials from the supplied
file without copying them into the repository. Local development allows this
demo without sign-in; it is **not** suitable for public exposure.

Questions are sent to Sanity and OpenAI. Do not submit personal or confidential
data. A nonempty context result is followed by a paid answer-model call.

## Hosted access for judges

Deploy a stable HTTPS build with Supabase Auth, operational tenancy migrations,
and `TRAMA_HOSTED_TENANCY_READY=true`. Follow
[the hosted setup guide](../hosted-beta-setup.md). Secrets belong in the hosting
provider's server environment, never in `NEXT_PUBLIC_` variables.

The live deployment also sets `TRAMA_DEMO_REQUIRE_JUDGE=true` and a server-owned
`TRAMA_DEMO_OPERATOR_ID` for the approved operator. These are admission controls,
not browser-selectable roles. See [VPS hosting](vps-hosting.md) for the current
production arrangement and verification boundaries.

The restricted judge role uses server-owned `trama_access=sanity_demo_judge`
metadata, expires after 14 days, and permits only authentication and demo
routes. Application guards and database membership checks deny operational
Workspace access. A persistent atomic quota permits 60 questions total and
six per ten minutes. Missing quota configuration fails closed.

Administrators can inspect and provision a **new** dedicated account:

```powershell
node scripts/provision-sanity-demo-judge.mjs plan judge@example.com .env.local
node scripts/provision-sanity-demo-judge.mjs create judge@example.com .env.local https://your-demo.example
```

The create command applies the judge-access migration, creates a restricted
Auth account, and saves a private password-setup link under ignored
`.trama/runtime/sanity-demo-judge-setup.json`. It refuses existing accounts and
never prints a password or token. It does not send an invitation email. Open
the private setup link and choose a password; share credentials privately,
not in the write-up. The script applies SQL directly, so reconcile Supabase
migration history before a later CLI migration push.

Before sharing, test the signed-in flow, denied personal routes, quotas, and
source access on the actual deployment. A local URL, a GitHub URL, and a
temporary tunnel are not equivalent to a production-hosted application.

## Validate and understand the limits

Tests live in `__test__/`, organized by source module. The main test command
runs both Vitest and the Node script unit suites.
See [how we test the agent](../testing.md) for mock coverage, live benchmarks,
and manual audit. `pnpm test:ai` runs the offline AI harness without provider keys.

```powershell
pnpm test
pnpm typecheck
$env:NEXT_PUBLIC_SANITY_PROJECT_ID="<your public project ID>"
$env:NEXT_PUBLIC_SANITY_DATASET="<your dataset name>"
pnpm build
```

The public Sanity identifiers must also be present at build time because the
broader `/poc/sanity` page initializes a Sanity client. The local demo launcher
loads `.env.local` for its own process; `pnpm build` does not use that launcher.
Alternatively configure build-time variables in your hosting provider.
Tests use mocks; they do not certify live endpoint access or answer correctness.
Live smoke testing consumes provider quota. Historic benchmark run artifacts
and local logs are intentionally excluded from Git. Research notes describe
selected synthetic comparisons, not guaranteed performance on arbitrary data.
The [player-led Delta game](game.md) is a separate delivery, not a feature of
the read-only agent.
Use [the delivery checklist](delivery-one-checklist.md) to prepare the Path One
post and walkthrough. A temporary tunnel is a testing URL and only stays alive
while its server and tunnel processes are running; do not describe it as stable
production hosting.

## MVP scope

The published app exposes the investigation, browser-local game and
authentication flow.
The personal organizer, product chat, settings, and operational write APIs are
not exposed. Legacy product components remain in the source tree, but the route
boundary redirects other pages to the investigation and rejects unrelated API
calls. Operational product services are disabled in this distribution.
