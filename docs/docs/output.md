---
title: "Tagsmith JSON, GitHub output, and human CLI output"
description: "Learn Tagsmith output modes for human CLI text, pretty JSON, GitHub Actions outputs, raw init templates, exit codes, color rules, and error behavior."
outline: deep
---

# Output modes

Tagsmith has four output modes. The mode is determined by command and flags; you don't pick it explicitly except via `--json` and `--github-output`.

| Mode     | Trigger                           | Stdout                                                 | Stderr                                                   |
| -------- | --------------------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| `human`  | default                           | Human-readable messages (color if TTY)                 | Warnings, errors, optional verbose                       |
| `json`   | `--json`                          | Pretty-printed JSON (2-space indent, trailing newline) | Errors only on failure                                   |
| `github` | `--github-output` (validate only) | (silent on success)                                    | Errors only on failure; writes facts to `$GITHUB_OUTPUT` |
| `raw`    | `init --dry-run`                  | Exact template bytes                                   | (silent)                                                 |

## Exit codes

- `0` — success
- `1` — any failure (config, CLI, validation, Git, version, unsafe state)

Tagsmith does not use specialized non-zero exit codes.

## Color and chatter

Color is forbidden in `--json`, `--github-output`, and `init --dry-run` raw output. Successful machine-mode runs emit **no** stderr chatter. Warnings (`warning: <msg>`) appear only in human mode and never change the exit code.

## Mutual exclusion

- `--json` and `--github-output` are mutually exclusive — `--json is incompatible with --github-output`.
- `--verbose` is incompatible with `--json` and `--github-output` — `--verbose is incompatible with --json`.
- `--verbose` only emits in human mode.

## `tag --json` and `tag --dry-run --json`

```json
{
  "target": "app",
  "channel": "stable",
  "strategy": "stable",
  "version": "1.2.3",
  "baseVersion": "1.2.3",
  "tag": "v1.2.3",
  "tagMessage": "Release 1.2.3",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "created": true,
  "pushed": false,
  "dryRun": false
}
```

Field reference:

| Key           | Meaning                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------- |
| `target`      | Selected target name.                                                                         |
| `channel`     | Selected channel name.                                                                        |
| `strategy`    | `"stable"` or `"prerelease"`.                                                                 |
| `version`     | Resolved SemVer (no leading `v`).                                                             |
| `baseVersion` | Stable `X.Y.Z` portion. Equals `version` for stable; the part before `-` for prerelease.      |
| `tag`         | Rendered Git tag name.                                                                        |
| `tagMessage`  | Rendered annotated tag message.                                                               |
| `commit`      | Full 40-character SHA at which the tag was/would be created.                                  |
| `created`     | `true` if the local annotated tag was created on this run; `false` for `--dry-run`.           |
| `pushed`      | `true` if `--push` was provided **and** the push + verification succeeded. `false` otherwise. |
| `dryRun`      | `true` for `--dry-run`; `false` for real runs.                                                |

`tag --dry-run --push --json` does **not** push; it sets `dryRun: true, created: false, pushed: false`. There is no `wouldPush` field — dry-run with `--push` is intentionally indistinguishable from dry-run without it in the JSON payload.

## `validate --json`

```json
{
  "target": "app",
  "channel": "stable",
  "strategy": "stable",
  "version": "1.2.3",
  "baseVersion": "1.2.3",
  "tag": "v1.2.3",
  "tagMessage": "Release 1.2.3",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "remote": "origin",
  "baseBranch": "main",
  "valid": true
}
```

`validate --json` always emits `valid: true` on success. On failure, no stdout is written and a plain human-readable error goes to stderr.

`target`, `channel`, `strategy`, `version`, `baseVersion`, `tag`, `tagMessage`, `commit` have the same meanings as in `tag --json`. The extra keys are validation-specific:

| Key          | Meaning                                     |
| ------------ | ------------------------------------------- |
| `remote`     | The remote name from `git.remote`.          |
| `baseBranch` | The base branch name from `git.baseBranch`. |
| `valid`      | Always `true` on success.                   |

## `validate --github-output`

Writes single-line `KEY=VALUE` records to the file named by `$GITHUB_OUTPUT`, **appending** after every check passes. On failure, no output is written.

