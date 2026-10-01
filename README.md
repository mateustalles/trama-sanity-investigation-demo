# Trama × Sanity — The Checkout Investigation

This repository is a standalone source snapshot for the Sanity Challenge demo.
It does not include the private Trama repository's Git history, credentials,
personal databases, benchmark logs, or judge access links.

**[Start here: English demo setup and walkthrough](docs/demo/README.md)**

Ask questions about a fictional checkout incident. Sanity Context MCP retrieves
original evidence; the agent answers from those records and exposes its sources
and uncertainty. The demo is read-only and the interface is in English.

```powershell
pnpm install
Copy-Item .env.example .env.local
# Configure server-side Sanity Context and OpenAI credentials privately.
node scripts/start-sanity-demo.mjs .env.local 3001
```

Then open `http://127.0.0.1:3001/poc/sanity/investigate`. Access to the private
pilot dataset is not supplied by cloning this repository. Read the linked guide
for endpoint requirements, suggested questions, hosted judge access, costs,
and limitations. This repository is source code, not a public hosted app.

The rest of this README describes the broader Trama foundation included to
support the demo. Its general product interface remains Portuguese-first.

**An AI-first, context-aware personal organizer, prioritizer, and investigator that remembers what matters, connects the dots, and turns life’s complexity into clear priorities and follow-through.**

Trama is an AI-first operational memory for your personal life. It connects scattered context, identifies priorities and risks, tracks commitments, investigates open questions, and keeps important things from falling through the cracks.

The core is local-first and LLM-agnostic. Ollama is the first local AI provider; model output is treated as a schema-validated proposal and never bypasses audited domain commands.

## Trama × Sanity — investigation demo

Start with the [English demo guide](docs/demo/README.md). The self-contained
demo lets you investigate a fictional checkout incident by asking your own
questions, retrieving original evidence through Sanity Context MCP, and
inspecting the answer's sources and limitations. It is read-only: it does not
apply Deltas or change your personal Trama data.

- [Setup, suggested questions, and access restrictions](docs/demo/README.md)
- [Sanity Challenge write-up draft](docs/experiments/sanity-challenge-writeup.md)
- [Architecture and verified walkthrough](docs/experiments/sanity-live-agent-demo.md)

The general Trama interface is Portuguese-first; the investigation demo and its
model responses are in English. A GitHub repository is not a hosted demo:
running it requires server-side credentials and access to a configured Sanity
Context endpoint. No API keys or judge passwords are included.

The first vertical slice supports:

1. creating a Plot with a goal and central question;
2. registering and explicitly closing an OpenLoop that groups required Actions or records an external wait;
3. creating an Action with deadline, risk, and review date;
4. recording structured Action updates;
5. recalculating effective priority with explicit reasons;
6. preserving every mutation as an AuditEvent.

## Development

