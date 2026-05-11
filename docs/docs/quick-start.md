---
title: Quick start
outline: deep
---

# Quick start

This walkthrough creates and validates a real release tag in a single-target repo. It assumes you run inside a Git repository with a clean working tree and a remote called `origin`.

## 1. Create the config

```sh
npx tagsmith@latest init
```

This writes `.tagsmith.jsonc` at the repo root. The template ships with three example targets (`web`, `api`, `auth`) and the full `alpha → beta → rc → stable` channel ladder. Edit it down to what your repo actually has.

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

When the config has exactly one target, you can omit `--target` on `tag` and `validate`.

::: tip Editor schema
The `$schema` line wires JSON Schema completion and validation in any editor that supports it. `init` writes it for you.
:::

## 2. Check configured targets

```sh
npx tagsmith@latest targets
```

`targets` validates the config and target paths, then prints each configured target with its channels, pattern, message, and initial version. It does not inspect Git tags, remotes, or remote refs.

## 3. Preview the next tag

```sh
npx tagsmith@latest tag --channel stable --bump patch --dry-run --json
```

`--dry-run` runs the full [preflight](./preflight) — config, paths, working tree, local tags, remote tags, remote base branch tip, HEAD equality, and dependency gates — and skips only the create/push step. The `--json` payload is the same shape as a real run, with `created: false`, `pushed: false`, `dryRun: true`. See [Output modes](./output) for the exact keys.

## 4. Create the annotated tag

```sh
npx tagsmith@latest tag --channel stable --bump patch
```

Tagsmith creates an annotated tag at the current `HEAD`. Local tag creation is the default mutation; nothing is pushed unless you ask. If creation succeeds but you want to push later, use `git push origin refs/tags/<tag>` manually or rerun with `--push`.

## 5. Create and push in one step

```sh
npx tagsmith@latest tag --channel stable --bump patch --push
```

After creating the local tag, Tagsmith pushes it to the configured `git.remote` and re-reads the remote to verify the tag is annotated and peels to the same commit. If push or verification fails, the local tag remains and Tagsmith exits non-zero with a message that names the tag and the failure. See [Git safety model](./git-safety).

## 6. Validate in CI

In your release workflow, after the tag push has triggered the job:

```sh
npx tagsmith@latest validate --tag "$GITHUB_REF_NAME" --github-output
```

`validate` requires `GITHUB_OUTPUT` to be set, runs the [full validation pipeline](./preflight), and writes single-line `key=value` records only after every check passes. Use the keys (e.g. `target`, `channel`, `version`, `commit`) as inputs for downstream jobs. See [GitHub Actions integration](./ci).

## Bump types at a glance

| Channel strategy | `--bump major`          | `--bump minor`          | `--bump patch`          | `--bump prerelease`                                      |
| ---------------- | ----------------------- | ----------------------- | ----------------------- | -------------------------------------------------------- |
| `stable`         | `2.0.0`                 | `1.3.0`                 | `1.2.4`                 | rejected                                                 |
| `prerelease`     | new `X.Y.Z-<ch>.1` line | new `X.Y.Z-<ch>.1` line | new `X.Y.Z-<ch>.1` line | increments `N` on the highest existing same-channel line |

`--version <semver>` overrides bump entirely and supplies the version literally. Tagsmith still enforces channel shape, monotonicity, and `dependsOn` rules. See [Versioning](./versioning).

## What's next

- Add prerelease channels and `dependsOn` gates — see [Mental model](./concepts).
- Configure a monorepo with multiple targets — see [Configuration reference](./configuration).
- Wire `validate` into your release workflow — see [GitHub Actions](./ci).