```
target=app
channel=stable
strategy=stable
version=1.2.3
baseVersion=1.2.3
tag=v1.2.3
tagMessage=Release 1.2.3
commit=0123456789abcdef0123456789abcdef01234567
remote=origin
baseBranch=main
valid=true
```

Constraints:

- Keys are identifiers matching `^[A-Za-z_][A-Za-z0-9_]*$`.
- Values must be single-line printable text. Control characters and newlines are rejected.
- `--github-output` requires `GITHUB_OUTPUT` to be set and non-empty: `validate --github-output requires GITHUB_OUTPUT`.
- Writes happen **after** full validation. There is no partial output on failure.

Use these as `steps.<id>.outputs.<key>` in downstream GitHub Actions steps. See [GitHub Actions integration](./ci) for the canonical workflow shape.

## `list --json`

`list --json` emits an array of tag records sorted by target name ascending, then SemVer descending:

```json
[
  {
    "tag": "app@1.3.0",
    "target": "app",
    "channel": "stable",
    "version": "1.3.0",
    "legacy": false,
    "local": true,
    "remote": true,
    "status": "local+remote",
    "commit": "0123456789abcdef0123456789abcdef01234567"
  }
]
```

Field reference:

| Key       | Meaning                                                                                 |
| --------- | --------------------------------------------------------------------------------------- |
| `tag`     | Rendered Git tag name.                                                                  |
| `target`  | Configured target whose `tagPattern` matched.                                           |
| `channel` | Inferred channel name from the SemVer shape.                                            |
| `version` | Parsed SemVer capture without a leading `v`.                                            |
| `legacy`  | `true` for tags at or before the target's `initialVersion` adoption boundary.           |
| `local`   | `true` when the tag was read from local Git tags.                                       |
| `remote`  | `true` when the tag was read from configured `git.remote`.                              |
| `status`  | One of `local+remote`, `local-only`, `remote-only`, or the `legacy ...` variants.       |
| `commit`  | Full SHA from the local tag peel, or remote peel when only the remote tag is available. |

## `targets --json`

`targets --json` emits the **raw parsed config object**, not the effective-inherited shape:

```json
{
  "$schema": "https://tagsmith.sadiksaifi.dev/schema/v1.json",
  "configVersion": 1,
  "git": { "remote": "origin", "baseBranch": "main" },
  "defaults": {
    "tagPattern": "{target}@{version}",
    "tagMessage": "Release {target} {version}",
    "initialVersion": "0.0.0"
  },
  "targets": {
    "web": {
      "path": "apps/web",
      "channels": [
        /* ... */
      ]
    }
  }
}
```

Properties:

- Preserves the original key order from the config file.
- Excludes JSONC comments and trailing commas.
- Includes `$schema` only if the config has it.
- Includes target-level overrides only if the config has them. Inherited defaults are **not** materialized.

## `init --dry-run` (raw)

Writes the exact template bytes (including the trailing newline) to stdout. No color, no warnings, no chatter. The output is identical to the bytes `init` would otherwise write to disk. `--dry-run` does **not** accept `--json` or `--github-output`.

## Human-mode shapes

Human output is guidance — exit codes, stream routing, and machine output shapes are the durable contracts. Example success lines:

`tag`:

```
Tagged v1.2.3 (1.2.3) for target app channel stable.
Commit: 012345678901
Created: yes
Pushed: yes
```

`tag --dry-run`:

```
Resolved v1.2.3 (1.2.3) for target app channel stable.
Commit: 0123456789abcdef0123456789abcdef01234567
Dry run: No tag was created.
No push would have happened.
```

`validate`:

```
Validated v1.2.3 (1.2.3) for target app channel stable.
Commit: 012345678901
Remote: origin
Base branch: main
Valid: true
```

`list`:

```
tag         target  channel  version  status
app@1.2.3  app     stable   1.2.3    local+remote
```

`targets`: one block per target showing path, channels (with strategy and `dependsOn`), pattern, message, initial version. Multiple targets are separated by a blank line. Config warnings appear on stderr above the targets output.

## Errors in machine modes

When a machine-mode run fails, Tagsmith writes:

- **stdout**: nothing
- **stderr**: `tagsmith failed: <message>`
- exit code: `1`

This is the same error shape used in human mode (minus color). No JSON error object is ever emitted; failures are always plain text. See [Error catalogue](./errors).
