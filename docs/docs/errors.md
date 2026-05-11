---
title: "Tagsmith CLI error catalogue and fixes"
description: "Look up Tagsmith CLI errors for parsing, repo discovery, config validation, Git safety, release planning, tag validation, push verification, and GitHub outputs."
outline: deep
---

# Error catalogue

Every Tagsmith error is emitted on stderr with the `tagsmith failed: ` prefix and exits non-zero. Machine modes write no stdout on failure.

Wording below matches the actual stderr line. Angle-bracketed segments (`<target>`, `<tag>`, `<path>`, etc.) are runtime substitutions; everything else is fixed text. Where one site emits multiple variants (e.g. malformed managed tags), every variant is listed.

## CLI parsing

| Error                                                                   | Trigger                                                                                       | Remediation                                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `unknown option <token>`                                                | Any unrecognized long flag (`--cwd` is also rejected) or any short flag other than `-h`/`-v`. | Use a documented flag — see [Commands](./cli/init).                     |
| `unknown command <token>`                                               | Unrecognized subcommand.                                                                      | One of `init`, `tag`, `validate`, `targets`.                            |
| `unexpected argument <token>`                                           | A second command name (or stray positional) on the same line.                                 | Run subcommands one at a time.                                          |
| `option <flag> requires a value`                                        | The flag's next token is missing or starts with `-`.                                          | Provide a value separated by a space (`--bump patch`).                  |
| `option <flag> does not support attached values. Use <flag> <example>.` | `--flag=value` form.                                                                          | Use space-separated values.                                             |
| `tag requires --channel`                                                | `tag` invoked without `--channel`.                                                            | Add `--channel <name>`.                                                 |
| `tag requires exactly one of --bump or --version`                       | Both or neither provided on `tag`.                                                            | Provide exactly one.                                                    |
| `tag requires --target when config has multiple targets`                | Multi-target config with no `--target`.                                                       | Add `--target <name>`. Single-target configs may omit it.               |
| `unknown target <name>`                                                 | `--target` doesn't match any configured target.                                               | Run `tagsmith targets` to see configured names.                         |
| `unknown channel <name> for target <target>`                            | `--channel` doesn't match any channel for the selected target.                                | Run `tagsmith targets` to see channels per target.                      |
| `invalid --bump <value>; expected major, minor, patch, or prerelease`   | `--bump` got an invalid enum value.                                                           | One of the four documented bumps.                                       |
| `validate requires --tag`                                               | `validate` invoked without `--tag`.                                                           | Provide `--tag <tag>`.                                                  |
| `validate --github-output requires GITHUB_OUTPUT`                       | `--github-output` set but env var missing or empty.                                           | Run inside a GitHub Actions step, or set `GITHUB_OUTPUT=/path/to/file`. |
| `<machine-flag> is incompatible with <other-machine-flag>`              | Both `--json` and `--github-output` set.                                                      | Pick one.                                                               |
| `--verbose is incompatible with <machine-flag>`                         | `--verbose` combined with `--json` or `--github-output`.                                      | Drop `--verbose` from machine runs.                                     |
| `tagsmith cancelled.`                                                   | Interactive cancellation (Ctrl+C, or selecting the safe-negative option in a review).         | Re-run when ready.                                                      |

## Repo discovery

