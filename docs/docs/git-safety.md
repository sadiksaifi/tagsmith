---
title: "Git safety model for annotated release tags"
description: "See how Tagsmith safely creates annotated Git tags without fetching, checkout, merging, branch mutation, tag overwrites, or rollback on push failure."
outline: deep
---

# Git safety model

Tagsmith is intentionally conservative. Every Git interaction is either read-only or a single, narrowly scoped write. The model is designed around one rule: **Tagsmith never makes a Git decision the user did not declare in config or on the command line.**

## What Tagsmith reads

| Read                   | Source                                           | Used by                      |
| ---------------------- | ------------------------------------------------ | ---------------------------- |
| Repo root              | `git rev-parse --show-toplevel`                  | every command                |
| Working tree state     | `git status --porcelain --untracked-files=all`   | `tag`                        |
| Current HEAD           | `git rev-parse HEAD`                             | `tag`                        |
| Remote base branch tip | `git ls-remote <remote> refs/heads/<baseBranch>` | `tag`, `validate`            |
| Local tags             | `git for-each-ref refs/tags`                     | `tag`, `validate`            |
| Remote tags            | `git ls-remote --tags <remote>`                  | `tag`, `validate`            |
| Reachability           | `git merge-base --is-ancestor`                   | `validate`                   |
| Remote URL             | `git remote get-url <remote>`                    | every command (verification) |

Remote reads happen directly via `ls-remote`. Tagsmith does **not** depend on locally fetched tag state for remote tag truth.

## What Tagsmith writes

| Write         | Source                                    | Used by      |
| ------------- | ----------------------------------------- | ------------ |
| Annotated tag | `git tag -a <name> <commit> -m <message>` | `tag`        |
| Tag push      | `git push <remote> refs/tags/<tagName>`   | `tag --push` |

Both writes are explicit and singular. Local tag creation is the default for `tag`; push only happens with `--push`.

## What Tagsmith never does

- **No `git fetch`.** Tagsmith does not update local refs automatically. If reachability can't be proven from local history, the command fails with explicit fetch guidance. In CI, fetch enough history before invoking Tagsmith.
- **No checkout, merge, reset, branch switch, or release-branch mutation.**
- **No moving `HEAD`.** Tagsmith reads `HEAD` but never changes it.
- **No lightweight tags.** Annotated only. Lightweight managed tags are malformed.
- **No tag overwrites.** Existing same-name tags block creation regardless of lightweight vs annotated.
- **No automatic rollback on failed push.** See [Non-rollback](#non-rollback).
- **No reading your project `package.json`** to decide release versions.
- **No interaction with your shell's git environment variables.** Tagsmith strips `GIT_*` env vars before invoking Git, so user-set `GIT_DIR`, `GIT_WORK_TREE`, hook-injected config, etc. don't bleed into Tagsmith's reads.

## Repo discovery

Every non-help/non-version command — including `init --dry-run` and `targets` — discovers the repo from `process.cwd()` using `git rev-parse --show-toplevel`. There is no `--cwd` flag. Outside a Git checkout, Tagsmith fails with:

```
Git repository not found from <cwd>
```

## Config path resolution

The `--config` flag selects a file location, **not** a repo context.

- Absolute paths are used as-is. The file may live outside the repo.
- Relative paths resolve from the repo root (not from `cwd`).
- Default: `<repoRoot>/.tagsmith.jsonc`.

Target paths inside the config always resolve from the repo root, regardless of where the config file lives.

## HEAD equality

Before `tag` creates a tag, the current `HEAD` must equal the **remote-read** tip of `<remote>/<baseBranch>`. The current local branch name does **not** matter; you can be on a detached `HEAD` or on a feature branch as long as the commit you're on matches the remote base branch tip.

Mismatch error:

```
HEAD must equal <remote>/<baseBranch> (<sha>) before tagging
```

This is a hard guard. There is no `--force` to bypass it. The intent: a release tag must point at the canonical commit on the release line, not a sibling or a stale snapshot.

## Working tree must be clean

`tag` refuses to run on a dirty working tree. Stash, commit, or clean before tagging. Error:

```
working tree must be clean before tagging
```

## Annotated only

Tagsmith creates annotated tags exclusively (`git tag -a`). The annotated message comes from the rendered `tagMessage`.

If a managed tag in the namespace is a lightweight tag (either locally or remotely), preflight reports it as a malformed managed tag and refuses to proceed. The same is true if a remote tag's annotation cannot be proven from the `ls-remote` output (missing `^{}` peeled record).

## Local/remote consistency

When the same managed tag name exists locally and remotely, both refs must peel to the **same** commit. The annotated tag object SHAs may differ — only the peeled commit SHA matters. If they peel differently, the tag is malformed.

## Push verification

After `git push`, Tagsmith re-reads remote tags and verifies:

1. The pushed tag exists on the remote.
2. The remote tag is provably annotated.
3. The remote tag peels to the same commit as the local tag.

If any check fails, Tagsmith exits non-zero with one of:

```
local tag <tag> exists but was not pushed: <git-error>
push verification failed for <tag>: <error>. Local tag remains.
push verification failed for <tag>: remote tag does not peel to <commit>. Local tag remains.
```

## Non-rollback

Tagsmith **does not roll back** the local tag if push or post-push verification fails. The error message always names the tag and the failure mode. Recovery is yours — typically:

```sh
git tag -d <tag>    # delete locally, then re-investigate
```

Or fix the remote-side issue (network, permissions, ref protection) and push the existing local tag manually:

```sh
git push <remote> refs/tags/<tag>
```

The local tag is preserved on purpose: it represents work already done, and rolling it back automatically would erase that fact.

## Reachability and remote reads

`validate` requires that the validated tag's commit is reachable from `<remote>/<baseBranch>` per local Git history. Tagsmith reads the **remote** base branch tip via `ls-remote` and then asks the local repo whether that tip's history contains the tag's commit (`git merge-base --is-ancestor`). Because Tagsmith never fetches automatically, the local history may not be deep enough to prove reachability — in which case validation fails with:

```
cannot prove tag commit is reachable from <remote>/<baseBranch> with local history.
Fetch enough history and retry:
  git fetch <remote> <baseBranch> --tags
```

In CI, set `fetch-depth: 0` on checkout and explicitly fetch tags before `validate`. See [GitHub Actions integration](./ci).

## Why no auto-fetch

Automatic fetches change local state on the user's behalf. That conflicts with two design principles:

1. **All policy is visible.** A user who sees `tagsmith tag` should see exactly what Tagsmith did, with no extra `git fetch` running in the background.
2. **Fail loudly.** When local history isn't deep enough, the explicit failure with `git fetch …` guidance teaches the user what's missing. A silent auto-fetch would mask intermittent network issues and confuse CI environments where fetch policy is set deliberately.
