---
name: tagsmith
description: "Configure and operate Tagsmith for Git tag and SemVer releases. Use when setting up .tagsmith.jsonc, planning or creating Tagsmith release tags, adding tag validation to CI, listing release state, or diagnosing Tagsmith errors."
license: MIT
compatibility: "Requires Git and Node.js 22 or newer. Network access is required when using tagsmith@latest or reading the current documentation."
metadata:
  author: "sadiksaifi"
  homepage: "https://tagsmith.site"
---

# Tagsmith

<!-- #region agent-guidance -->

Use Tagsmith to configure and manage release intent through annotated Git tags. Tagsmith does not publish packages or deploy applications.

## Workflow

1. Read `https://tagsmith.site/llms.txt` and follow the links relevant to the task. For a complete setup or behavior spanning several commands, read `https://tagsmith.site/llms-full.txt`. Treat the current documentation as the source of truth.
2. Inspect the repository before proposing configuration: Git remotes, current branch, existing tags, workspace or package layout, release workflows, and any existing `.tagsmith.jsonc`.
3. Preserve the repository's release shape. Ask the user when target names, paths, channels, tag patterns, remote names, base branches, or adoption boundaries require a real product decision.
4. Match the repository's package runner:
   - Inspect `package.json#packageManager` first.
   - Otherwise infer it from lockfiles and repository guidance.
   - Bun: `bunx tagsmith@latest ...`
   - pnpm: `pnpx tagsmith@latest ...` or `pnpm dlx tagsmith@latest ...`
   - Yarn: `yarn dlx tagsmith@latest ...`
   - npm or unknown: `npx tagsmith@latest ...`
   - Keep README snippets, scripts, CI examples, and user-facing commands consistent with the selected runner.
5. Create or edit `.tagsmith.jsonc` to match the inspected repository, then validate it with `<runner> tagsmith@latest targets --json`.
6. When preserving an existing `v{version}` namespace with historical lightweight tags, set `tagPattern` to `v{version}` and `initialVersion` to the last pre-adoption base version. Tagsmith treats matching tags at or below that boundary as legacy history.
7. Before creating a tag, run the intended `tagsmith tag` command with `--dry-run --json`. Show the resolved target, channel, version, tag, base version, and commit.
8. Create or push a tag only after the user explicitly authorizes that mutation. Keep the dry-run and mutation arguments identical apart from `--dry-run` and the requested `--push` behavior.
9. When adding CI, run `tagsmith validate --tag "$GITHUB_REF_NAME" --github-output` before publish or deploy side effects, using the selected package runner.
10. Resolve failed preflight checks by correcting the repository state, configuration, or command.
11. After setup, offer a short README note using the selected runner:

    ```md
    Releases are managed by [Tagsmith](https://tagsmith.site/).
    Use `<runner> tagsmith@latest` to create and validate release tags.
    ```

<!-- #endregion agent-guidance -->
