---
title: "Tagsmith documentation"
description: "Read the Tagsmith documentation for SemVer Git tag creation, annotated release tags, monorepo targets, CI validation, and JSONC configuration."
outline: deep
---

# Tagsmith documentation

Tagsmith is an opinionated Git tag and SemVer release-tag manager for single-target repositories and monorepos. It manages release intent through a declarative JSONC config file, resolves SemVer versions, creates annotated Git tags, optionally pushes them, and validates existing tags for CI.

Tagsmith deliberately does **not**:

- run deployments or execute user-defined release functions
- mutate release branches, fetch automatically, checkout, merge, or switch branches
- read your project `package.json` to decide release versions
- support JavaScript or TypeScript config files
- accept SemVer build metadata
- expose any non-essential shorthand flags (only `-h` and `-v` exist)

Deployment systems should react to Git tags that Tagsmith creates and validates.

## Where to start

| You want to…                                                 | Go to                                      |
| ------------------------------------------------------------ | ------------------------------------------ |
| Create your first tag in five commands                       | [Get started](./getting-started)           |
| Hand setup to an AI assistant                                | [Setup with AI](./setup-with-ai)           |
| Build a mental model of targets, channels, and base versions | [Mental model](./concepts)                 |
| Look up a config field                                       | [Configuration reference](./configuration) |
| Understand a CLI flag or output                              | [Commands](./cli/init)                     |
| Wire it into CI                                              | [GitHub Actions](./ci)                     |
| Decode an error message                                      | [Error catalogue](./errors)                |

## Operating principles

These principles are normative — every behavior in the rest of these docs flows from them.

1. **One predictable way.** There is exactly one supported way to do every operation. No alternate paths, no compatibility shims.
2. **Fail loudly.** Invalid config, invalid flags, unsafe Git state, malformed managed tags, or ambiguous tags fail before any mutation.
3. **All policy is in user config.** Hidden defaults and implicit recovery are forbidden. If you can't see it in `.tagsmith.jsonc`, Tagsmith isn't doing it.
4. **Conservative Git model.** Tagsmith creates annotated tags only, refuses to auto-fetch or mutate branches, and never overwrites existing tags.
5. **Non-rollback on push failure.** If local tag creation succeeds but push or post-push verification fails, the local tag remains and you handle it.
6. **Same surface for humans and machines.** Every interactive prompt maps to an explicit flag. Machine modes (`--json`, `--github-output`, `init --dry-run` raw) never prompt and never emit warnings to stdout.

## Output and exit-code contract

- Exit code `0` on success, `1` on any failure (config, CLI, validation, Git, version, or unsafe state). Tagsmith does not use specialized non-zero exit codes.
- Successful `--json` writes pretty-printed JSON (2-space indent, trailing newline, full commit SHAs) to stdout and nothing to stderr.
- Failures in machine modes write no stdout and a plain human-readable error to stderr.
- Color is forbidden in `--json`, `--github-output`, and `init --dry-run` raw output.

## Schema URL

Tagsmith publishes its JSON Schema for editor integration:

```
https://raw.githubusercontent.com/sadiksaifi/tagsmith/refs/heads/main/schema/v1.json
```

`init` writes a `$schema` line into the template automatically.
