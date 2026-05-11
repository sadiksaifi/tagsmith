# Tagsmith

[![Check](https://github.com/sadiksaifi/tagsmith/actions/workflows/check.yml/badge.svg)](https://github.com/sadiksaifi/tagsmith/actions/workflows/check.yml)

Opinionated Git tag and SemVer release-tag manager for single-target repositories and monorepos.

Tagsmith manages release intent through a declarative JSONC config file. It resolves SemVer versions, creates annotated Git tags, optionally pushes them, and validates existing tags for CI. It does **not** run deployments, mutate release branches, fetch automatically, or read your project `package.json` to decide release versions.

**Full documentation:** <https://tagsmith.sadiksaifi.dev/>

## Run the CLI

```sh
npx tagsmith@latest
```

`pnpx`, `bunx`, and `yarn dlx` work the same way. Tagsmith requires Node.js 22+.

## Get started

The fastest path is to let an AI assistant do it. From inside your repository, give your assistant:

> Fetch <https://tagsmith.sadiksaifi.dev/llms.txt> and follow the instructions.

Or set it up by hand in six commands — see [Get started](https://tagsmith.sadiksaifi.dev/docs/getting-started) in the docs.

## Where to go next

| You want to…                          | Go to                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| Create your first tag in six commands | [Get started](https://tagsmith.sadiksaifi.dev/docs/getting-started)           |
| Hand setup to an AI assistant         | [AI-assisted setup](https://tagsmith.sadiksaifi.dev/docs/ai-assisted-setup)   |
| Look up a config field                | [Configuration reference](https://tagsmith.sadiksaifi.dev/docs/configuration) |
| Understand a CLI flag or output       | [Commands](https://tagsmith.sadiksaifi.dev/docs/cli/init)                     |
| Wire validation into CI               | [GitHub Actions](https://tagsmith.sadiksaifi.dev/docs/ci)                     |
| Decode an error message               | [Error catalogue](https://tagsmith.sadiksaifi.dev/docs/errors)                |

## License

[MIT](LICENSE) © 2026 Sadik Saifi
