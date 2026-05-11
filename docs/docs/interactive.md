---
title: "Interactive release tagging flows in Tagsmith"
description: "Understand when Tagsmith prompts in a TTY, how interactive init, targets, validate, and tag flows work, and how every prompt maps to explicit CLI flags."
outline: deep
---

# Interactive flows

Tagsmith's contract is **100% non-interactive capability equals 100% interactive capability**. Every interactive decision maps to an explicit flag, and every explicit-flag invocation does the same thing the interactive flow would do. Interactive mode only **fills omissions**; it never reinterprets invalid input.

## Prompt eligibility

Tagsmith opens prompts only when **all** of the following hold:

- argv parsed cleanly (unknown command/flag/shorthand/attached-value/missing-value/invalid-enum/conflict all fail before any prompt)
- `--help` / `-h` not present
- `--version` / `-v` not present
- `--json` not active
- `--github-output` not active
- raw output not active (`init --dry-run`)
- `process.stdin.isTTY === true`
- `process.stdout.isTTY === true`
- `CI` environment variable is unset, empty, `0`, or `false`

Notes:

- **`stderr` being a TTY is not sufficient.** Prompts need both stdin and stdout TTY.
- **`CI=true` disables prompts even on pseudo-TTYs.**
- **`TERM=dumb` does not disable prompts by itself.** Clack decides how much decoration it can render.
- **No `--non-interactive` flag.** TTY/CI detection is sufficient.
- **No `--yes` / `-y`.** Tagsmith does not ship a confirmation skip. If you want non-interactive behavior, supply the flags explicitly.

## Bare `tagsmith`

In an eligible TTY, bare `tagsmith` opens an **action menu** after confirming Git repo context:

```
init      Create a Tagsmith config file.
tag       Resolve, create, and optionally push a release tag.
validate  Validate a release tag and emit CI-safe facts.
targets   List configured release targets.
```

Selecting one runs that command's interactive flow. The menu does not loop — after the chosen command completes, Tagsmith exits.

Bare `tagsmith` in non-TTY contexts prints global help and exits 0. Outside a Git repo, even bare `tagsmith` fails with `Git repository not found from <cwd>`.

### Globals carry into the chosen command

`--config <path>` and `--verbose` may be supplied before bare `tagsmith` and apply to whichever command you pick:

```sh
tagsmith --config ./release/tagsmith.jsonc --verbose
```

`--config` and `--verbose` are **never** prompted — they are explicit-only.

## Per-command interactive flows

### `init`

- If the destination does not exist: confirm creation, then write.
- If it exists and `--force` was **not** given: choose between "overwrite" and the safe-negative option. Default: safe-negative.
- If it exists and `--force` **was** given: confirmation is still required before mutation.
- `init --dry-run` is raw mode and never prompts, even in a TTY.

### `targets`

Non-mutating. Prompts nothing. Renders config warnings via Clack-friendly UI and prints target facts.

### `validate`

Read-only. No mutation confirmation.

- Prompts for `--tag` if missing (manual entry; no discovery).
- If `--target` and `--channel` are missing, offers optional assertions:
  - "infer target and channel from tag" (default)
  - "assert target"
  - "assert target and channel"
- In multi-target configs, asserting a channel requires asserting a target first (otherwise the channel list would be ambiguously merged).

`--json` and `--github-output` bypass all prompts and preserve existing stream contracts.

### `tag`

Input collection order: **target → channel → version intent**. Rationale: channel strategy determines which bump choices are valid.

1. Load and validate config first.
2. **Target**: auto-select if single-target. Otherwise prompt with config-order menu when `--target` missing.
3. **Channel**: auto-select if the target has only one total channel. Otherwise prompt with config-order menu when `--channel` missing.
4. **Version intent**: skip if `--bump` or `--version` was given. Otherwise prompt:
   - "bump" → menu filtered by strategy (`stable` shows `major|minor|patch`; `prerelease` shows all four).
   - "explicit version" → enter a SemVer literal with strategy-shaped hints (stable example: `1.2.3`; prerelease example: `1.2.3-rc.1`).
5. **Preflight** — runs full preflight; on failure, stop **before** review with the canonical error.
6. **Review screen** — shows target, channel, strategy, version intent, resolved version, rendered tag, rendered annotated message, full commit SHA, and the **equivalent non-interactive command** (canonical flag order, shell-escaped).
7. **Confirmation:**
   - Without `--push`: "local create" / "create and push" / "no action". Default: local create.
   - With `--push`: confirm or cancel. Default: cancel (safe-negative).
8. **Execute** the chosen action. On push or post-push verification failure, the local tag remains.

Even when **every** flag is supplied, the review/confirmation still runs in interactive mode. That's intentional — interactive runs always pause before mutation. CI / machine modes / non-TTY runs execute as soon as preflight passes.

`tag --dry-run` in interactive mode shows the dry-run facts and exits with no confirmation prompt.

## No auto-pivot

Interactive `tag` with a missing config fails with the canonical error and may **suggest** `tagsmith init`. It must not auto-launch `init` for you. Each command stays within its own scope.

## Equivalent command rendering

Whenever a review screen shows an equivalent command, it follows strict rules:

- canonical binary name `tagsmith`
- canonical flag order from the shared CLI contract, not user-supplied order
- includes `--config <path>` if the user supplied one
- omits `--verbose` (diagnostic, not workflow intent)
- includes the real command flags: `--target`, `--channel`, `--bump`, `--version`, `--push`, `--dry-run`, `--force` where applicable
- shell-escapes arguments when needed (especially config paths with spaces)
- never includes prompt-only confirmation concepts

Example:

```sh
tagsmith --config './release config/tagsmith.jsonc' tag --target api --channel rc --bump prerelease --push
```

This is the value of the interactive review: it's a copy-paste-ready non-interactive invocation you can drop into CI or a script.

## Cancellation

Cancellation sources:

- Ctrl+C during any prompt.
- Selecting the safe-negative option in a review (e.g. "no action" or "cancel").

Behavior:

- exit code `1`
- no mutation
- no machine output
- no stack trace
- concise message: `tagsmith failed: tagsmith cancelled.`

## Confirmation defaults (matrix)

| Situation                                                   | Default                |
| ----------------------------------------------------------- | ---------------------- |
| `init` overwrites an existing config                        | safe-negative          |
| `tag` with `--push` review                                  | safe-negative (cancel) |
| `tag` without `--push` review                               | local create (primary) |
| `tag` review with no `--push` preselected, three-way action | local create           |

## Output safety

- Interactive mode never emits JSON or GitHub output.
- `--json` and `--github-output` always disable prompts.
- `init --dry-run` raw output always disables prompts.
- Interactive warnings use the same strings as non-interactive human mode, rendered through Clack.
- `--verbose` may coexist with prompts in TTY human mode. Verbose lines are emitted before or after active prompts, not interleaved.
