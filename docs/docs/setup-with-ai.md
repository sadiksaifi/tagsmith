---
title: "Set up Tagsmith with an AI coding agent"
description: "Use the generated Tagsmith LLM documentation to let an AI coding agent configure release targets, tag patterns, channels, and CI validation safely."
outline: deep
---

# Setup with AI

Copy this into your AI coding agent (Claude Code, Cursor, Codex, opencode, etc.) from inside your repository:

```text
Follow the LLM-only instructions at https://tagsmith.sadiksaifi.dev/docs/setup-with-ai.md to set up Tagsmith in this repository.
```

## After setup

Validate the generated config:

```sh
npx tagsmith@latest targets
```

If anything is wrong, Tagsmith prints the exact field and reason.

<llm-only>

## Agent setup guardrails

When setting up Tagsmith for a user:

1. Fetch and read `https://tagsmith.sadiksaifi.dev/llms-full.txt` first. Treat it as the source of truth for Tagsmith setup, configuration, commands, CI, and errors.
2. Inspect the user's repository before proposing config: Git remotes, current branch, existing tags, workspace/package layout, release workflows, and whether `.tagsmith.jsonc` already exists.
3. Do not invent target names, paths, channel names, remote names, or base branches. Ask the user when a real release-shape decision is needed.
4. Match the user's package runner instead of blindly using `npx`:
   - Inspect `package.json#packageManager` first.
   - If absent, infer from lockfiles and project docs: `bun.lock`, `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `README.md`, `AGENTS.md`, `CLAUDE.md`, or equivalent repo guidance.
   - Bun → `bunx tagsmith@latest ...`.
   - pnpm → `pnpx tagsmith@latest ...` or `pnpm dlx tagsmith@latest ...`.
   - Yarn → `yarn dlx tagsmith@latest ...`.
   - npm or unknown → `npx tagsmith@latest ...`.
   - Keep generated README snippets, scripts, CI examples, and user-facing commands consistent with the detected runner.
5. Validate config with `<runner> tagsmith@latest targets --json`.
6. Before any tag mutation, run a dry-run with `--json` and show the resolved target, channel, version, tag, base version, and commit.
7. Do not create or push a tag until the user explicitly confirms.
8. If adding CI, place `tagsmith validate --tag "$GITHUB_REF_NAME" --github-output` before publish/deploy side effects, using the detected package runner.
9. Never work around a failed Tagsmith preflight check. Fix the repo state, config, or command that caused it.
10. After setup, ask whether the user wants a short README note. If yes, add a package-runner-aware snippet such as:

    ```md
    Releases are managed by [Tagsmith](https://tagsmith.sadiksaifi.dev/).
    Use `<runner> tagsmith@latest` to create and validate release tags.
    ```

</llm-only>
