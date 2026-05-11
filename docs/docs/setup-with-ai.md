---
title: "Set up Tagsmith with an AI assistant"
description: "Use Tagsmith llms.txt, llms-full.txt, and generated Markdown docs to let an AI assistant configure release targets, tag patterns, channels, and CI validation safely."
outline: deep
---

# Setup with AI

Paste this to your AI assistant from inside your repository:

```text
Fetch https://tagsmith.sadiksaifi.dev/llms.txt first. Follow its links for the relevant pages, and use https://tagsmith.sadiksaifi.dev/llms-full.txt if you need the complete Tagsmith documentation in one file.
```

`/llms.txt` is a concise index that follows the [llms.txt standard](https://llmstxt.org/). It links to generated Markdown versions of the docs. `/llms-full.txt` is the generated full-documentation bundle. The source of truth is the human documentation in this site; the LLM files are generated from it.

## Agent operating rules

When an AI assistant helps set up or operate Tagsmith, it should:

1. Inspect the repository before proposing config: remotes, current branch, existing Git tags, workspace/package layout, release workflows, and any existing `.tagsmith.jsonc`.
2. Ask before inventing target names, paths, channel names, remote names, or base branches.
3. Invoke Tagsmith with `npx tagsmith@latest <command>` so a global install is not required.
4. Prefer complete, reproducible flag sets. Pass `--target` and `--channel` explicitly for tag and validation operations when the repo has multiple targets.
5. Use `--json` for read or preview operations so resolved facts are unambiguous.
6. Preview mutations with `--dry-run --json` before creating or pushing a tag.
7. Show the resolved tag, version, base version, target, channel, and commit before asking the user to run the real mutation.
8. Never work around a failed preflight check. Fix the repo, config, or command that caused it.

## Setup playbook

1. Inspect repo shape: single package or monorepo, default remote, base branch, existing tag patterns, release workflows, and whether `.tagsmith.jsonc` already exists.
2. Choose channel shape:
   - stable only for simple release flows
   - `rc → stable` when stable releases must pass through a release candidate
   - `alpha → beta → rc → stable` when preview channels have real consumers
3. Run `npx tagsmith@latest init` or `npx tagsmith@latest init --dry-run`.
4. Edit `.tagsmith.jsonc` so targets, paths, channels, tag pattern, remote, and base branch match the actual repo.
5. Validate config with:

   ```sh
   npx tagsmith@latest targets --json
   ```

6. Dry-run the first release:

   ```sh
   npx tagsmith@latest tag --target <name> --channel <name> --bump patch --dry-run --json
   ```

7. Create the tag only after the user confirms the dry-run facts.
8. Wire CI with `tagsmith validate --tag "$GITHUB_REF_NAME" --github-output` before any publish or deploy step.

## What happens

The assistant should walk you through repo shape, channel ladder, tag style, base branch, and initial version. It writes or edits `.tagsmith.jsonc`, dry-runs the first release, and creates the real tag only with your confirmation.

## Sanity check

```sh
npx tagsmith@latest targets --json
```

Validates the generated config and prints the parsed shape. If anything is wrong, the error names the exact field and reason.

## Or skip the agent

If you already know your release shape, [Get started](./getting-started) takes about five minutes by hand.
