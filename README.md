# Trama × Sanity — The Checkout Investigation

Find the evidence. Test the story.

A read-only investigation agent for a fictional checkout incident. Ask your own
questions, retrieve original records through Sanity Context MCP, and inspect
what the evidence supports, what is inferred, and what remains uncertain.

## Get started

**[Setup and walkthrough](docs/demo/README.md)**

Requirements: Node.js 24+, pnpm, and authorized server-side Sanity Context and
OpenAI credentials. Cloning this repository does not grant access to the private
pilot dataset.

```powershell
pnpm install
Copy-Item .env.example .env.local
# Configure the server credentials privately.
node scripts/start-sanity-demo.mjs .env.local 3001
```

Open `http://127.0.0.1:3001/`. The app opens the investigation directly.
Hosted deployments require sign-in; local development is loopback-only.

## Explore the case

- What happened, and when?
- What changed shortly before the failures?
- What do the provider measurements tell us?
- Which records support or challenge competing explanations?

The case brief, suggested prompts, original source viewer, retrieval trace,
and qualified answers are part of the MVP. It does not expose the personal
organizer, operational chat, or Delta write endpoints.

## Architecture and research

- [Demo guide and access restrictions](docs/demo/README.md)
- [Challenge write-up draft](docs/experiments/sanity-challenge-writeup.md)
- [Retrieval architecture and prior walkthrough](docs/experiments/sanity-live-agent-demo.md)

This distribution includes Trama's shared packages and historical research code.
Some legacy components remain in the source tree for reference, but their
product routes are unavailable in this MVP. No private repository history,
credentials, personal databases, local benchmark logs, or judge setup links
are included. Historical notes describe earlier prototypes, not every current
screen.

## Validation

Tests are centralized in [`__test__/`](__test__/README.md), with subdirectories
mirroring the source modules. `pnpm test` runs both the TypeScript suite and the
script unit tests.

```powershell
pnpm test
pnpm typecheck
$env:NEXT_PUBLIC_SANITY_PROJECT_ID="<your public project ID>"
$env:NEXT_PUBLIC_SANITY_DATASET="<your dataset>"
pnpm build
```

Questions are sent to Sanity and OpenAI and may incur provider charges. Do not
submit personal or confidential data. Source integrity checks are not proof
that every claim is semantically supported; read the originals.
