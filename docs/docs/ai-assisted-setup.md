---
title: AI-assisted setup
outline: deep
---

# AI-assisted setup

Tagsmith ships an agent-facing manual at <https://sadiksaifi.github.io/tagsmith/llms.txt>. Point your AI assistant at it and answer its questions.

## The prompt

From inside your repository, paste this to your assistant:

> Fetch <https://sadiksaifi.github.io/tagsmith/llms.txt> and follow the instructions.

That's it.

## What happens

The agent walks you through repo shape, channel ladder, tag style, base branch, and initial version. It writes `.tagsmith.jsonc`, dry-runs the first release, and creates the real tag only with your confirmation.

## Sanity check

```sh
npx tagsmith@latest targets --json
```

Validates the generated config and prints the parsed shape. If anything is wrong, the error names the exact field and reason.

## Or skip the agent

If you already know your release shape, [Get started](./getting-started) takes about five minutes by hand.
