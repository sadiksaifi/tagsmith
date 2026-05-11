---
title: "Get started with Tagsmith SemVer Git tags"
description: "Install Tagsmith, create a .tagsmith.jsonc config, preview the next SemVer release tag, create an annotated Git tag, and validate it in CI."
outline: deep
---

# Get started

Five commands to your first validated release. Run them inside a Git repo with a clean working tree and a remote called `origin`.

## 1. Create the config

```sh
npx tagsmith@latest init
```

Writes `.tagsmith.jsonc` at the repo root. The template ships with three example targets (`web`, `api`, `auth`) and a full `alpha → beta → rc → stable` channel ladder. Edit it down to what your repo actually has.

A minimal single-target shape:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/sadiksaifi/tagsmith/refs/heads/main/schema/v1.json",
  "configVersion": 1,

  "git": {
    "remote": "origin",
    "baseBranch": "main",
  },

  "defaults": {
    "tagPattern": "v{version}",
    "tagMessage": "Release {version}",
    "initialVersion": "0.0.0",
  },

  "targets": {
    "app": {
      "path": ".",
      "channels": [{ "name": "stable", "strategy": "stable" }],
    },
  },
}
```

When the config has exactly one target, `--target` is optional on `tag` and `validate`.

::: tip Editor schema
The `$schema` line wires JSON Schema completion in any editor that supports it. `init` writes it for you.
:::

## 2. Check configured targets

```sh
npx tagsmith@latest targets
```

Validates the config and target paths, then prints each target. It does **not** read tags, remotes, or remote refs.

## 3. Preview the next tag

```sh
npx tagsmith@latest tag --channel stable --bump patch --dry-run --json
```

Runs the full [preflight](./preflight) and skips create/push. The `--json` payload has the same shape as a real run with `created: false`, `pushed: false`, `dryRun: true`. See [Output modes](./output).

## 4. Create the annotated tag

Pick one. Bare creates the annotated tag locally; `--push` also pushes to the configured `git.remote` and verifies the remote tag is annotated and peels to the same commit.

```sh
# Local only.
npx tagsmith@latest tag --channel stable --bump patch

# Create and push.
npx tagsmith@latest tag --channel stable --bump patch --push
```

Run **one** of these — both resolve `--bump patch` against managed tag history, so running the second after the first would create and push a second tag instead of pushing the first. If push or verification fails, the local tag remains and Tagsmith exits non-zero. See [Git safety model](./git-safety).

## 5. Validate in CI

```sh
npx tagsmith@latest validate --tag "$GITHUB_REF_NAME" --github-output
```

Runs the [validation pipeline](./preflight#validate-pipeline-in-order) and writes single-line `KEY=VALUE` records to `$GITHUB_OUTPUT` after every check passes. Use the keys as inputs for downstream release jobs. See [GitHub Actions](./ci) for a ready-to-paste workflow.

## Bump types at a glance

| Channel strategy | `--bump major`          | `--bump minor`          | `--bump patch`          | `--bump prerelease`                                      |
| ---------------- | ----------------------- | ----------------------- | ----------------------- | -------------------------------------------------------- |
| `stable`         | `2.0.0`                 | `1.3.0`                 | `1.2.4`                 | rejected                                                 |
| `prerelease`     | new `X.Y.Z-<ch>.1` line | new `X.Y.Z-<ch>.1` line | new `X.Y.Z-<ch>.1` line | increments `N` on the highest existing same-channel line |

`--version <semver>` overrides bump and supplies the version literally. Channel shape, monotonicity, and `dependsOn` rules still apply. See [Versioning](./versioning).

## What's next

- Add prerelease channels and `dependsOn` gates — see [Mental model](./concepts).
- Configure a monorepo with multiple targets — see [Configuration](./configuration).
- Wire `validate` into CI — see [GitHub Actions](./ci).
- Want an AI assistant to set this up for you? — see [Setup with AI](./setup-with-ai).
