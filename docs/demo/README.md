# The Checkout Investigation — Trama × Sanity

A read-only investigation agent demo. Explore a fictional
checkout incident, ask your own questions, and inspect the original records
behind the answer. The current research corpus contains 145 synthetic records;
this is a recorded pilot count, not a live count displayed by the application.

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
your own words. Read the originals before accepting a conclusion. A plausible
answer is not proof of root cause.

## What Sanity does

The host queries a **Sanity Context MCP endpoint in GROQ mode with embeddings**.
It searches the question and, when useful, model-planned semantic facets.
The model does not write arbitrary GROQ: the host controls the query templates
and fixes the synthetic Workspace and case scope. Selected source IDs are used
to fetch exact Content Lake originals. At most ten originals and 12,000 source
characters reach the answer stage.

The answer model is currently `gpt-6-sol` through the OpenAI Responses API.
The page exposes original bodies, source identifiers, hashes, omissions,
retrieval traces, and uncertainty. A keyword candidate comparison is also
shown; it is not a second answer or a general accuracy claim. Source integrity
checks do not establish that every cited statement is semantically supported.
The current demo does not answer from generated Knowledge Base summaries.

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
SANITY_CONTEXT_PILOT_GROQ_MCP_URL=<authorized Context GROQ MCP endpoint>
```

The endpoint must expose the demo's `evidenceSource` schema and synthetic scope
(`workspaceId=synthetic-benchmark`,
`scopeId=payment-incident-2026-09-18`), with embeddings ready. An unrelated
endpoint is not a drop-in replacement. See
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
data. Each investigation may make several paid model/retrieval calls.

## Hosted access for judges

Deploy a stable HTTPS build with Supabase Auth, operational tenancy migrations,
and `TRAMA_HOSTED_TENANCY_READY=true`. Follow
[the hosted setup guide](../hosted-beta-setup.md). Secrets belong in the hosting
provider's server environment, never in `NEXT_PUBLIC_` variables.

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
The player-led Delta game remains a separate concept, not a feature of this demo.

## MVP scope

The published app exposes the investigation and its authentication flow.
The personal organizer, product chat, settings, and operational write APIs are
not exposed. Legacy product components remain in the source tree, but the route
boundary redirects other pages to the investigation and rejects unrelated API
calls. Operational product services are disabled in this distribution.
