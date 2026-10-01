# Test suite

Tests live here rather than beside production modules. Subdirectories mirror
the source tree: `apps/`, `packages/`, and `scripts/`. Test filenames retain
their `.test.ts` or `.test.mjs` suffix for explicit discovery.

- `pnpm test`: Vitest TypeScript suite followed by Node's script unit tests.
- `pnpm test:scripts`: only the Node script suite.
- `pnpm test:watch`: Vitest watch mode.
- `pnpm typecheck`: production projects plus `tsconfig.test.json`.

Vitest aliases resolve shared Workspace packages from source. Relative imports
and source-inspection URLs resolve back to the production files. Production
package builds no longer include these tests. Mock-based checks do not replace
live provider checks or manual semantic citation audits.
