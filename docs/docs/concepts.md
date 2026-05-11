---
title: "Tagsmith release targets, channels, and versions"
description: "Learn the Tagsmith mental model for release targets, stable and prerelease channels, SemVer bumps, dependency gates, managed tags, and interactive flows."
outline: deep
---

# Mental model

This page explains the concepts that show up across every Tagsmith command and config field. Everything else in these docs maps back to here.

## Target

A **target** is a releasable unit in the repository. In a single-app repo there is exactly one target (often named `app` or the project name); in a monorepo there are typically several (`web`, `api`, `auth`, ...).

Every target has:

- a unique **name** matching `^[a-z][a-z0-9-]*$`
- a **path** that resolves from the repo root, must exist as a directory, must stay inside the repo's realpath, and must be unique by realpath across all targets
- a **channel set** (at least one channel; exactly one must have `strategy: "stable"`)
- optional overrides for `tagPattern`, `tagMessage`, and `initialVersion` (defaults inherit from the top-level `defaults` block)

Target names and channel names are case-sensitive. Tagsmith never normalizes case. Target and channel names live in separate namespaces — a channel may share a name with a target.

## Channel

A **channel** is a release line within a target. Each channel has:

- a **name** matching `^[a-z][a-z0-9-]*$`, unique within the target
- a **strategy** — either `"stable"` or `"prerelease"`
- an optional **`dependsOn`** array of channel names in the same target

There is exactly one `"stable"` channel per target. Convention is to call it `stable`, but the name doesn't matter; the strategy controls behavior. `"prerelease"` channels are everything else (`alpha`, `beta`, `rc`, custom names).

Channel name semantics:

- For `"prerelease"` channels, the channel name is encoded in the SemVer prerelease identifier. `rc` channel produces `1.2.3-rc.1`, `1.2.3-rc.2`, etc.
- For the `"stable"` channel, the name is never encoded in the version or the tag. `1.2.3` is just `1.2.3`.

## Strategy

- **`"stable"`** — versions are canonical stable SemVer (`X.Y.Z`, no prerelease, no build metadata). Allowed bumps: `major`, `minor`, `patch`. `--bump prerelease` is rejected.
- **`"prerelease"`** — versions have a prerelease identifier matching the channel name (`X.Y.Z-<channel>.N` with `N` ≥ 1). All four bumps are allowed.

## Base version

The **base version** of a release is its stable `X.Y.Z`. For stable channels, the base version equals the version. For prerelease channels, the base version is the `X.Y.Z` part before the `-`. So `1.2.3-rc.1` has base version `1.2.3`, and so does the eventual stable `1.2.3`.

Base versions matter for two reasons:

1. **`dependsOn` is evaluated at the same base.** Tagsmith requires the dependency channel's tag at the same base, locally and remotely, peeling to the current `HEAD`. The exact tag depends on the dependency channel's strategy: a `prerelease` dependency means the highest `<base>-<channel>.N` (e.g. tagging `1.2.3` on `stable` with `dependsOn: ["rc"]` requires `1.2.3-rc.N` for the highest existing `N`); a `stable` dependency means the canonical `<base>` tag itself.
2. **Stable bumps ignore prerelease lines.** A prerelease at a higher base doesn't influence the next stable bump. Worked example: latest stable `1.2.0`, latest beta `1.4.0-beta.1`, `--channel stable --bump minor` resolves to `1.3.0`.

## Bump

Tagsmith resolves the next version one of two ways:

- **`--bump major | minor | patch | prerelease`** — incremental bump from existing tag history (or from `initialVersion` when there is no tag history for that target).
- **`--version <semver>`** — explicit version literal. Tagsmith still enforces channel shape, monotonicity, and `dependsOn`.

Exactly one of `--bump` or `--version` is required.

### Stable channels

Latest stable for the target is the maximum `X.Y.Z` across all stable tags managed by Tagsmith for that target.

- `--bump major` → `<latestStable.major + 1>.0.0`
- `--bump minor` → `<latestStable.major>.<latestStable.minor + 1>.0`
- `--bump patch` → `<latestStable.major>.<latestStable.minor>.<latestStable.patch + 1>`
- `--bump prerelease` → **rejected** (stable channels cannot bump prerelease)

If no stable tag exists, the bump resolves from `initialVersion`.

### Prerelease channels

- `--bump major | minor | patch` — start a **new prerelease line** at `X.Y.Z-<channel>.1`, where `X.Y.Z` is the bumped base computed from the latest stable (or `initialVersion`).
- `--bump prerelease` — continue the **highest existing** same-target / same-channel line by incrementing `N`. Fails with an actionable error if no prerelease tag exists yet for that channel — you must start a line with `--bump major|minor|patch` or `--version` first.

Worked example: latest stable `1.2.0` for target `app`, no `rc` tags yet. `--channel rc --bump minor` produces `1.3.0-rc.1`. The next `--channel rc --bump prerelease` produces `1.3.0-rc.2`. A subsequent `--channel rc --bump major` then starts a fresh line at `2.0.0-rc.1`.

Each prerelease bump still has to be **strictly greater** than the latest existing same-target / same-channel prerelease. After `1.3.0-rc.2`, `--bump patch` would resolve to `1.2.1-rc.1` (base `1.2.1` from latest stable `1.2.0`), which is less than `1.3.0-rc.2` — Tagsmith rejects it. Use `--bump major` to leap above the existing line, or `--version` to set the line explicitly.

