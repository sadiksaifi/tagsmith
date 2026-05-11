---
title: tagsmith targets
outline: deep
---

# `tagsmith targets`

Lists configured release targets. Validates config and target paths; does not inspect Git tags, remotes, or remote refs.

## Synopsis

```sh
tagsmith targets
tagsmith targets --json
```

## Flags

| Flag     | Description                            |
| -------- | -------------------------------------- |
| `--json` | Emit the parsed config object as JSON. |

`--github-output` and `--verbose` (with machine output) are not accepted.

## Behavior

1. Discover repo.
2. Load and validate config.
3. Validate every configured target path (exists, is a directory, inside repo realpath, unique by realpath).
4. Print results.

Config warnings (e.g. tag pattern warnings) appear on stderr in human mode. Machine mode suppresses warnings.

## Output

### Human mode

One block per target in config order, separated by a blank line:

```
web
  path: apps/web
  channels: alpha (prerelease), beta (prerelease, dependsOn: alpha), rc (prerelease, dependsOn: beta), stable (stable, dependsOn: rc)
  tagPattern: {target}@{version}
  tagMessage: Release {target} {version}
  initialVersion: 0.0.0

api
  path: apps/api
  channels: alpha (prerelease), beta (prerelease, dependsOn: alpha), rc (prerelease, dependsOn: beta), stable (stable, dependsOn: rc)
  tagPattern: {target}@{version}
  tagMessage: Release {target} {version}
  initialVersion: 0.0.0
```

### `--json` mode

Writes the **raw parsed config object** with original key order preserved. Comments and trailing commas are excluded. `$schema` is included only if present in the source file. Target-level overrides are included only if present; inherited defaults are **not** materialized.

```json
{
  "$schema": "https://raw.githubusercontent.com/sadiksaifi/tagsmith/refs/heads/main/schema/v1.json",
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
    },
    "api": {
      "path": "apps/api",
      "channels": [
        /* ... */
      ]
    }
  }
}
```

## When to use it

- After editing `.tagsmith.jsonc` to confirm Tagsmith accepts the new shape.
- In CI pre-checks that don't need to read remote refs.
- To feed the parsed config into other tooling (`targets --json | jq ...`).
- During setup with AI, as the sanity check after the agent writes the config.

`targets` is the cheapest sanity check — no remote reads, no tag scans.
