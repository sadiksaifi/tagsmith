---
title: "GitHub Actions release tag validation with Tagsmith"
description: "Use Tagsmith in GitHub Actions to validate annotated SemVer release tags, export release facts to $GITHUB_OUTPUT, and gate publish or deploy jobs safely."
outline: deep
---

# GitHub Actions integration

Tagsmith validates release tags and exports release facts. It does **not** publish packages, deploy applications, upload artifacts, create cloud releases, or decide what your release process should do after validation. The pattern below uses Tagsmith as the gate; downstream jobs read the validated facts and run your actual release.

## Why use Tagsmith in CI

`validate --github-output` writes single-line `KEY=VALUE` records to `$GITHUB_OUTPUT` only **after** every validation check passes. Downstream jobs read these via `needs.<job>.outputs.<key>` and run with the confidence that:

- the tag is annotated locally and remotely and the refs peel to the same commit
- the tag matches exactly one configured target's pattern (or the asserted target)
- the parsed `{version}` capture is canonical SemVer in the expected channel shape
- the channel's direct `dependsOn` chain is satisfied at the same base
- the tag's commit is reachable from `<remote>/<baseBranch>`
- the managed namespace has no malformed tags lurking nearby

Invalid tags fail before anything else runs.

## Canonical publish workflow

```yaml
name: Publish

on:
  push:
    tags:
      # Match your .tagsmith.jsonc tagPattern.
      # - "v*"    for v1.2.3
      # - "*@*"   for app@1.2.3 monorepo tags
      - "*"

permissions:
  contents: read

concurrency:
  group: publish-${{ github.ref }}
  cancel-in-progress: false

jobs:
  validate:
    name: Validate release tag
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    outputs:
      target: ${{ steps.tagsmith.outputs.target }}
      channel: ${{ steps.tagsmith.outputs.channel }}
      strategy: ${{ steps.tagsmith.outputs.strategy }}
      version: ${{ steps.tagsmith.outputs.version }}
      base-version: ${{ steps.tagsmith.outputs.baseVersion }}
      tag: ${{ steps.tagsmith.outputs.tag }}
      tag-message: ${{ steps.tagsmith.outputs.tagMessage }}
      commit: ${{ steps.tagsmith.outputs.commit }}
    steps:
      - name: Checkout
        uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - name: Fetch tags and remote branches
        run: git fetch --force --tags origin '+refs/heads/*:refs/remotes/origin/*'

      - name: Validate release tag
        id: tagsmith
        run: npx tagsmith@latest validate --tag "$GITHUB_REF_NAME" --github-output

  release:
    name: Release
    needs: validate
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    permissions:
      contents: read
      # Add only the permissions your release steps need, for example:
      # id-token: write      # OIDC / trusted publishing
      # packages: write      # GitHub Packages
      # deployments: write   # GitHub Deployments
    steps:
      - name: Checkout validated commit
        uses: actions/checkout@v6
        with:
          ref: ${{ needs.validate.outputs.commit }}
          fetch-depth: 0

      - name: Build, publish, deploy, or upload
        env:
          RELEASE_TARGET: ${{ needs.validate.outputs.target }}
          RELEASE_CHANNEL: ${{ needs.validate.outputs.channel }}
          RELEASE_STRATEGY: ${{ needs.validate.outputs.strategy }}
          RELEASE_VERSION: ${{ needs.validate.outputs.version }}
          RELEASE_BASE_VERSION: ${{ needs.validate.outputs.base-version }}
          RELEASE_TAG: ${{ needs.validate.outputs.tag }}
          RELEASE_COMMIT: ${{ needs.validate.outputs.commit }}
        run: |
          echo "Release $RELEASE_TAG validated at $RELEASE_COMMIT"
          echo "Target: $RELEASE_TARGET"
          echo "Channel: $RELEASE_CHANNEL ($RELEASE_STRATEGY)"
          echo "Version: $RELEASE_VERSION"
          # Put your real publish/deploy steps here.
```

## Why `fetch-depth: 0` and an explicit fetch

Tagsmith never fetches automatically. `validate` requires the tag's commit to be reachable from `<remote>/<baseBranch>` via local Git history. CI needs:

- Full history — `fetch-depth: 0` on `actions/checkout`.
- Remote branches available locally — the explicit `git fetch ... +refs/heads/*:refs/remotes/origin/*` line.
- Tags available locally — same fetch line with `--tags`.

Skipping any of these can leave the runner with a shallow checkout and trigger:

```
cannot prove tag commit is reachable from <remote>/<baseBranch> with local history.
Fetch enough history and retry:
  git fetch <remote> <baseBranch> --tags
```

## Running from `$GITHUB_WORKSPACE`

Tagsmith discovers the repo from the current working directory. In GitHub Actions, that's `$GITHUB_WORKSPACE` by default, which is where `actions/checkout` lands. If you `cd` somewhere else first, add `cd "$GITHUB_WORKSPACE"` before invoking Tagsmith.

## Reading outputs in downstream jobs

The `validate` job exposes these outputs (verbatim keys, all strings):

- `target`
- `channel`
- `strategy` — `prerelease` or `stable`
- `version` — canonical SemVer, no leading `v`
- `baseVersion` — stable `X.Y.Z` portion; equals `version` for stable channels
- `tag` — full rendered Git tag name
- `tagMessage` — rendered annotated message from current config
- `commit` — full 40-character SHA

In downstream steps:

```yaml
- name: Use validated facts
  env:
    RELEASE_VERSION: ${{ needs.validate.outputs.version }}
  run: echo "$RELEASE_VERSION"
```

Within the `validate` job itself, later steps can read the same facts as `steps.tagsmith.outputs.<key>`.

## Single-target shortcuts

When the config has exactly one target with an unambiguous pattern, `validate` can infer the target from the tag and you can omit `--target`. With multiple targets, supply `--target` to scope pattern matching to one configured target.

## What `validate` does **not** do

- Does not contact any package registry.
- Does not deploy or upload anything.
- Does not write build artifacts.
- Does not compare the existing annotated tag's actual message to the rendered `tagMessage`.
- Does not roll back on any failure — failures are read-only events.

## Failure handling

`validate` exits non-zero with a single error line on stderr. The downstream `release` job is gated by `needs: validate`, so a failed validation skips release work entirely. Inspect the failed step's logs to read the error and use the [Error catalogue](./errors) to map it to a remediation.

## Local CI rehearsal

You can rehearse the CI path locally:

```sh
# Pretend you're in CI.
GITHUB_OUTPUT=/tmp/tagsmith.out CI=true \
  npx tagsmith@latest validate --tag v1.2.3 --github-output

cat /tmp/tagsmith.out
```

This produces the exact bytes that would be appended to `$GITHUB_OUTPUT` in a real workflow.
