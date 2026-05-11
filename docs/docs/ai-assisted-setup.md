---
title: AI-assisted setup
outline: deep
---

# AI-assisted setup

Tagsmith publishes a rich agent-facing manual at:

<https://sadiksaifi.github.io/tagsmith/llms.txt>

It follows the [llmstxt.org](https://llmstxt.org) convention: one plain-text document that an AI assistant can fetch and use as authoritative grounding to drive setup interactively, with the user answering domain questions like "how many targets does this repo have" and "which channels do you want."

## The prompt

From inside your repository, give your AI assistant exactly this:

> Fetch <https://sadiksaifi.github.io/tagsmith/llms.txt> and follow the instructions.

That's the whole prompt. `llms.txt` contains:

- the full operating rules (no auto-fetch, annotated tags only, HEAD must equal remote base branch tip, etc.)
- a playbook the agent walks you through — repo inspection, channel-shape decision, config generation, first dry-run, real tag, CI wiring
- the complete configuration reference, command reference, preconditions and invariants
- a verbatim error catalogue
- 21 worked example scenarios covering common shapes

## What the agent will ask

The agent should drive a short conversation before writing anything. Typical questions:

1. **Repo shape.** Is this a single-app repository or a monorepo? What are the directories that should be releasable targets?
2. **Channel ladder.** Do you want only `stable`, or a full `alpha → beta → rc → stable` promotion chain? Or something in between like `rc → stable`?
3. **Tag style.** `v{version}` for single-target, or `{target}@{version}` for monorepo? Custom prefix? See [Tag patterns](./tag-patterns).
4. **Base branch.** What's the release branch? `main`, `release/1.x`, something else?
5. **Initial version.** Is there an existing tag history Tagsmith should treat as the floor, or start at `0.0.0`?

After your answers, the agent generates `.tagsmith.jsonc`, dry-runs the first release, and only creates the real tag with your confirmation.

## Why an agent flow exists

Tagsmith's config is small but every field has strict rules: target/channel name shape, channel uniqueness, exactly-one-stable, `dependsOn` cycles, tag pattern grammar, SemVer policy, multi-target pattern ambiguity. Getting all of that right by hand is straightforward but tedious. An agent grounded on `llms.txt` produces a valid config in one pass and explains each decision as it goes.

## Verifying what the agent produced

Once the agent has written `.tagsmith.jsonc`, you can sanity-check independently:

```sh
npx tagsmith@latest targets --json
```

This validates the config and target paths and prints the parsed config. If any field is wrong, this surfaces the exact field path and reason. The same validation runs at the start of every `tag` and `validate` command. See [Configuration reference](./configuration) for every rule.

## When to skip the agent

If you already know the shape of your release process, the [Quick start](./quick-start) takes about five minutes by hand and gives you the same result.
