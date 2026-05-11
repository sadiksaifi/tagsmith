---
title: "Tagsmith preflight checks before tagging and validation"
description: "Review the Git, config, target, tag, working tree, remote branch, reachability, and validation checks Tagsmith runs before creating or accepting release tags."
outline: deep
---

# Preflight checks

Preflight is the ordered set of checks Tagsmith runs **before any mutation**. `tag` runs the full pipeline; `tag --dry-run` runs the same pipeline and skips only the create/push step. `validate` runs the validation-specific subset on an already-existing tag.

Each check has a canonical error message. Tagsmith stops at the first failure and reports that error verbatim.

## `tag` preflight (in order)

1. **Repo discovery.** `git rev-parse --show-toplevel` from `process.cwd()`.
   - Outside a repo: `Git repository not found from <cwd>`.
2. **Config load.** Parse and validate `.tagsmith.jsonc` (or `--config <path>`). Any [config error](./configuration#parse-and-validation-errors) stops here.
3. **Target path validation.** For every configured target: path exists, is a directory, realpath inside the repo, realpath unique across targets.
4. **Working tree clean.** `git status --porcelain --untracked-files=all` must report nothing.
   - Dirty: `working tree must be clean before tagging`.
5. **Read local tags.** `git for-each-ref refs/tags` to enumerate the managed namespace locally.
6. **Read remote tags.** `git ls-remote --tags <remote>` to enumerate the managed namespace remotely.
7. **Read remote base branch tip.** `git ls-remote <remote> refs/heads/<baseBranch>`.
8. **Read current HEAD.** `git rev-parse HEAD`.
9. **HEAD equality.** `HEAD` must equal the remote base branch tip.
   - Mismatch: `HEAD must equal <remote>/<baseBranch> (<sha>) before tagging`.
10. **Dry-run resolution.** Resolve the requested target, channel, and version against the managed history:
    - tag doesn't already exist locally or remotely (no duplicate)
    - `--bump`/`--version` shape valid for the channel's strategy
    - prerelease `--bump prerelease` has an existing same-channel line
    - `dependsOn` checks: for each direct dependency, the dependency channel's tag at the **same base** exists locally **and** remotely, both peel to the same commit, and that commit equals current `HEAD`. For a `prerelease` dependency that's the **highest** `<base>-<channel>.N`; for a `stable` dependency it's the canonical `<base>` tag itself.
11. **Malformed managed tag scan.** Any managed tag with a broken `{version}` capture, lightweight ref, build metadata, non-canonical SemVer, mismatched peel, or unprovable remote annotation fails the run — even if it isn't the tag you're trying to create.
12. **Channel/strategy assertions.** Stable channels reject `--bump prerelease`. Explicit `--version` must match the channel's expected shape.
13. **Render.** Render `tagPattern` and `tagMessage` against the resolved target/version/tag.

After preflight succeeds:

- `tag` creates an annotated tag at `HEAD` (`git tag -a`).
- `tag --push` then `git push <remote> refs/tags/<tag>`.
- After push, Tagsmith re-reads remote tags and verifies the pushed tag is annotated and peels to the same commit.

`tag --dry-run` stops after step 13.

## `tag --dry-run --push`

`--dry-run --push` performs the same preflight and does **not** push. The JSON output keeps `pushed: false` and `dryRun: true`. There is no `wouldPush` field — `--dry-run --push --json` is intentionally indistinguishable from `--dry-run --json`. Human output mentions the push intent in a separate sentence.

## `validate` pipeline (in order)

1. **Repo discovery.** Same as `tag` step 1.
2. **Config load.** Same as `tag` step 2.
3. **Target path validation.** Same as `tag` step 3.
4. **Read local tags.** Same as `tag` step 5.
5. **Read remote tags.** Same as `tag` step 6.
6. **Target selection.** If `--target` provided, the tag must match that target's effective pattern; otherwise the tag must match exactly one target's effective pattern.
7. **Pattern match.** Extract the `{version}` capture from the tag name using the target's effective pattern. Failure: `tag <name> does not match target <target>` (or `… does not match any configured target` / `… matches multiple targets`).
8. **SemVer parse.** Parse the captured version. Failure: malformed managed tag error.
9. **Strategy classification.** Determine whether the version is stable or prerelease shape. For prerelease, the prerelease identifier must equal the channel name (computed during step 10).
10. **Channel resolution.** Compute the channel from the version shape. If `--channel` provided, the asserted channel must equal the computed channel.
11. **Local existence.** The tag must exist locally as an annotated tag.
12. **Remote existence.** The tag must exist remotely; remote annotation must be provable (peeled `^{}` record).
13. **Peel equality.** Local and remote refs must peel to the same commit.
14. **Malformed scan.** Any malformed managed tag in the namespace fails validation, not only the validated tag.
15. **`dependsOn` validation.** For each direct dependency: the dependency channel's tag at the validated tag's base exists locally and remotely, both peel to the same commit, and that commit equals the validated tag's commit. For a `prerelease` dependency, that's the highest same-base prerelease; for a `stable` dependency, the canonical stable tag at that base.
16. **Read remote base branch tip.** Same as `tag` step 7.
17. **Reachability.** The validated tag's commit must be reachable from `<remote>/<baseBranch>` according to local Git history (`git merge-base --is-ancestor`).
    - Not reachable / cannot be proven from local history: `cannot prove tag commit is reachable from <remote>/<baseBranch> with local history. Fetch enough history and retry: git fetch <remote> <baseBranch> --tags`.

After validation succeeds, `validate` emits release facts (see [Output modes](./output)).

## Why preflight before mutation

The preflight pipeline is non-negotiable because Tagsmith does not roll back on partial failure. If you create a tag and push it before catching a `dependsOn` violation, the tag is already on the remote. The preflight order is designed so that every failure mode is caught **before** Tagsmith touches Git state.

`tag --dry-run` exists to let you exercise the entire pipeline without mutating anything. Use it in CI dry-run jobs, before promotions, or anywhere you want to verify "if I ran this for real, would it succeed?".

## Cancelation and signals

When prompts are eligible (TTY, no machine output), Ctrl+C during a prompt cancels the run with exit code 1, no mutation, no machine output, and a concise message (`tagsmith failed: tagsmith cancelled.`). The local tag is not created; the remote is not contacted past the read steps already completed.
