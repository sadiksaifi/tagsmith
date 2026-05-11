---
title: Get started
outline: deep
---

# Get started

Tagsmith treats releases as a declarative artifact. Instead of orchestrating deployments or reading your `package.json`, it manages the canonical Git tag for each release, validates that the tag is on the expected line, and emits CI-safe facts that other systems react to.

## When Tagsmith is a good fit

- You publish from single-target repositories or monorepos and want a uniform release model for both.
- You use channels (e.g. `alpha`, `beta`, `rc`, `stable`) and want a declarative way to gate promotion between them.
- You want CI to verify that a tag is real, annotated, reachable from `main`, and in the right channel before it triggers any release side effect.
- You want one stable JSON output that scripts can consume across local runs and CI.

## When Tagsmith is not a good fit

- You need Tagsmith to deploy applications, upload artifacts, or publish to a registry — Tagsmith deliberately stops at validating the tag.
- You want your release version to come from `package.json`, build metadata, or a JavaScript/TypeScript config file.
- You want shorthand flags or `--yes`/`-y` style auto-confirms — Tagsmith only ships `-h` and `-v` shorthands. Confirmation is enforced when prompts are eligible.

## How Tagsmith thinks

Every Tagsmith operation revolves around three concepts:

1. **Target** — a releasable unit in the repository (e.g. `web`, `api`, `auth`). Targets have a filesystem `path` and their own channel set.
2. **Channel** — a release line within a target. Exactly one channel per target has `strategy: "stable"`; the rest are `"prerelease"`. Channels may declare direct `dependsOn` gates against other channels in the same target.
3. **Base version** — the stable `X.Y.Z` that a prerelease was minted against. `1.2.3-rc.1` has base version `1.2.3`.

`tag` resolves a target + channel + bump (or explicit version) into a SemVer, renders the configured tag pattern, validates Git state, and creates an annotated tag at `HEAD`. `validate` consumes a tag name in CI and emits release facts. `targets` lists configured targets. `init` writes a template config.

See [Mental model](./concepts) for the full conceptual map.

## Install

Tagsmith requires Node.js 22 or later. Use your preferred package runner. No global install needed:

```sh
npx tagsmith@latest
pnpx tagsmith@latest
bunx tagsmith@latest
yarn dlx tagsmith@latest
```

The `bin` entry resolves to `dist/cli.js` in the published package. Tagsmith never reads your project `package.json` to decide release versions; the CLI version comes only from its own package metadata.

## Two ways to set it up

- [Quick start](./quick-start) — five hands-on commands.
- [AI-assisted setup](./ai-assisted-setup) — point an AI assistant at `llms.txt` and answer its questions.

## Where the docs live

Everything user-visible has its own page in this site. The README is intentionally lean and links here. If you're reading something on GitHub that contradicts these docs, the docs win.
