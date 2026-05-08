# Tagsmith

[![Check](https://github.com/sadiksaifi/tagsmith/actions/workflows/check.yml/badge.svg)](https://github.com/sadiksaifi/tagsmith/actions/workflows/check.yml)

Opinionated Git tag and SemVer release-tag manager for single-target repositories and monorepos.

Tagsmith manages release intent through a declarative JSONC config file. It resolves SemVer versions, creates annotated Git tags, optionally pushes them, and validates existing tags for CI. It does **not** run deployments, mutate release branches, fetch automatically, or read your project `package.json` to decide release versions.

## Features

- `tagsmith init` creates a documented `.tagsmith.jsonc` template.
- `tagsmith targets` lists configured release targets.
- `tagsmith tag` resolves a version, creates an annotated local Git tag, and can push it with `--push`.
- `tagsmith validate` strictly validates local/remote annotated tags and emits CI-safe facts.
- JSONC config with comments, trailing commas, schema support, duplicate-key rejection, and unknown-key rejection.
- Target-based release model for both apps and monorepos.
- Stable and prerelease channels with optional direct `dependsOn` gates.
- Deterministic JSON and GitHub Actions output modes with no ANSI or stderr chatter on success.

## Run the CLI

Use your package runner of choice, such as `npx`, `pnpx`, `bunx`, or `yarn dlx`. For example:

```sh
npx tagsmith@latest
```

> CI, scripts, non-TTY runs, help/version, JSON, GitHub-output, and raw dry-run paths remain prompt-free. In those contexts, bare `tagsmith` prints help, and commands with missing required inputs fail fast with actionable errors.

## Quick start

```sh
# 1. Create the config from inside a Git repository.
npx tagsmith@latest init

# 2. Edit .tagsmith.jsonc so target paths and channels match your repo.
#    The generated template contains web, api, and auth example targets.

# 3. Check configured targets.
npx tagsmith@latest targets

# 4. Preview the next tag without mutating Git.
npx tagsmith@latest tag --target app --channel prod --bump patch --dry-run --json

# 5. Create an annotated local tag at HEAD.
npx tagsmith@latest tag --target app --channel prod --bump patch

# 6. Create and push after preflight checks.
npx tagsmith@latest tag --target app --channel prod --bump patch --push

# 7. Validate a tag in CI.
npx tagsmith@latest validate --tag "$GITHUB_REF_NAME" --github-output
```

If the config has exactly one target, `--target` may be omitted for `tag` and can be inferred by `validate` when the tag pattern is unambiguous.

## Configuration

The default config path is `<repo-root>/.tagsmith.jsonc`. Use `--config <path>` to select a different file. Relative config paths resolve from the Git repo root, not from the current directory.

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/sadiksaifi/tagsmith/refs/heads/main/schema/v1.json",
  "configVersion": 1,

  "git": {
    "remote": "origin",
    "baseBranch": "main",
  },

  "defaults": {
    "tagPattern": "{target}@{version}",
    "tagMessage": "Release {target} {version}",
    "initialVersion": "0.0.0",
  },

  "targets": {
    "app": {
      "path": "apps/app",
      "channels": [
        { "name": "rc", "strategy": "prerelease" },
        { "name": "prod", "strategy": "stable", "dependsOn": ["rc"] },
      ],
    },
  },
}
```

### Config rules

- `configVersion` must be `1`.
- `git.remote` is a configured remote name such as `origin`.
- `git.baseBranch` is an unqualified branch name such as `main` or `release/1.x`.
- `defaults` provides `tagPattern`, `tagMessage`, and `initialVersion` for every target.
- Targets may override `tagPattern`, `tagMessage`, and `initialVersion`.
- Target and channel names must match `^[a-z][a-z0-9-]*$`.
- Every target must have exactly one `stable` channel, and channel names must be unique within the target.
- `dependsOn` references direct channels in the same target only; self-dependencies and cycles are invalid.
- `initialVersion` must be stable SemVer and acts as both the bump baseline and the minimum managed base version.
- Target paths resolve from the repo root, must exist as directories, must stay inside the repo realpath, and must have unique realpaths. `targets`, `tag`, and `validate` check all configured target paths.
- Multi-target effective tag patterns must be statically unambiguous.

### Tag patterns and versions

Recommended patterns:

```jsonc
// single target
"tagPattern": "v{version}"

// monorepo
"tagPattern": "{target}@{version}"
```

`tagPattern` supports `{target}` and exactly one `{version}`. Literal characters may use lowercase letters, digits, `.`, `_`, `-`, and `@`; `/`, whitespace, uppercase letters, and unsupported placeholders are rejected. The rendered tag must also be a safe Git tag name: no leading `.` or `-`, no trailing `.`, no `..`, and no `.lock` suffix. Channel names are encoded in prerelease versions, for example `1.2.3-rc.1`; `{channel}` is not supported.

Patterns where `{version}` touches an alphanumeric character or `_` emit a human-mode warning, except the recommended `v{version}` pattern.

`tagMessage` supports `{target}`, `{version}`, and `{tag}`, must be printable single-line text, and each target's effective rendered message must contain non-whitespace text.

SemVer values are pure versions:

- valid: `1.2.3`, `1.2.4-rc.1`, `1.2.4-pre-prod.1`
- invalid: `v1.2.3`, `1.2.3+build.5`, `1.2.4-rc`, `1.2.4-rc.0`, `01.2.3`

Put `v` in `tagPattern` if you want Git tag names like `v1.2.3`.

## Commands

### Global flags

```txt
--config <path>   Config file path. Default: <repo-root>/.tagsmith.jsonc
--verbose         Human-mode diagnostics only; incompatible with machine output
--help, -h        Show help
--version, -v     Show Tagsmith version
```

Only `--help` and `--version` have shorthand aliases. Attached values such as `--target=app` are rejected; use space-separated values like `--target app`.

### `tagsmith init`

Creates the resolved config file.

```sh
npx tagsmith@latest init
npx tagsmith@latest init --force
npx tagsmith@latest init --dry-run
```

`--dry-run` still requires running inside a Git repository. It prints the exact template bytes to stdout, writes nothing, and skips destination overwrite checks.

### `tagsmith targets`

Validates the config and target paths, then lists configured targets.

```sh
npx tagsmith@latest targets
npx tagsmith@latest targets --json
```

`targets --json` mirrors the parsed config shape and preserves config key order. It does not inspect Git tags, remotes, or base branch refs.

### `tagsmith tag`

Resolves a version and creates an annotated local tag at current `HEAD`.

```sh
npx tagsmith@latest tag --target app --channel prod --bump patch
npx tagsmith@latest tag --target app --channel rc --bump minor
npx tagsmith@latest tag --target app --channel rc --bump prerelease
npx tagsmith@latest tag --target app --channel prod --version 1.2.3
npx tagsmith@latest tag --target app --channel prod --bump patch --dry-run --json
npx tagsmith@latest tag --target app --channel prod --bump patch --push
```

Rules:

- Requires `--channel`.
- Requires exactly one of `--bump` or `--version`.
- `--bump` accepts `major`, `minor`, `patch`, or `prerelease`.
- Stable channels reject `--bump prerelease`.
- Prerelease channels use versions shaped like `X.Y.Z-<channel>.N`.
- On prerelease channels, `--bump major|minor|patch` starts a new `X.Y.Z-<channel>.1` line from the latest stable version or `initialVersion`.
- On prerelease channels, `--bump prerelease` only increments the highest existing same-target/same-channel prerelease line and fails if none exists.
- `--push` is required to push; local tag creation is the default mutation.

Before mutation, Tagsmith validates config, target paths, clean working tree, local tags, remote tags, remote base branch tip, `HEAD == <remote>/<baseBranch>`, malformed managed tags, duplicate tags, version policy, and direct same-base dependencies. `--dry-run` performs the same preflight and skips only create/push.

### `tagsmith validate`

Strictly validates an existing managed tag, primarily for CI.

```sh
npx tagsmith@latest validate --tag app@1.2.3
npx tagsmith@latest validate --tag app@1.2.3 --target app
npx tagsmith@latest validate --tag app@1.2.4-rc.1 --channel rc
npx tagsmith@latest validate --tag app@1.2.3 --json
npx tagsmith@latest validate --tag app@1.2.3 --github-output
```

Validation requires the tag to exist locally and remotely as an annotated tag, peel to the same commit, be reachable from the remote-read base branch tip, and satisfy direct same-base `dependsOn` checks.

`validate` also scans the inferred or asserted target's managed local and remote tag namespace. Malformed managed tags fail validation even when they are not the requested tag; unmatched arbitrary tags are ignored.

For `validate`, `tagMessage` output is rendered from the current config. Tagsmith does not read or compare the existing annotated tag message.

`--github-output` requires `GITHUB_OUTPUT` and writes only after full validation succeeds.

## Output modes

Successful `--json` output is pretty-printed with two-space indentation and a trailing newline. It writes only JSON to stdout and nothing to stderr.

`tag --json` and `tag --dry-run --json` emit:

```json
{
  "target": "app",
  "channel": "prod",
  "strategy": "stable",
  "version": "1.2.3",
  "baseVersion": "1.2.3",
  "tag": "app@1.2.3",
  "tagMessage": "Release app 1.2.3",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "created": true,
  "pushed": false,
  "dryRun": false
}
```

`validate --json` emits the same release facts plus `remote`, `baseBranch`, and `valid: true`.

`validate --github-output` writes single-line records:

```txt
target=app
channel=prod
strategy=stable
version=1.2.3
baseVersion=1.2.3
tag=app@1.2.3
tagMessage=Release app 1.2.3
commit=0123456789abcdef0123456789abcdef01234567
remote=origin
baseBranch=main
valid=true
```

On machine-output failures, Tagsmith writes no stdout and reports a plain human-readable error on stderr.

## Git safety model

Tagsmith is intentionally conservative:

- Discovers the repo from `process.cwd()` with Git; there is no `--cwd` flag.
- Requires Git repo context for every non-help/non-version command, including `init --dry-run` and `targets`.
- Reads remote tags and remote base branch tips directly from the configured remote.
- Does not run `git fetch`, checkout, merge, reset, or branch switches.
- Requires a clean working tree before `tag`.
- Requires current `HEAD` to equal the remote-read base branch tip before `tag`.
- Creates annotated tags only.
- Never overwrites existing Git tags.
- If push or post-push verification fails, the created local tag is not rolled back.

Because Tagsmith never fetches automatically, CI jobs should checkout or fetch enough tags and history before running `validate`.

## GitHub Actions example

```yaml
name: Validate release tag

on:
  push:
    tags:
      - "*"

jobs:
  validate:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v6
        with:
          node-version: 22

      - uses: pnpm/action-setup@v6
        with:
          version: 10

      - name: Validate tag
        id: tagsmith
        run: npx tagsmith@latest validate --tag "$GITHUB_REF_NAME" --github-output
```

Downstream deployment steps can read the exported release facts from `steps.tagsmith.outputs.*`. Tagsmith itself does not deploy.

## License

[MIT](LICENSE) © 2026 Sadik Saifi