### Explicit `--version`

`--version` accepts the same shapes the matching strategy would produce. Tagsmith enforces:

- stable: canonical `X.Y.Z`, strictly greater than the latest stable for this target (or ≥ `initialVersion` if no stable exists).
- prerelease: `X.Y.Z-<selected-channel>.N` with `N` ≥ 1, strictly greater than the latest same-target / same-channel prerelease, and (if any stable exists) the base must be strictly greater than the latest stable.
- `dependsOn` is enforced just like a bumped version.

You can skip numbers — `--version 5.0.0` after `1.2.0` is fine — but you can't go backwards.

## `dependsOn`

`dependsOn` is a **direct, validation-only gate** between channels in the same target.

- Direct only — Tagsmith does not transitively walk dependencies. If `stable` `dependsOn: ["rc"]` and `rc` `dependsOn: ["beta"]`, tagging `stable` checks `rc` at the same base but does not also check `beta`. (Indirect coverage comes from your own promotion discipline.)
- Same target only — you cannot depend on a channel in another target.
- No self-dependencies, no cycles — both are config-validation errors.
- **Does not participate in version resolution.** `dependsOn` is checked **after** the version has been resolved; it cannot influence which version comes next.
- Evaluated at the same base. The dependency tag must exist locally **and** remotely, both must peel to the same commit, and that commit must equal the current `HEAD` when creating the tag. During `validate`, both must peel to the validated tag's commit. The exact dependency tag depends on the dependency channel's strategy:
  - `prerelease` dependency — the highest `<base>-<channel>.N`. For `stable` `dependsOn: ["rc"]` at base `1.2.3`, that's the highest `1.2.3-rc.N`.
  - `stable` dependency — the canonical stable `<base>` tag (no prerelease identifier). A channel that depends on `stable` at base `1.2.3` requires the `1.2.3` tag itself to exist.
- If multiple matching prerelease dependency tags exist for the same base, only the **highest** `N` is checked. Stable dependencies have exactly one canonical tag per base.

## Tag and tag message

The Git tag name is rendered from `tagPattern`. The annotated tag message is rendered from `tagMessage`. See [Tag patterns](./tag-patterns) for the full grammar.

- `tagPattern` supports `{target}` (optional, at most once) and exactly one `{version}`. Allowed literal characters: `[a-z0-9._@-]`. Channel name is **never** rendered into the tag name; it's encoded inside the version for prerelease channels.
- `tagMessage` supports `{target}`, `{version}`, `{tag}`. Must be single-line printable text and non-empty after interpolation.

The annotated tag message is **data**, not code. Tagsmith never executes it. `validate` does not compare the existing annotated tag message to the rendered message — only the rendered version, tag, and target.

## Managed namespace

A tag is **managed** by Tagsmith when it matches the target's effective `tagPattern` literals. If the literal parts match but the `{version}` capture is invalid or shaped wrong (e.g. lightweight, has build metadata, wrong prerelease shape, below `initialVersion`, local/remote peel to different commits), it is a **malformed managed tag** and fails the relevant command.

This means Tagsmith is strict **inside** its namespace and ignores tags **outside** it. Migration guidance: if you have legacy tags that conflict, pick a namespace like `tagPattern: "managed-v{version}"` for new releases.

`init` is the only command that doesn't read tags. `targets` validates config and paths but does not read tags or remotes. `tag` and `validate` scan the managed namespace and fail on anything malformed they encounter.

## Reachability

`validate` requires that the validated tag's commit is reachable from `<remote>/<baseBranch>` according to local Git history. Tagsmith **never fetches automatically**, so CI must check out enough history (typically `fetch-depth: 0`) and fetch tags before invoking `validate`. If reachability cannot be proven, `validate` fails with explicit fetch guidance.

## Interactive vs non-interactive

Every interactive decision is also an explicit flag. Tagsmith prompts only when **all** of the following hold:

- stdin and stdout are TTY
- `CI` is unset or falsy (empty, `0`, or `false`)
- no `--help` / `--version`
- no `--json` / `--github-output`
- not `init --dry-run` (raw mode)
- argv parsed cleanly (unknown commands/flags fail before any prompt)

See [Interactive flows](./interactive) for the full eligibility rules and the per-command flow.

## Vocabulary cheat sheet

| Term                      | Meaning                                                                     |
| ------------------------- | --------------------------------------------------------------------------- |
| **Target**                | Named releasable unit with a path and channels.                             |
| **Channel**               | Release line within a target; one is `"stable"`, others are `"prerelease"`. |
| **Strategy**              | `"stable"` or `"prerelease"` — controls allowed bumps and version shape.    |
| **Base version**          | Stable `X.Y.Z` portion. `1.2.3-rc.1` has base `1.2.3`.                      |
| **Bump**                  | `major`, `minor`, `patch`, or `prerelease`.                                 |
| **Managed tag**           | Tag matching a target's effective `tagPattern` literals.                    |
| **Malformed managed tag** | Managed tag whose `{version}` capture or peel state is invalid.             |
| **dependsOn**             | Direct, validation-only gate between channels in the same target.           |
| **Preflight**             | Ordered set of checks run before mutation. See [Preflight](./preflight).    |
