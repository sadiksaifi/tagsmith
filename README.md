# Tagsmith

[![Check](https://github.com/sadiksaifi/tagsmith/actions/workflows/check.yml/badge.svg)](https://github.com/sadiksaifi/tagsmith/actions/workflows/check.yml)

Opinionated Git tag and SemVer release-tag manager for single-target repositories and monorepos.

It resolves SemVer versions, creates annotated Git tags, optionally pushes them, and validates existing tags for CI. It does **not** run deployments, mutate release branches, fetch automatically, or read your project `package.json` to decide release versions.

**Full documentation:** <https://tagsmith.sadiksaifi.dev/>

## Run the CLI

```sh
npx tagsmith@latest
```

`pnpx`, `bunx`, and `yarn dlx` work the same way. Tagsmith requires Node.js 22+.

## Get started

The fastest path is to let an AI assistant do it. From inside your repository, give your assistant:

```text
Fetch https://tagsmith.sadiksaifi.dev/llms.txt and follow the instructions.
```

Or set it up by hand in five commands — see [Get started](https://tagsmith.sadiksaifi.dev/docs/getting-started) in the docs.

## License

[MIT](LICENSE) © 2026 Sadik Saifi
