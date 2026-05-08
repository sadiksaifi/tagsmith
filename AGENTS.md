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
- `Progress UX:` human TTY Git/fs work uses stderr Clack `spinner({ indicator: "dots" })`; machine/raw outputs stay unchanged and core/adapters stay spinner-free.

## Design Principles

- **No shortcuts**: every rule here exists because skipping it caused real harm. Corners cut now bite later. Follow the pattern even when it feels like overhead — especially then.
- Keep core logic pure: no terminal streams, process globals, CLI parser objects, or filesystem/Git calls.
- Keep side effects in adapters or command orchestration.
- Preserve machine-output contracts: `--json` emits only JSON; `--github-output` writes only GitHub output values.
- Add or update tests at the matching level: pure behavior in unit, Git/filesystem seams in integration, built CLI behavior in e2e.
- Config shape changes must update parser validation, `schema/v1.json`, and the init template together.
- **Deep modules, narrow interfaces**: prefer small public APIs with rich internal behavior. Avoid shallow wrappers that only pass data through without adding meaningful ownership, validation, or abstraction.
- **Hexagonal Architecture**: business logic declares its dependencies as local interfaces. External systems are adapters plugged in from the outside. Domain code must not depend on database models, framework types, transport payloads, or vendor-specific SDK shapes.
- **TDD cycle discipline**: for each behavior follow strict RED → GREEN → VERIFY (full suite + lint + format); write one failing test against the public interface describing observable behavior, implement the minimal code to pass with no speculation or refactoring, ensure everything passes before proceeding, and defer all refactoring to a single pass after all behaviors are complete.
