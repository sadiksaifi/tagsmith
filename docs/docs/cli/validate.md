---
title: "tagsmith validate command reference"
description: "Reference the tagsmith validate command for checking managed Git tags, SemVer channel shape, reachability, dependsOn gates, JSON output, and GitHub outputs."
outline: deep
---

# `tagsmith validate`

Strictly validates an existing managed tag and emits release facts. Primary use: CI verification before a release side effect runs.

## Synopsis

```sh
tagsmith validate --tag <tag>
tagsmith validate --tag <tag> --target <name>
tagsmith validate --tag <tag> --channel <name>
tagsmith validate --tag <tag> --json
tagsmith validate --tag <tag> --github-output
```

## Flags

| Flag               | Required     | Description                                                                                                  |
| ------------------ | ------------ | ------------------------------------------------------------------------------------------------------------ |
| `--tag <tag>`      | **required** | The Git tag to validate.                                                                                     |
| `--target <name>`  | optional     | Asserts the tag matches this target's pattern. Without it, the tag must match exactly one configured target. |
| `--channel <name>` | optional     | Asserts the inferred/parsed channel equals this name.                                                        |
| `--json`           | optional     | Machine output.                                                                                              |
| `--github-output`  | optional     | Append release facts to `$GITHUB_OUTPUT` after full validation succeeds.                                     |

`--json` and `--github-output` are mutually exclusive.

## Behavior

`validate` runs the full validation pipeline (18 steps) — see [Preflight checks](../preflight#validate-pipeline-in-order). It is read-only (no Git writes) and never prompts during machine modes.

In short:

1. Load config, validate target paths.
2. Read local and remote managed tags.
3. Identify the target by pattern match (and verify against `--target` if asserted).
4. Reject tags at or below the `initialVersion` adoption boundary as legacy; parse newer `{version}` captures, classify strategy, and resolve channel.
5. Assert the channel matches `--channel` if asserted.
6. Check tag exists locally and remotely, is annotated on both sides, and both refs peel to the same commit.
7. Scan the managed namespace above the adoption boundary for malformed tags — any malformed tag fails validation.
8. Validate `dependsOn` for the validated tag's base.
9. Read remote base branch tip; verify reachability of the tag's commit from there.

## Interactive flow

In an eligible TTY:

- If `--tag` is missing, prompt for the tag string manually. There is no tag discovery — interactive `validate` only validates an explicit tag.
- If `--target` and `--channel` are missing, offer to add optional assertions:
  - "infer target and channel from tag" (default)
  - "assert target"
  - "assert target and channel"
- In multi-target configs, asserting a channel requires asserting a target first.

`--json` and `--github-output` disable all prompts.

## Output

`validate --json` emits 11 keys including `remote`, `baseBranch`, and `valid: true` — see [Output modes](../output#validate-json).

`validate --github-output` writes single-line `KEY=VALUE` records to `$GITHUB_OUTPUT` only after every check passes. Failures emit no partial output. See [Output modes](../output#validate-github-output).

Human-mode success:

```
Validated v1.2.3 (1.2.3) for target app channel stable.
Commit: 012345678901
Remote: origin
Base branch: main
Valid: true
```

## Reachability and CI fetch

`validate` requires the tag's commit to be reachable from `<remote>/<baseBranch>` via local Git history. Because Tagsmith never fetches automatically, CI must:

- check out with enough history (`fetch-depth: 0` in actions/checkout) and
- fetch tags + remote branches explicitly before invoking `validate`.

If history is insufficient:

```
cannot prove tag commit is reachable from <remote>/<baseBranch> with local history.
Fetch enough history and retry:
  git fetch <remote> <baseBranch> --tags
```

See [GitHub Actions integration](../ci) for a working `.github/workflows/publish.yml`.

## `tagMessage` is not compared

`validate` renders `tagMessage` from the **current** config and includes it in output. It does **not** read or compare the existing annotated tag's actual message. If you've changed `tagMessage` since the tag was created, `validate` reports the current rendering, not the historical one.

## Common errors

- `tag <name> does not match any configured target` — the tag name doesn't match any target's effective pattern.
- `tag <name> matches multiple targets` — without `--target`, the tag is ambiguous.
- `tag <name> does not match target <target>` — `--target` asserted but the pattern doesn't match.
- `validate --github-output requires GITHUB_OUTPUT` — env var missing.
- malformed managed tag errors when the namespace has broken tags (see [Errors](../errors)).
- reachability error when local history is shallow (see above).
