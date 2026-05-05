## Commands

- `pnpm check` — full verification: typecheck, lint, format check, tests.
- `pnpm typecheck` — TypeScript no-emit check.
- `pnpm lint` — Oxlint.
- `pnpm format` / `pnpm format:check` — Oxfmt write/check.
- `pnpm test` — unit, integration, then e2e.
- `pnpm test:unit` — unit tests in `src` and `test/unit`.
- `pnpm test:integration` — integration tests in `test/integration`.
- `pnpm test:e2e` — build then e2e tests in `test/e2e`.
- `pnpm build` — bundle CLI to `dist`.

## Architecture

- `Shape:` TypeScript ESM Node CLI package.
- `Entrypoint:` `src/cli.ts` builds to the package `bin` executable.
- `Build:` tsdown bundles for Node; TypeScript uses bundler-style resolution.
- `Imports:` use `@/` for `src`; omit `.js`/`.ts` extensions in internal imports.
- `CLI layer:` parse flags, orchestrate commands, own terminal presentation.
- `Core/domain:` return typed results/errors; no terminal output, process streams, CLI parser types, logger types, or vendor SDK shapes.
- `Output:` human terminal output goes through a CLI output adapter; machine outputs stay plain and color-free.
- `Tests:` unit for pure behavior, integration for filesystem/Git/process seams, e2e for built/package CLI smoke flows.

## Dependency Ownership

- `cac:` CLI parsing only; keep parser-specific shapes out of core/domain modules.
- `zod:` config and boundary validation; convert validated input into project-owned types.
- `jsonc-parser:` config-file parsing only.
- `semver:` version parsing/comparison/incrementing behind version/domain services.
- `picocolors:` terminal styling only behind the CLI output adapter.
- `clack/prompts:` future interactive adapter only; interactive flows must reuse the same core services as flag-based commands.
- `New dependencies:` add when they have a clear owner module or adapter; keep vendor-specific shapes at the edge.

## Design Principles

- Keep CLI parsing thin; reusable behavior belongs behind typed internal APIs.
- Prefer deep modules with narrow public interfaces; avoid pass-through wrappers.
- Keep hexagonal boundaries: domain owns local ports, adapters translate Git/filesystem/terminal/framework shapes.
- Use strict TDD for behavior work: RED test against public observable behavior, minimal GREEN implementation, VERIFY full relevant checks, refactor only after behavior passes.
- Keep JSON and GitHub output deterministic, plain, and free of ANSI/color/log chatter.

## Sharp Edges

- `pnpm test:e2e` runs `pnpm build`; use it for package/bin confidence, not fast inner-loop testing.
- `--json` and `--github-output` must not share human output paths.
- Internal imports should be extensionless.
- Type-aware lint depends on the TypeScript project config; keep `tsconfig.json` includes scoped.
