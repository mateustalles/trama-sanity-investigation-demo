# Hosted beta setup

## Supabase project

1. Create a Supabase project.
2. Disable public sign-up under Authentication settings. Beta users are created
   through server-side invitations.
3. Copy the project URL, publishable key, and secret key into
   `apps/web/.env.local`, following `.env.example`.
   Also copy the server-only pooled Postgres connection string into
   `SUPABASE_DATABASE_URL`; never expose it with a `NEXT_PUBLIC_` prefix.
4. Run the tracked SQL migrations in filename order using the Supabase SQL
   editor or CLI.
5. Keep `TRAMA_HOSTED_TENANCY_READY=false` until both identity and operational
   persistence migrations have been applied and cross-workspace tests pass.
6. Set `TRAMA_ADMIN_EMAILS` to the comma-separated beta administrator emails and
   `TRAMA_PUBLIC_URL` to the stable HTTPS deployment URL. Local invitations may
   use `http://localhost:3000` while developing on the same machine.

The secret key and `TRAMA_CREDENTIAL_SECRET` are server-only. Never use a
`NEXT_PUBLIC_` prefix for either value and never commit `.env.local`.

## Current migration state

- `202609020001_identity_workspaces.sql` creates profiles, personal Workspaces,
  memberships, per-user feature preferences, encrypted-credential storage, and
  initial Row Level Security policies.
- `202609030001_operational_workspace_tenancy.sql` creates tenant-keyed operational
  tables, composite foreign keys, indexes, and forced Row Level Security.
- `PostgresTramaRepository` provides operational persistence with an explicit
  Workspace boundary, and `AsyncTramaService` keeps domain commands and audit
  behavior consistent with the local service.

## Importing the existing local history

After applying both migrations, preview the one-time import without changing
either database:

```powershell
pnpm.cmd hosted:import
```

Check the target Workspace and row counts. Only then run:

```powershell
pnpm.cmd hosted:import -- --confirm-import
```

The import is idempotent and never deletes or rewrites the SQLite source. Verify
the adapter, imported records, priority report, and cross-Workspace isolation:

```powershell
pnpm.cmd hosted:verify
```

Only set `TRAMA_HOSTED_TENANCY_READY=true` after this command succeeds. When
enabled, authenticated web pages, server actions, and web chat persistence use
PostgreSQL. Hosted web chat creates its MCP transport in-process over the
authenticated Workspace service; it never starts the local SQLite MCP process.
The externally launched local MCP process continues to use the local SQLite database.

The hosted adapter is `PostgresTramaRepository`. It requires an explicit
Workspace ID at construction and prefixes every query and mutation with that
tenant boundary. Its transaction context uses a real Postgres transaction; the
web layer resolves the Workspace from the authenticated membership rather than
accepting a browser-provided ID.
