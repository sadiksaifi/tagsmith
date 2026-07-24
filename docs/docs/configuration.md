---
title: "Tagsmith JSONC configuration reference"
description: "Reference every Tagsmith .tagsmith.jsonc field, including git settings, defaults, targets, channels, tag patterns, tag messages, and SemVer validation rules."
outline: deep
---

# Configuration reference

Tagsmith reads a JSONC config file. The default path is `<repo-root>/.tagsmith.jsonc`. Use `--config <path>` to override. Relative paths resolve from the **repo root**, not the current directory. Absolute paths are used as-is, even when the file is outside the repo.

## File format

- Plain UTF-8 JSON with comments and trailing commas.
- Comments: line (`//`) and block (`/* */`).
- Unknown keys, duplicate object keys, and the reserved key `__proto__` are rejected at parse time with a field path.
- `~` is **not** expanded by Tagsmith.

## Schema URL

```
https://tagsmith.site/schema/v1.json
```

Add `"$schema": "<url>"` (optional, recommended) for editor completion. `init` writes it for you.

## Top-level shape

```jsonc
{
  "$schema": "https://tagsmith.site/schema/v1.json",
  "configVersion": 1,

  "git": { "remote": "...", "baseBranch": "..." },

  "defaults": {
    "tagPattern": "...",
    "tagMessage": "...",
    "initialVersion": "...",
  },

  "targets": {
    "<targetName>": {
      /* target config */
    },
  },
}
```

| Field           | Required     | Type   | Description                                                               |
| --------------- | ------------ | ------ | ------------------------------------------------------------------------- |
| `$schema`       | optional     | string | JSON Schema URL. Whatever value you set is preserved in `targets --json`. |
| `configVersion` | **required** | `1`    | Must be the literal `1`. No other version is supported.                   |
| `git`           | **required** | object | Repository-wide Git policy. No per-target Git config.                     |
| `defaults`      | **required** | object | Values inherited by every target unless overridden.                       |
| `targets`       | **required** | object | At least one named target. Keys are target names.                         |

## `git`

```jsonc
"git": {
  "remote": "origin",
  "baseBranch": "main"
}
```

| Field        | Required     | Rule                                                                                                                                                               |
| ------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `remote`     | **required** | Non-empty, no whitespace, no slash. Must be the name of a configured Git remote (typically `origin`). URLs are rejected.                                           |
| `baseBranch` | **required** | Unqualified branch name. `main`, `release/1.x` are valid (the slash is part of an unqualified branch name). `origin/main`, `refs/heads/main`, `HEAD` are rejected. |

There is no per-target Git config. Every target uses the same `remote` and `baseBranch`. The `tag` command uses `remote` for tag history and optional pushes. `validate` preserves `baseBranch` in human, JSON, and GitHub output for release metadata, but neither command requires a tag commit to be reachable from that branch.

## `defaults`

```jsonc
"defaults": {
  "tagPattern": "{target}@{version}",
  "tagMessage": "Release {target} {version}",
  "initialVersion": "0.0.0"
}
```

All three fields are **required**. Targets inherit them unless they override.

