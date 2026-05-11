---
title: "SemVer version bumps and prerelease channels"
description: "Understand how Tagsmith resolves SemVer major, minor, patch, and prerelease bumps across stable channels, alpha, beta, rc flows, and explicit versions."
outline: deep
---

# Versioning and bumps

Tagsmith resolves the next version from one of two inputs:

- `--bump major | minor | patch | prerelease` — incremental bump from existing tag history (or `initialVersion`).
- `--version <semver>` — explicit version literal.

Exactly one is required on `tag`.

## SemVer policy

All versions are canonical SemVer **without** build metadata and **without** a leading `v`.

Valid:

```
1.2.3
1.2.4-rc.1
1.2.4-pre-prod.1
```

Invalid:

```
v1.2.3
1.2.3+build.5
1.2.4-rc        // prerelease counter required
1.2.4-rc.0      // counter must be ≥ 1
01.2.3
1.02.3
1.2.03
```

Prerelease counters start at `1`. Hyphenated channel names form a single prerelease identifier (so the `pre-prod` channel produces `1.2.3-pre-prod.1`, not `1.2.3-pre-prod-1`).

## Stable channels

The latest stable for a target is the maximum `X.Y.Z` across all managed stable tags for that target.

| Bump         | Result                                                          |
| ------------ | --------------------------------------------------------------- |
| `major`      | `<latest.major + 1>.0.0`                                        |
| `minor`      | `<latest.major>.<latest.minor + 1>.0`                           |
| `patch`      | `<latest.major>.<latest.minor>.<latest.patch + 1>`              |
| `prerelease` | **rejected**: `stable channel <name> rejects --bump prerelease` |

If no stable tag exists yet for the target, the bump resolves from `initialVersion`.

### Stable ignores prerelease lines

Stable bumps look at stable tags only. Prerelease tags at higher bases do not influence the next stable bump.

Worked example:

- latest `stable` tag: `1.2.0`
- latest `beta` tag: `1.4.0-beta.1`
- `--channel stable --bump minor` → `1.3.0`

The `1.4.0-beta.1` line is ignored. To promote `1.4.0-beta.1` to stable, use `--version 1.4.0` or first promote it through the dependency chain.

## Prerelease channels

The latest prerelease for a target+channel is the maximum SemVer across managed prerelease tags whose prerelease identifier is the channel name. The base version is the `X.Y.Z` part.

| Bump         | Result                                                                             |
| ------------ | ---------------------------------------------------------------------------------- |
| `major`      | new line at `<latest.major + 1>.0.0-<channel>.1`                                   |
| `minor`      | new line at `<latest.major>.<latest.minor + 1>.0-<channel>.1`                      |
| `patch`      | new line at `<latest.major>.<latest.minor>.<latest.patch + 1>-<channel>.1`         |
| `prerelease` | continues the highest existing same-target / same-channel line by incrementing `N` |

The bumped base computation reads from the **latest stable tag** for the target (or `initialVersion`), not from the latest prerelease. Each prerelease bump major/minor/patch starts a fresh line at counter `1`.

### `--bump prerelease` requires an existing line

`--bump prerelease` fails if there is no managed prerelease tag for the target+channel yet:

```
Cannot bump prerelease for <target> <channel>: no existing <channel>
prerelease tag found. Use --bump major, --bump minor, --bump patch,
or --version to start a prerelease line.
```

Start a line with `--bump major|minor|patch` or `--version` first.

### Worked example: a full ladder

Starting state: no tags. `initialVersion` is `0.0.0`. Channels: `alpha`, `beta`, `rc`, `stable`.

```sh
# Cut alpha.1 at a fresh minor line.
tagsmith tag --target app --channel alpha --bump minor          # → 0.1.0-alpha.1

# Continue alpha line.
tagsmith tag --target app --channel alpha --bump prerelease     # → 0.1.0-alpha.2

# Promote to beta. Same base.
tagsmith tag --target app --channel beta --version 0.1.0-beta.1 # → 0.1.0-beta.1

# Cut rc against beta.
tagsmith tag --target app --channel rc --version 0.1.0-rc.1     # → 0.1.0-rc.1

# Promote to stable. dependsOn rc → highest same-base rc must exist.
tagsmith tag --target app --channel stable --bump minor         # → 0.1.0
```

(Each `tag` invocation also requires the channel's `dependsOn` chain to be satisfied at the same base, see [Mental model](./concepts#dependson).)

## Explicit `--version`

`--version <semver>` skips bump computation but does not skip validation.

Stable channels require the literal to be:

- canonical stable SemVer (no prerelease, no build metadata, no leading `v`)
- **strictly greater** than the latest stable for the target — or **greater than or equal to** `initialVersion` if no stable exists

Prerelease channels require the literal to:

- match shape `X.Y.Z-<selected-channel>.N` with `N` ≥ 1
- be strictly greater than the latest same-target / same-channel prerelease
- have a base `X.Y.Z` **strictly greater than** the latest stable, if any stable exists

You may skip numbers (`--version 5.0.0` after `1.2.0` is fine). You cannot go backwards.

## Monotonicity

Versions move forward only. Tagsmith never overwrites or reorders existing tags. If you need to abandon a version, pick the next one.

## How Tagsmith counts "existing tags"

A tag is **managed** when it matches the target's effective `tagPattern` literals. Within the managed namespace:

- Lightweight tags are malformed and fail preflight.
- Tags with build metadata or non-canonical SemVer in the `{version}` capture are malformed.
- Tags below `initialVersion` are malformed.
- Tags whose local and remote refs peel to **different** commits are malformed.
- Remote tags that cannot be proven annotated (e.g. missing `^{}` peel record) are malformed.

Malformed managed tags fail `tag` and `validate` even if they aren't the tag you're trying to create or validate. They never silently get ignored. The fix is to delete/rename them or to switch to a fresh namespace via a target-level `tagPattern` override (e.g. `tagPattern: "managed-v{version}"`).

Tags **outside** the managed namespace (anything that does not match the literal parts of the pattern) are ignored. Tagsmith does not look at them.

## `initialVersion`

- Canonical stable SemVer. No prerelease, no build metadata, no leading `v`.
- Acts as both the **minimum managed baseline** (managed tags below it are malformed) and the **bump baseline** when no stable tag exists.
- `--bump` never **creates** `initialVersion`; it increments from it.
- Tags **equal to** `initialVersion` are allowed.

Worked example: `initialVersion: "1.0.0"`, no stable tags exist. `--channel stable --bump patch` resolves to `1.0.1`. `--channel stable --bump minor` resolves to `1.1.0`. There is no way to land on `1.0.0` itself via `--bump`; use `--version 1.0.0` instead.
