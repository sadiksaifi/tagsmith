---
title: "tagsmith init command reference"
description: "Reference the tagsmith init command for creating, overwriting, previewing, and customizing the .tagsmith.jsonc release configuration template."
outline: deep
---

# `tagsmith init`

Creates a Tagsmith config file at the repo root (or wherever `--config` points).

## Synopsis

```sh
tagsmith init
tagsmith init --force
tagsmith init --dry-run
tagsmith init --dry-run --force
```

## Flags

| Flag        | Type    | Description                                                                                       |
| ----------- | ------- | ------------------------------------------------------------------------------------------------- |
| `--force`   | boolean | Overwrite an existing config. Without this, `init` refuses to clobber a file that already exists. |
| `--dry-run` | boolean | Print the exact template bytes to stdout. Writes nothing. Skips destination/overwrite checks.     |

`init` does not accept `--json` or `--github-output`. `--dry-run` puts output in raw mode (template bytes only, no color, no chatter).

## Behavior

- Requires a Git repository. Resolves the destination as `<repoRoot>/.tagsmith.jsonc` unless `--config <path>` overrides.
- Refuses to overwrite an existing file unless `--force` is supplied.
- Fails if the destination parent directory does not exist.
- `--dry-run` performs no I/O on the destination and is compatible with `--force` (the `--force` is a no-op in dry-run).

## What the template contains

The template ships with three example targets (`web`, `api`, `auth`) and a full `alpha → beta → rc → stable` channel ladder. These are **illustrative**. Edit the file before running `tag`, `validate`, or `targets`, since they validate every configured target path and fail when a path doesn't exist.

The template is canonical: it is generated from `src/core/init/init-template.ts` and writes the same bytes for every user, with a trailing newline.

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
        /* alpha → beta → rc → stable */
      ],
    },
    "api": {
      "path": "apps/api",
      "channels": [
        /* alpha → beta → rc → stable */
      ],
    },
    "auth": {
      "path": "packages/auth",
      "channels": [
        /* alpha → beta → rc → stable */
      ],
    },
  },
}
```

## Interactive flow

In an eligible TTY, `init` shows a review/confirmation before writing:

- If the destination does not exist, you confirm creation.
- If it exists and you didn't pass `--force`, you choose between "overwrite" and the safe-negative option (default: safe-negative).
- If it exists and you did pass `--force`, the overwrite is explicit but you still confirm before mutation.

`init --dry-run` is raw mode and never prompts, even in a TTY.

## Output

- **Human (success):** `Created Tagsmith config at <absolute-path>`
- **`--dry-run` (raw):** the exact template bytes to stdout, no extra lines.
- **Failure:** `tagsmith failed: <message>` on stderr, exit 1.

## Why no `init --json`

`init` is a write operation that produces a deterministic byte-identical template; there is no useful JSON shape to expose. `--dry-run` gives you the exact bytes for inspection.
