---
title: "tagsmith tag command reference"
description: "Reference the tagsmith tag command for resolving SemVer versions, creating annotated Git tags, dry-running releases, pushing tags, and using interactive flows."
outline: deep
---

# `tagsmith tag`

Resolves a release version, creates an annotated Git tag at `HEAD`, and optionally pushes it.

## Synopsis

```sh
tagsmith tag --channel <name> --bump <type>
tagsmith tag --channel <name> --version <semver>
tagsmith tag --target <name> --channel <name> --bump <type>
tagsmith tag --target <name> --channel <name> --bump <type> --push
tagsmith tag --target <name> --channel <name> --bump <type> --dry-run --json
```

## Flags

| Flag                 | Required                                                               | Description                                                                      |
| -------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `--target <name>`    | required when config has multiple targets; optional with single target | Selects the target.                                                              |
| `--channel <name>`   | **required**                                                           | Selects the channel. Must exist in the target's channel set.                     |
| `--bump <type>`      | one of `--bump`/`--version` required                                   | `major`, `minor`, `patch`, or `prerelease`. Stable channels reject `prerelease`. |
| `--version <semver>` | one of `--bump`/`--version` required                                   | Explicit canonical SemVer. Must match the channel's shape.                       |
| `--dry-run`          | optional                                                               | Runs full [preflight](../preflight) and skips create/push.                       |
| `--push`             | optional                                                               | After local create, pushes to `git.remote` and verifies.                         |
| `--json`             | optional                                                               | Machine output. See [Output modes](../output).                                   |

`--bump` and `--version` are mutually exclusive. `--github-output` is not accepted on `tag`. `--verbose` is human-only.

## Behavior

In order:

1. Discover repo, load config, validate target paths.
2. Run [preflight](../preflight): working tree clean, read local/remote tags, read remote base branch tip, read HEAD, HEAD equals remote tip.
3. Resolve version against managed tag history. See [Versioning](../versioning).
4. Validate `dependsOn` for the resolved version's base.
5. Render `tagPattern` and `tagMessage`.
6. Create the annotated tag at `HEAD` (skipped on `--dry-run`).
7. If `--push`: push to `git.remote`, then re-read remote tags to verify annotation and peel (skipped on `--dry-run`).

## Resolving version

| Channel strategy | `--bump major`                          | `--bump minor`                          | `--bump patch`                          | `--bump prerelease`                            |
| ---------------- | --------------------------------------- | --------------------------------------- | --------------------------------------- | ---------------------------------------------- |
| `stable`         | next major from latest stable           | next minor from latest stable           | next patch from latest stable           | rejected                                       |
| `prerelease`     | new line at `<bumped-base>-<channel>.1` | new line at `<bumped-base>-<channel>.1` | new line at `<bumped-base>-<channel>.1` | continues highest same-channel line: `N → N+1` |

If no stable tag exists yet, bumps resolve from `initialVersion`. `--bump prerelease` fails if no same-channel prerelease exists; start a line with `--bump major|minor|patch` or `--version`.

See [Versioning](../versioning) for the full rules and worked examples.

## Single-target auto-selection

When the config has exactly one target, `--target` is optional. With multiple targets and no `--target`, Tagsmith fails with `tag requires --target when config has multiple targets`.

## Interactive flow

In an eligible TTY (no `--json`, no CI, etc.) Tagsmith fills omissions only:

1. Resolves Git repo, loads config, validates target paths.
2. Selects target — automatic if single-target; prompts if `--target` is missing and multiple targets exist.
3. Selects channel — automatic if single channel; prompts if `--channel` is missing and multiple channels exist.
4. Prompts for version intent if neither `--bump` nor `--version` was given:
   - "bump" → choose `major | minor | patch | prerelease` (filtered by strategy; `stable` channels show only the first three).
   - "explicit version" → enter a SemVer literal with strategy-shaped hints.
5. Runs full preflight.
6. Shows a **review screen** with target, channel, strategy, version intent, resolved version, rendered tag, rendered annotated message, full commit SHA, and the equivalent non-interactive command.
7. Asks for confirmation:
   - **Without `--push`:** "local create" / "create and push" / "no action". Default: local create.
   - **With `--push`:** confirm or cancel. Default: cancel (safe-negative).
8. Executes the chosen action.

Cancellation (Ctrl+C or selecting the safe-negative) exits 1 with `tagsmith failed: tagsmith cancelled.` and no mutation.

Even when **all** flags are supplied, the review/confirmation still runs in interactive mode. That's intentional. In non-interactive mode (CI, machine output, non-TTY), Tagsmith executes without confirmation as long as preflight passes.

## Output

`tag --json` and `tag --dry-run --json` share the same 11-key shape — see [Output modes](../output).

Human-mode success after create:

```
Tagged v1.2.3 (1.2.3) for target app channel stable.
Commit: 012345678901
Created: yes
Pushed: yes
```

Human-mode dry-run:

```
Resolved v1.2.3 (1.2.3) for target app channel stable.
Commit: 0123456789abcdef0123456789abcdef01234567
Dry run: No tag was created.
Because --push was provided, Tagsmith would have pushed the tag.
```

## Errors

The most common `tag` failures:

- `working tree must be clean before tagging`
- `HEAD must equal <remote>/<baseBranch> (<sha>) before tagging`
- `Cannot bump prerelease for <target> <channel>: no existing <channel> prerelease tag found. …`
- `stable channel <name> rejects --bump prerelease`
- `local tag <tag> exists but was not pushed: <git-error>`
- `push verification failed for <tag>: remote tag does not peel to <commit>. Local tag remains.`

See [Error catalogue](../errors) for the full list. Tagsmith does **not** roll back the local tag on push failure.