Requirements: Node.js 24+ and pnpm.

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev
```

Local data is stored in `.trama/trama.db` and remains outside version control.

### Temporary remote testing

Run the web app and create a temporary Cloudflare quick tunnel with one command:

```powershell
pnpm.cmd remote
```

The script downloads `cloudflared` into the ignored `.trama/tools` directory on
first use, reuses an app already listening on port 3000, and prints the public
URL. Press Ctrl+C to close processes started by the script. A quick tunnel has
no uptime guarantee or access control; do not share its URL while hosted
authentication and workspace isolation remain disabled.

## Hosted beta authentication

The hosted adapter uses Supabase Auth with cookie-backed Next.js sessions and a
PostgreSQL Workspace boundary. Copy `.env.example` to `.env.local` when a
Supabase project is available. Apply the migrations, import existing data when
needed, and run `pnpm.cmd hosted:verify` before setting
`TRAMA_HOSTED_TENANCY_READY=true`; a login screen alone is not tenant isolation.
See `docs/hosted-beta-setup.md` and
`docs/architecture/adr-010-hosted-identity-and-tenancy.md`.

## OpenAI BYOK beta

The web chat can use either Ollama or a beta tester's own OpenAI API key. In
local development, Trama creates a private ignored key at
`.trama/credentials.key` on first use. Production requires a stable server-only
encryption secret:

```powershell
$env:TRAMA_CREDENTIAL_SECRET="replace-with-a-long-random-production-secret"
pnpm dev
```

Open **Conversar → Configurar IA**, enter the API key, and choose OpenAI. The
browser submits the key once over HTTPS. The server validates it with OpenAI,
encrypts it using AES-256-GCM, and returns only an HttpOnly, SameSite cookie;
client JavaScript cannot read the credential. Production deployments must use
HTTPS and a stable `TRAMA_CREDENTIAL_SECRET`. They may alternatively provide a
server-owned `OPENAI_API_KEY`, which is never returned to the browser.

The initial selectable models are `gpt-5.6-terra`, `gpt-5.6-luna`, and
`gpt-5.4-mini`. Model inference changes provider, but MCP tools, deterministic
workflows, domain validation, write confirmation, and audit remain the same. In
local mode persistence uses SQLite; in hosted mode the authenticated Workspace
uses PostgreSQL through an in-process MCP transport bound to that Workspace; it
never starts the local SQLite MCP process. Do not expose a deployment containing personal data until
`pnpm.cmd hosted:verify` confirms Workspace isolation.

## Local AI

Install Ollama, then create Trama's reproducible local agent model:

```powershell
ollama pull qwen3:8b
pnpm local:model
```

`pnpm local:model` builds `trama-agent` from the repository's tracked `Modelfile`. The default profile uses Qwen 3 8B for stronger instruction following and tool use. It does not train or duplicate the Qwen weights; it creates a local manifest with Trama's stable system behavior and inference parameters. Run the command again after changing `Modelfile` or when setting up another machine.

To benchmark local models against an exported Action-language evaluation set without touching the Trama database, run:

```powershell
pnpm.cmd local:eval --model qwen3:8b --input "$env:USERPROFILE\Downloads\trama-action-evals-2026-08-11.json"
pnpm.cmd local:eval --model deepseek-r1:8b --think --input "$env:USERPROFILE\Downloads\trama-action-evals-2026-08-11.json"
pnpm.cmd local:eval --model qwen3.5:9b --json-mode --input "$env:USERPROFILE\Downloads\trama-action-evals-2026-08-11.json"
```

The runner applies the same versioned interpretation policy to every model, scores the expected decision boundary, and writes detailed local reports under `artifacts/evals/`. Use `--json-mode` for models that stall on Ollama's detailed JSON Schema constraint; the host still parses and validates the returned decision. Reports are ignored by Git because they may contain personal examples.

The evaluation workbench separates cases used to refine the policy (`development`) from fresh cases used only to measure generalization (`holdout`). Expected decisions are explicit, editable labels in the UI. After exporting schema version 2, run only the blind set with `--split holdout`; never tune the policy on that result and continue calling it a holdout.

The evaluation runner converts each sample into the same provider-neutral
pipeline used by the web host: a typed browser/DOM projection (`view`, route,
Plot, expanded Action and visible entity IDs), the authoritative
`get_plot_context` MCP dashboard resolved from it, absolute operational time,
conversation facts, and the deterministic workflow allowed for the focus.
Legacy narrative `context` fields are adapted into this realistic mock; newer
exports may provide an explicit `contextMock`.
Expected labels and human notes are used only for scoring and are never included
in the model prompt.

Reports checkpoint after every sample, include separate development and holdout
scores, and record structured-contract validity independently from semantic
accuracy. Interrupted or memory-constrained runs therefore retain partial
evidence instead of losing the entire benchmark.

```powershell
pnpm.cmd local:eval --model qwen3:8b --split holdout --input "<exported-evals.json>"
```

The 8B model is approximately 5.2 GB before runtime overhead. A GPU with 6 GB of VRAM may split execution between GPU and system RAM. Keep `qwen3:4b-instruct` installed as an optional economical fallback and select it with `TRAMA_OLLAMA_MODEL=qwen3:4b-instruct` when lower memory use matters more than agent quality.

Ollama serves its local API at `http://127.0.0.1:11434`. Optional configuration:

```powershell
$env:TRAMA_OLLAMA_BASE_URL="http://127.0.0.1:11434"
$env:TRAMA_OLLAMA_MODEL="trama-agent"
$env:TRAMA_OLLAMA_TIMEOUT_MS="180000"
$env:TRAMA_OLLAMA_MAX_TURNS="4"
$env:TRAMA_OLLAMA_CONTEXT_SIZE="8192"
$env:TRAMA_REVIEW_INTERVAL_HOURS="24"
```

