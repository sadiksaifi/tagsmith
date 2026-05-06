## Commands

- `pnpm build` — build the CLI into `dist`.
- `pnpm format:check` — verify formatting.
- `pnpm format` — apply formatting.
- `pnpm lint` — run Oxlint.
- `pnpm lint:fix` — apply lint fixes.
- `pnpm test:unit` — fast unit suite.
- `pnpm test:integration` — filesystem/Git/process integration suite.
- `pnpm test:e2e` — packaged CLI smoke suite.

## Architecture

- `Shape:` TypeScript ESM Node CLI.
- `Entrypoint:` `src/cli.ts`; package binary is `dist/cli.js`.
- `CLI:` `src/cli/create-cli.ts` parses flags and dispatches commands.
- `Commands:` `src/cli/commands/*` orchestrate config loading, Git/filesystem adapters, and core services.
- `Core:` `src/core/*` owns config validation, init template, release/tag planning, and validation logic.
- `Adapters:` `src/adapters/*` isolate Git and filesystem effects.
- `Output:` all human, JSON, and GitHub output goes through `src/cli/output/create-output.ts`.

## Design Principles

- Keep core logic pure: no terminal streams, process globals, CLI parser objects, or filesystem/Git calls.
- Keep side effects in adapters or command orchestration.
- Preserve machine-output contracts: `--json` emits only JSON; `--github-output` writes only GitHub output values.
- Add or update tests at the matching level: pure behavior in unit, Git/filesystem seams in integration, built CLI behavior in e2e.
- Config shape changes must update parser validation, `schema/v1.json`, and the init template together.
