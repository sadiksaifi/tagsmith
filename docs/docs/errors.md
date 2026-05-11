---
title: Error catalogue
outline: deep
---

# Error catalogue

Every Tagsmith error is emitted on stderr with the `tagsmith failed: ` prefix and exits non-zero. Machine modes write no stdout on failure. The wording below is verbatim from the running CLI.

Errors are grouped by surface area. Where helpful, the trigger and remediation are shown alongside.

## CLI parsing

| Error                                                                     | Trigger                                                                               | Remediation                                                             |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `unknown option --<name>`                                                 | Any unrecognized long flag (`--cwd` is also rejected).                                | Use a documented flag. See [Commands](./cli/init).                      |
| `unknown option -<char>`                                                  | Any short flag other than `-h` and `-v`.                                              | Use the long form (`--target`, `--channel`, etc.).                      |
| `unknown command <name>`                                                  | Unrecognized subcommand.                                                              | One of `init`, `tag`, `validate`, `targets`.                            |
| `unexpected argument <token>`                                             | A second command name on the same line.                                               | Run subcommands one at a time.                                          |
| `option --<flag> requires a value`                                        | The flag's next token is missing or starts with `-`.                                  | Provide a value with a space (`--bump patch`).                          |
| `option --<flag> does not support attached values. Use --<flag> <value>.` | `--flag=value` form.                                                                  | Use space-separated values.                                             |
| `tag requires --channel`                                                  | `tag` invoked without `--channel`.                                                    | Add `--channel <name>`.                                                 |
| `tag requires exactly one of --bump or --version`                         | Both or neither provided on `tag`.                                                    | Provide exactly one.                                                    |
| `tag requires --target when config has multiple targets`                  | Multi-target config with no `--target`.                                               | Add `--target <name>`. Single-target configs may omit it.               |
| `unknown target <name>`                                                   | `--target` doesn't match any configured target.                                       | Run `tagsmith targets` to see configured names.                         |
| `unknown channel <name> for target <target>`                              | `--channel` doesn't match any channel for the selected target.                        | Run `tagsmith targets` to see channels per target.                      |
| `invalid --bump <value>; expected major, minor, patch, or prerelease`     | `--bump` got an invalid enum value.                                                   | One of the four documented bumps.                                       |
| `validate requires --tag`                                                 | `validate` invoked without `--tag`.                                                   | Provide `--tag <tag>`.                                                  |
| `validate --github-output requires GITHUB_OUTPUT`                         | `--github-output` set but env var missing.                                            | Run inside a GitHub Actions step, or set `GITHUB_OUTPUT=/path/to/file`. |
| `--json is incompatible with --github-output`                             | Both machine flags set.                                                               | Pick one.                                                               |
| `--verbose is incompatible with --json` (or `--github-output`)            | `--verbose` combined with a machine-output flag.                                      | Drop `--verbose` from machine runs.                                     |
| `tagsmith cancelled.`                                                     | Interactive cancellation (Ctrl+C, or selecting the safe-negative option in a review). | Re-run when ready.                                                      |

## Repo discovery

| Error                                 | Trigger                                                  | Remediation                                          |
| ------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| `Git repository not found from <cwd>` | Any non-help/non-version command run outside a Git repo. | `cd` into a repo; `git init` if you're starting one. |

## Config parse and validation

`<filePath>` is the resolved config path. `<jsonPath>` is the field path inside the JSONC file.

Parse errors:

- `<filePath>: malformed JSONC (<ParseErrorCode>)`
- `<filePath>: reserved key __proto__ at <jsonPath>`
- `<filePath>: duplicate key <name> at <jsonPath>`
- `<filePath>: <fieldPath>: unrecognized keys`
- `<filePath>: <fieldPath>: <zod message>`

Common runtime validation errors:

- `git.remote must be a safe configured remote name without whitespace or slash`
- `git.baseBranch must be an unqualified branch name`
- `defaults.initialVersion must be canonical stable SemVer without build metadata or leading v`
- `<fieldPath> requires exactly one {version}`
- `<fieldPath> may contain {target} at most once`
- `<fieldPath> contains unsupported placeholder`
- `<fieldPath> tagPattern contains unsafe characters`
- `<fieldPath> {version} touches an alphanumeric or underscore character` (warning, not error)
- `<fieldPath> must be printable single-line text`
- `targets must contain at least one target`
- `targets.<name> must match /^[a-z][a-z0-9-]*$/u`
- `targets.<name>.channels contains duplicate channel <name>`
- `targets.<name>.channels must contain exactly one stable channel`
- `targets.<name>.channels.<name>.dependsOn may not depend on self`
- `targets.<name>.channels.<name>.dependsOn references missing channel <name>`
- `targets.<name>.channels dependency cycle is invalid`
- `targets.<name>.tagPattern renders an unsafe Git tag name`
- `targets.<name>.tagMessage must be non-empty after interpolation`
- `targets <A> and <B> have ambiguous effective tagPattern <pattern>`

## Filesystem (target paths)

- `targets.<name>.path <path> must resolve inside the Git repository`
- `targets.<name>.path resolves to the same real directory as targets.<other>.path`
- `targets.<name>.path <path> does not exist`
- `targets.<name>.path <path> is not a directory`

## Git state

- `working tree must be clean before tagging`
- `HEAD must equal <remote>/<baseBranch> (<sha>) before tagging`
- `failed to read remote tags from <remote>`
- `cannot prove tag commit is reachable from <remote>/<baseBranch> with local history.\n\nFetch enough history and retry:\n  git fetch <remote> <baseBranch> --tags`

## Release logic

- `stable channel <name> rejects --bump prerelease`
- `Cannot bump prerelease for <target> <channel>: no existing <channel> prerelease tag found. Use --bump major, --bump minor, --bump patch, or --version to start a prerelease line.`
- `<version> must match channel <name>` — the explicit `--version` doesn't match the selected channel's prerelease identifier.
- Duplicate tag: a managed tag with the rendered name already exists locally or remotely.

## Validate-specific

- `tag <name> does not match any configured target`
- `tag <name> matches multiple targets`
- `tag <name> does not match target <target>` — when `--target` is asserted.
- `malformed managed tag for target <target>: <name>\n\nThe tag matches <target>'s tagPattern literals but does not contain canonical SemVer.\nFix/remove/rename the tag, or choose a new Tagsmith tagPattern namespace.`

## Push / verification

- `local tag <tag> exists but was not pushed: <git-error>`
- `push verification failed for <tag>: <error>. Local tag remains.`
- `push verification failed for <tag>: remote tag does not peel to <commit>. Local tag remains.`

In all push-related failures, Tagsmith **does not roll back the local tag**. Recovery is yours; see [Non-rollback](./git-safety#non-rollback).

## GitHub output formatter

- `validate failed: failed to write GitHub output: <message>` — wrapper when appending to `$GITHUB_OUTPUT` fails.
- `GitHub output key must be an identifier.` — internal sanity check.
- `GitHub output value for <key> must be single-line printable text.` — control character or newline in a value.

## How to read an error

1. Strip the `tagsmith failed: ` prefix and locate the error in this catalogue.
2. The error message names the source — config field, Git state, CLI flag, tag name, or remote.
3. Apply the remediation. There is no `--force` to bypass safety guards (working tree clean, HEAD equality, dependency gates). If you need to override a check, fix the underlying state first.