`TRAMA_REVIEW_INTERVAL_HOURS` controls the global operational review cadence. Action creation, progress, and rescheduling never ask the user for a separate review date; the default is every 24 hours.

`TRAMA_TIME_ZONE` controls deadline formatting in MCP operational reports. It
defaults to `America/Sao_Paulo`.

The local agent receives the browser locale and IANA time zone. Relative scheduling expressions are resolved deterministically in `pt-BR` and `en-US`; MCP payloads and persisted timestamps remain canonical and provider-neutral. See `docs/architecture/adr-007-localized-scheduling.md`.

Ollama uses Trama through an MCP client bridge. Start in read-only mode:

```powershell
pnpm local:agent -- "Revise minhas prioridades e explique o que precisa de atenção."
```

For a continuous Trama-aware conversation:

```powershell
pnpm local:chat
```

`TRAMA_OLLAMA_TIMEOUT_MS` applies to each local-model inference call. The local
agent limits tool-call loops to four turns by default so a confused model cannot
hold the interface indefinitely; raise `TRAMA_OLLAMA_MAX_TURNS` only for a
tested workflow that genuinely needs additional tool reads.

`TRAMA_OLLAMA_CONTEXT_SIZE` defaults to 8192 tokens so the bounded conversation,
retrieved evidence, and read-only Context tool schemas fit in one Ollama request.

The terminal chat keeps session context and supports `/status` and `/exit`. It starts read-only unless launched with `--allow-writes`; in write mode, every MCP mutation requires an individual confirmation.

The web application also includes a graphical local chat. Start `pnpm dev`, open the investigator's desk, and use **Conversar**. The default **local-complete** profile discovers installed Ollama models, persists multiple conversations per focused entity in SQLite, and pauses every MCP write to show its exact arguments before execution. Runtime inference sessions may expire without deleting their conversation history.

The chat shows **Falar** when microphone capture is available. It records a
short utterance, transcribes it locally with the multilingual Whisper base
model in Portuguese, and discards the temporary audio and transcript file
after the text is returned to the composer. Nothing is sent automatically: the
user can review, expand, or correct the text before submitting it to the agent.
If local capture is unavailable, the browser speech service remains a fallback
and is explicitly set to Portuguese.

The graphical chat sends the current screen context with every turn. When a Trama or Caso is open, ambiguous references such as “isso” or “esta Trama” resolve to that visible Plot and the agent reads its current MCP context before answering. Explicitly naming another Trama or Caso takes precedence. Sessions expose only the compact read toolset by default; **Permitir alterações** adds write tools for that interaction, and every resulting mutation still pauses for individual confirmation.

The local-complete profile keeps the current conversation plus bounded history from other conversations on the same entity inside a compact prompt and projects MCP results before they enter model memory. The user may disable same-entity history per conversation. Related or global memory is never enabled implicitly. The full audit history remains in SQLite and is fetched only when explicitly needed, so a long chat does not grow without limit or overflow Ollama's context window.

Every model-decided write is persisted separately as a ConversationOperation,
including its exact MCP tool arguments and whether it was proposed, approved,
declined, executed, or failed. This is conversation provenance; the underlying
domain mutation still passes through validation, confirmation, and AuditEvent.

When an Action is focused, the local host also supplies a deterministic
workflow. Active Actions expose only progress, state change, completion, and
deadline paths; terminal Actions expose only reopening. The chat renders these
as optional suggested prompts, while the host restricts tools and validates the
target and transition independently of model output.

The architecture distinguishes an economical execution profile from a complete one. Local constrained models should default to focused context and compact tools; stronger providers may use broader retrieval and reasoning. This profile never grants mutation authority, which remains a separate explicit control.

### Reproducible local setup

On a new Windows machine:

```powershell
pnpm install
ollama pull qwen3:8b
pnpm local:model
pnpm dev
```

Optional local speech transcription dependencies can be installed with `pnpm voice:setup`. They are downloaded from the official whisper.cpp release and model repository, verified by checksum, and stored under `.local/`, outside version control.

Enable audited MCP writes only for an explicit interaction:

```powershell
pnpm local:agent -- --allow-writes "Registre a atualização que eu vou informar."
```
