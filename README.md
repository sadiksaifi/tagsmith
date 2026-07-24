# Tagsmith

[![Check](https://github.com/sadiksaifi/tagsmith/actions/workflows/check.yml/badge.svg)](https://github.com/sadiksaifi/tagsmith/actions/workflows/check.yml)

Opinionated Git tag and SemVer release-tag manager for single-target repositories and monorepos.

It resolves SemVer versions, creates annotated Git tags, optionally pushes them, and validates existing tags for CI. It does **not** run deployments, mutate release branches, fetch automatically, or read your project `package.json` to decide release versions.

**Full documentation:** <https://tagsmith.site/>

## Run the CLI

```sh
npx tagsmith@latest
```

Use your project's package runner if it standardizes on one: `pnpx`, `pnpm dlx`, `bunx`, and `yarn dlx` work too. Tagsmith requires Node.js 22+.

## Get started

The fastest path is to let an AI coding agent do it. From inside your repository, give your agent:

```text
Follow the LLM-only instructions at https://tagsmith.site/docs/setup-with-ai.md to set up Tagsmith in this repository.
```

Or set it up by hand in five commands — see [Get started](https://tagsmith.site/docs/getting-started) in the docs.

## LLM-readable documentation

Tagsmith publishes generated LLM-readable documentation:

- <https://tagsmith.site/llms.txt>
- <https://tagsmith.site/llms-full.txt>

## License

[MIT](LICENSE) © 2026 Sadik Saifi