| Error                                                  | Trigger                                                             | Remediation                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Git repository not found from <cwd>`                  | Any non-help/non-version command run outside a Git repo.            | `cd` into a repo; `git init` if you're starting one.                                     |
| `git.remote <remote> is not configured in <repo-path>` | The configured remote name does not exist in the repo's Git config. | Add the remote (`git remote add <name> <url>`) or fix `git.remote` in `.tagsmith.jsonc`. |

## Config parse and validation

`<filePath>` is the resolved config path. `<jsonPath>` is the field path inside the JSONC file.

Parse errors:

- `<filePath>: malformed JSONC (<ParseErrorCode>)`
- `<filePath>: reserved key __proto__ at <jsonPath>`
- `<filePath>: duplicate key <name> at <jsonPath>`
- `<filePath>: <jsonPath>.<key>: <zod issue message>` — unknown/extra keys, wrong types, missing required fields. `<zod issue message>` is the Zod runtime message for the specific issue (e.g. `Unrecognized key …`, `Expected string, received number`).
- `<filePath>: invalid config` — fallback when no specific Zod issue is available.
- `<filePath>: failed to read config file: <message>` — wrapper from the filesystem adapter when the config file can't be read.

Runtime validation errors (returned as `<filePath>: <message>`, first failure wins):

- `git.remote must be a safe configured remote name without whitespace or slash`
- `git.baseBranch must be an unqualified branch name`
- `<fieldPath> must be canonical stable SemVer without build metadata or leading v` — `defaults.initialVersion` or any target-level `initialVersion` override.
- `<fieldPath> requires exactly one {version}` — tag pattern.
- `<fieldPath> may contain {target} at most once` — tag pattern.
- `<fieldPath> contains unsupported placeholder` — tag pattern or tag message.
- `<fieldPath> tagPattern contains unsafe characters`
- `<fieldPath> must be printable single-line text` — tag message has control characters or newlines.
- `<fieldPath> {version} touches an alphanumeric or underscore character` — **warning**, not error; human mode only.
- `targets must contain at least one target`
- `targets.<name> must match /^[a-z][a-z0-9-]*$/u`
- `targets.<name>.channels.<index>.name must match /^[a-z][a-z0-9-]*$/u`
- `targets.<name>.channels contains duplicate channel <name>`
- `targets.<name>.channels must contain exactly one stable channel`
- `targets.<name>.channels.<name>.dependsOn may not depend on self`
- `targets.<name>.channels.<name>.dependsOn references missing channel <name>`
- `targets.<name>.channels dependency cycle is invalid`
- `targets.<name>.tagPattern renders an unsafe Git tag name`
- `targets.<name>.tagMessage must be non-empty after interpolation`
- `targets <A> and <B> have ambiguous effective tagPattern <pattern>`

## Filesystem

Target paths:

- `targets.<name>.path <path> must exist`
- `targets.<name>.path <path> must be a directory`
- `targets.<name>.path <path> must resolve inside the Git repository`
- `targets.<name>.path resolves to the same real directory as targets.<other>.path`

`init` destination:

- `destination already exists: <path>`
- `destination parent directory does not exist: <parent>`
- `destination parent directory is not a directory: <parent>`
- `<destination>: <fs-error message>` — wrapper when reading/writing the destination file fails.

## Git state

- `working tree must be clean before tagging`
- `HEAD must equal <remote>/<baseBranch> (<commit>) before tagging`
- `failed to read remote tags from <remote>`
- `failed to read remote base branch <remote>/<baseBranch>`
- `failed to create annotated local tag <tag>`
- `failed to push tag <tag> to <remote>`
- `cannot prove tag commit is reachable from <remote>/<baseBranch> with local history.\n\nFetch enough history and retry:\n  git fetch <remote> <baseBranch> --tags`

## Release planning

Channel and bump:

- `stable channel <name> rejects --bump prerelease`
- `Cannot bump prerelease for <target> <channel>: no existing <channel> prerelease tag found. Use --bump major, --bump minor, --bump patch, or --version to start a prerelease line.`
- `failed to resolve <bump> bump` — internal fallback when version increment cannot be computed.
- `unknown channel <name>` — channel resolved from a tag does not exist on the target.
- `unknown channel <name> for target <target>` — explicit `--channel` does not exist on the selected target.

Explicit `--version`:

- `<version> must be canonical SemVer without build metadata or leading v`
- `<version> must be a stable SemVer for channel <name>` — stable channel got a prerelease literal.
- `<version> must match channel <name>` — prerelease channel got a literal that doesn't carry the channel's prerelease identifier.
- `<version> must be greater than initialVersion <initialVersion>` — first stable at or below the adoption boundary.
- `<version> base version must be greater than initialVersion <initialVersion>` — prerelease whose base is at or below the adoption boundary.
- `wrong prerelease shape for channel <name>` — version classification rejects the shape.

Duplicates:

- `tag <tag> already exists locally or remotely` — a managed tag with the rendered name already exists. Both the `--version` path and the bump path emit this; existing same-name tags are blocked regardless of lightweight vs annotated.

Malformed managed tags (preflight scans the namespace and fails on any of these, even if the bad tag is not the one being created or validated):

- `malformed managed tag <name>: lightweight tag is not allowed` — local lightweight ref.
- `malformed managed tag <name>: remote annotation cannot be proven` — remote ref lacks a peeled `^{}` record.
- `malformed managed tag <name>: canonical SemVer is invalid` — `{version}` capture is not canonical SemVer.
- `malformed managed tag <name>: build metadata is invalid` — capture contains `+build`.
- `malformed managed tag <name>: wrong prerelease shape for channel <channel>` — prerelease shape doesn't match the channel's identifier.
- `malformed managed tag <name>: local/remote peeled commits differ` — same-name local and remote tags don't peel to the same commit.

Legacy adoption boundary:

- `tag <name> predates Tagsmith adoption boundary initialVersion <initialVersion> and is outside managed history` — the tag matches the pattern, but its parsed base version is less than or equal to `initialVersion`. Tagsmith treats it as pre-adoption history; validate a newer managed tag instead.

Dependencies (same wording shared by `tag` and `validate` with different subject):

- `channel <name> depends on missing channel <name>` — config-level reference to a non-existent dependency channel (also caught at config validation; included here when re-checked at release time).
- `resolved <tag> requires dependency tag for <channel> at <base>` — the dependency tag at that base does not exist.
- `dependency tag <name> must exist locally and remotely`
- `dependency tag <name> must peel to <subject> <commit>` — `<subject>` is `HEAD` during `tag`, the validated tag's commit during `validate`.
- `dependency tag <name> must peel to validated tag commit <commit>` — `validate` form when the peel differs.

## `validate` target and tag selection

- `tag <name> does not match target <target>` — `--target` asserted but the tag doesn't match that target's pattern.
- `tag <name> does not match any configured target` — without `--target`, the tag matches no target.
- `tag <name> matches multiple targets` — without `--target`, the tag is ambiguous across multiple targets.
- `tag <name> must contain canonical SemVer without build metadata`
- `tag <name>: <reason>` — `<reason>` is the channel-classification message (e.g. `wrong prerelease shape for channel <channel>`).
- `--channel <name> does not match inferred channel <channel>` — asserted `--channel` disagrees with the channel parsed from the tag's prerelease identifier.
- `tag <name> must exist locally`
- `tag <name> must exist remotely`
- `tag <name> must exist locally and remotely`
- `tag <name> is not a valid managed tag`

## Push and post-push verification

- `local tag <tag> exists but was not pushed: <git-error>`
- `push verification failed for <tag>: <error>. Local tag remains.`
- `push verification failed for <tag>: remote tag does not peel to <commit>. Local tag remains.`

In every push-related failure, Tagsmith **does not roll back the local tag**. Recovery is yours — see [Non-rollback](./git-safety#non-rollback).

## GitHub output formatter

- `validate failed: failed to write GitHub output: <message>` — wrapper when appending to `$GITHUB_OUTPUT` fails.
- `GitHub output key must be an identifier.` — internal sanity check on emitted keys.
- `GitHub output value for <key> must be single-line printable text.` — control character or newline in a value.

## How to read an error

1. Strip the `tagsmith failed: ` prefix and find the matching line above. Substitute the `<placeholders>` in your head against the runtime values in the message.
2. The error message names the source — config field, Git state, CLI flag, tag name, remote, or path.
3. Apply the remediation. There is no `--force` to bypass safety guards (working tree clean, HEAD equality, dependency gates, push verification). If you need to override a check, fix the underlying state first.
