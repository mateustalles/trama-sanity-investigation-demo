# Hosting the investigation demo

The read-only agent is hosted at
[trama.beautyqueenz.com](https://trama.beautyqueenz.com/poc/sanity/investigate).
It runs on a dedicated VPS rather than a tunnel to the author's computer.
The public URL requires approved test access; API keys stay on the server.

## Production arrangement

The reviewed host is an otherwise empty AlmaLinux 9 VPS with 1 vCPU and 2 GB
RAM. Node 24.19, pnpm 11.7 and Next.js 16.3.5 build the app on Linux; copying
Windows dependencies or a Windows build is not the deployment procedure.
The low-memory build uses one worker and a bounded Node heap. A swap file
provides additional headroom, not a promise of model-hosting capacity.

Nginx terminates HTTPS and forwards requests to Next.js on `127.0.0.1:3000`.
The app runs as the dedicated non-root `trama-demo` user under systemd with
automatic restart on failure. Release folders live under
`/opt/trama-demo/releases/`; `/opt/trama-demo/current` selects the active build.
The service reads a protected, root-owned `/etc/trama-demo.env`. This file is
not part of the repository, and the runtime does not need a direct database
connection password.

The checked-in templates under `scripts/deploy/` document this arrangement:

- `bootstrap-vps.sh`: toolchain, Nginx and swap setup for an inspected empty
  AlmaLinux host. It does not publish an app by itself.
- `build-release.sh`: builds an explicit release as the app user, without
  switching the active release.
- `trama-demo.service`: loopback-only production service and runtime limits.
- `nginx-https.conf`: HTTPS routing, small request bodies and proxy timeout.
- `renew-nginx.sh`: configuration validation before Nginx reload.

These are deployment templates for this reviewed host, not a command to run
blindly on an existing server. Preserve an original Nginx configuration backup,
validate changes with `nginx -t` and keep the previous release available before
switching `current`. Restore the previous configuration or release if a check
fails; do not reset Supabase or rebuild the KB as a deployment recovery step.

## Secrets and access

Supply the Sanity organization token, Context MCP endpoint and OpenAI key only
through the protected server environment. Public Sanity identifiers and public
Supabase keys are distinct from server secrets. Do not publish environment
files, SSH private keys, Auth recovery links or judge passwords in GitHub,
the writeup or a recording.

Production enables `TRAMA_HOSTED_TENANCY_READY=true` and
`TRAMA_DEMO_REQUIRE_JUDGE=true`. The server-owned `TRAMA_DEMO_OPERATOR_ID` admits
the approved filming operator. The paid route otherwise requires the restricted
judge role, preserving its expiry, 600-question total quota and six-question
per-minute quota. An ordinary signed-in account does not grant paid access.
Keep the existing account rather than provisioning it again during a redeploy.

## Verified boundaries and remaining check

On October 4, 2026, TLS and the following public responses were verified:
login HTTP 200, anonymous investigation redirect 307, unsigned paid API 401
and unrelated operational API 403. The current Linux production build passed.
A temporary session for the existing restricted judge also verified page 200,
paid native API 200 and operational write API 403, then was signed out. It did
not reset the password or change account metadata. Password-form testing and
password-based browser sign-in remain separate checks; these responses do not
certify that handoff or every quota edge.

An October 4 follow-up assigned a unique password to the existing judge account
and verified password-based authentication without changing owner credentials,
judge metadata, or expiry. The incremental quota migration preserved real
usage; rolled-back database checks verified six allowed requests, a blocked
seventh request, minute renewal, and the 600-request total limit. Credentials
are handed over privately, never committed here.

The R5 release (`3a0fbca`) adds the four-step investigation guide, optional
context/trace panels, remaining allowance, precise retry countdowns, and
separate search/model timeout messages. Windows and Linux builds and 260
offline tests passed. Hosted password sign-in and a live browser question
were verified (4.4 seconds); the previous R4 release remains available for
rollback. The restricted judge expiry was extended to October 23, 23:59
São Paulo to cover review after the October 22 winner announcement, without
changing its role, 600-question quota, or owner access.

The app is read-only with respect to Trama State and personal organizer data,
but a successful question still spends Sanity and OpenAI quota. Before filming
or sharing access, review usage, inspect the answer and keep the complete
generated KB context visibly distinct from independently verified originals.
