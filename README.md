# Tagsmith

[![Check](https://github.com/sadiksaifi/tagsmith/actions/workflows/check.yml/badge.svg)](https://github.com/sadiksaifi/tagsmith/actions/workflows/check.yml)

Opinionated Git tag and SemVer release-tag manager for single-target repositories and monorepos.

Tagsmith manages release intent through a declarative JSONC config file. It resolves SemVer versions, creates annotated Git tags, optionally pushes them, and validates existing tags for CI. It does **not** run deployments, mutate release branches, fetch automatically, or read your project `package.json` to decide release versions.

**Full documentation:** <https://sadiksaifi.github.io/tagsmith/>

## Run the CLI

```sh
npx tagsmith@latest
```

`pnpx`, `bunx`, and `yarn dlx` work the same way. Tagsmith requires Node.js 22+.

## Quick start

The fastest path is to let an AI assistant do it. From inside your repository, give your assistant:

> Fetch <https://sadiksaifi.github.io/tagsmith/llms.txt> and follow the instructions.

Or set it up by hand in five steps — see [Quick start](https://sadiksaifi.github.io/tagsmith/docs/quick-start) in the docs.

## Where to go next

| You want to…                                           | Go to                                                                               |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Understand what Tagsmith does and decide if it's a fit | [Get started](https://sadiksaifi.github.io/tagsmith/docs/getting-started)           |
| Build a release in five hands-on commands              | [Quick start](https://sadiksaifi.github.io/tagsmith/docs/quick-start)               |
| Hand setup to an AI assistant                          | [AI-assisted setup](https://sadiksaifi.github.io/tagsmith/docs/ai-assisted-setup)   |
| Look up a config field                                 | [Configuration reference](https://sadiksaifi.github.io/tagsmith/docs/configuration) |
| Understand a CLI flag or output                        | [Commands](https://sadiksaifi.github.io/tagsmith/docs/cli/init)                     |
| Wire validation into CI                                | [GitHub Actions](https://sadiksaifi.github.io/tagsmith/docs/ci)                     |
| Decode an error message                                | [Error catalogue](https://sadiksaifi.github.io/tagsmith/docs/errors)                |

## License

[MIT](LICENSE) © 2026 Sadik Saifi