| Field            | Rule                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tagPattern`     | See [Tag patterns](./tag-patterns).                                                                                                                                                                                                                                                                                                                                          |
| `tagMessage`     | See [`tagMessage` grammar](#tagmessage-grammar).                                                                                                                                                                                                                                                                                                                             |
| `initialVersion` | Canonical stable SemVer: `X.Y.Z`. No leading `v`, no prerelease, no build metadata, no leading zeros, no whitespace. Acts as both the **adoption boundary** and the **bump baseline** when no newer managed stable tag exists. Existing matching tags whose base version is less than or equal to `initialVersion` are treated as legacy history, not managed Tagsmith tags. |

## `targets`

Object keyed by target name. At least one entry required.

```jsonc
"targets": {
  "web": {
    "path": "apps/web",
    "channels": [
      { "name": "alpha", "strategy": "prerelease" },
      { "name": "beta",  "strategy": "prerelease", "dependsOn": ["alpha"] },
      { "name": "rc",    "strategy": "prerelease", "dependsOn": ["beta"]  },
      { "name": "stable","strategy": "stable",     "dependsOn": ["rc"]    }
    ]
  }
}
```

### Target keys

Target names must match `^[a-z][a-z0-9-]*$`. Case-sensitive. Names live in their own namespace; a channel may share a name with a target without conflict.

### Per-target fields

| Field            | Required     | Rule                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`           | **required** | Relative paths resolve from the repo root; absolute paths used as-is. The realpath must exist as a directory, stay inside the repo realpath, and be unique across all targets. Nested target paths are allowed if they resolve to different directories. `init` may emit example paths that don't exist; you must edit them before any config-required command passes. |
| `channels`       | **required** | Array, at least one entry. Exactly one channel must have `strategy: "stable"`. See [Channels](#channels).                                                                                                                                                                                                                                                              |
| `tagPattern`     | optional     | Overrides `defaults.tagPattern`. Same grammar.                                                                                                                                                                                                                                                                                                                         |
| `tagMessage`     | optional     | Overrides `defaults.tagMessage`. Same grammar.                                                                                                                                                                                                                                                                                                                         |
| `initialVersion` | optional     | Overrides `defaults.initialVersion`. Same rules.                                                                                                                                                                                                                                                                                                                       |

### Multi-target pattern ambiguity

When effective patterns of two targets could match the same Git tag, config validation fails with `targets <A> and <B> have ambiguous effective tagPattern <pattern>`. The classic mistake is using `defaults.tagPattern: "v{version}"` with multiple targets — both would match `v1.2.3`. Use `{target}@{version}` for monorepos, or set distinct per-target overrides.

## Channels

Each channel entry:

```jsonc
{ "name": "rc", "strategy": "prerelease", "dependsOn": ["beta"] }
```

| Field       | Required     | Rule                                                                          |
| ----------- | ------------ | ----------------------------------------------------------------------------- |
| `name`      | **required** | Matches `^[a-z][a-z0-9-]*$`. Unique within the target.                        |
| `strategy`  | **required** | `"prerelease"` or `"stable"`. Exactly one channel per target has `"stable"`.  |
| `dependsOn` | optional     | Array of channel names in the **same** target. No self-references. No cycles. |

### Channel rules

- A target may have only the stable channel (`channels: [{ "name": "stable", "strategy": "stable" }]`).
- The stable channel's `name` does not need to be `stable`. The strategy is what matters. Convention is `stable`; older configs may use other names.
- `dependsOn` is direct and validation-only — see [Mental model](./concepts#dependson). It does not influence version resolution.
- Targets do not share channels. To gate `api@stable` on `web@stable`, you cannot; `dependsOn` is intra-target only.

## `tagPattern` grammar

See [Tag patterns](./tag-patterns) for the full grammar, allowed characters, ambiguity rules, and warnings.

## `tagMessage` grammar

```jsonc
"tagMessage": "Release {target} {version}"
```

- Placeholders: `{target}`, `{version}`, `{tag}` (all optional, any number of each).
- Must be printable single-line text. Control characters and newlines are rejected.
- The final rendered message must be non-empty.
- Tagsmith **never executes** `tagMessage`; it is annotation message data only.
- `validate` renders `tagMessage` from current config; it does not read or compare the existing annotated tag's actual message.

## SemVer policy

Pure SemVer everywhere a version appears (`initialVersion`, `--version`, parsed managed tags). Tagsmith does not normalize versions.

Valid:

```
1.2.3
1.2.4-rc.1
1.2.4-pre-prod.1
1.0.0-alpha.42
```

Invalid:

```
v1.2.3            // leading v
1.2.3+build.5     // build metadata
1.2.4-rc          // missing prerelease counter
1.2.4-rc.0        // prerelease counter must be ≥ 1
01.2.3            // leading zero
1.02.3
1.2.03
```

Prerelease counters start at `1`. Hyphenated channel names render as a single prerelease identifier (e.g. `pre-prod` channel produces `1.2.3-pre-prod.1`).

## Parse and validation errors

Parse errors (returned as `<filePath>: <message>`):

- `<filePath>: malformed JSONC (<ParseErrorCode>)`
- `<filePath>: reserved key __proto__ at <jsonPath>`
- `<filePath>: duplicate key <name> at <jsonPath>`
- `<filePath>: <fieldPath>: unrecognized keys`
- `<filePath>: <fieldPath>: <zod message>`

Validation errors (returned as `<filePath>: <message>`, first failure wins):

- `git.remote must be a safe configured remote name without whitespace or slash`
- `git.baseBranch must be an unqualified branch name`
- `defaults.initialVersion must be canonical stable SemVer without build metadata or leading v`
- `targets must contain at least one target`
- `targets.<name> must match /^[a-z][a-z0-9-]*$/u`
- `targets.<name>.channels contains duplicate channel <name>`
- `targets.<name>.channels must contain exactly one stable channel`
- `targets.<name>.channels.<name>.dependsOn may not depend on self`
- `targets.<name>.channels.<name>.dependsOn references missing channel <name>`
- `targets.<name>.channels dependency cycle is invalid`
- `targets.<name>.tagPattern …` — see [Tag patterns](./tag-patterns)
- `targets.<name>.tagMessage must be printable single-line text`
- `targets.<name>.tagMessage must be non-empty after interpolation`
- `targets.<name>.tagPattern renders an unsafe Git tag name`
- `targets <A> and <B> have ambiguous effective tagPattern <pattern>`

See the [Error catalogue](./errors) for the full set.

## Example: single-target

```jsonc
{
  "$schema": "https://tagsmith.site/schema/v1.json",
  "configVersion": 1,

  "git": { "remote": "origin", "baseBranch": "main" },

  "defaults": {
    "tagPattern": "v{version}",
    "tagMessage": "Release {version}",
    "initialVersion": "0.0.0",
  },

  "targets": {
    "app": {
      "path": ".",
      "channels": [
        { "name": "rc", "strategy": "prerelease" },
        { "name": "stable", "strategy": "stable", "dependsOn": ["rc"] },
      ],
    },
  },
}
```

## Example: monorepo with full ladder

```jsonc
{
  "$schema": "https://tagsmith.site/schema/v1.json",
  "configVersion": 1,

  "git": { "remote": "origin", "baseBranch": "main" },

  "defaults": {
    "tagPattern": "{target}@{version}",
    "tagMessage": "Release {target} {version}",
    "initialVersion": "0.0.0",
  },

  "targets": {
    "web": {
      "path": "apps/web",
      "channels": [
        { "name": "alpha", "strategy": "prerelease" },
        { "name": "beta", "strategy": "prerelease", "dependsOn": ["alpha"] },
        { "name": "rc", "strategy": "prerelease", "dependsOn": ["beta"] },
        { "name": "stable", "strategy": "stable", "dependsOn": ["rc"] },
      ],
    },

    "api": {
      "path": "apps/api",
      "channels": [
        { "name": "alpha", "strategy": "prerelease" },
        { "name": "beta", "strategy": "prerelease", "dependsOn": ["alpha"] },
        { "name": "rc", "strategy": "prerelease", "dependsOn": ["beta"] },
        { "name": "stable", "strategy": "stable", "dependsOn": ["rc"] },
      ],
    },

    "auth": {
      "path": "packages/auth",
      "tagPattern": "pkg-auth@{version}",
      "tagMessage": "Release auth package {version}",
      "initialVersion": "1.0.0",
      "channels": [
        { "name": "rc", "strategy": "prerelease" },
        { "name": "stable", "strategy": "stable", "dependsOn": ["rc"] },
      ],
    },
  },
}
```

The `auth` target overrides all three defaults — different pattern (so `pkg-auth@1.0.0` instead of `auth@1.0.0`), different message, different baseline. Useful when migrating from a legacy tag namespace.
