---
title: Setup with AI
outline: deep
---

# Setup with AI

Paste this to your AI assistant from inside your repository:

```text
Fetch https://tagsmith.sadiksaifi.dev/llms.txt and follow the instructions.
```

## What happens

The agent walks you through repo shape, channel ladder, tag style, base branch, and initial version. It writes `.tagsmith.jsonc`, dry-runs the first release, and creates the real tag only with your confirmation.

## Sanity check

```sh
npx tagsmith@latest targets --json
```

Validates the generated config and prints the parsed shape. If anything is wrong, the error names the exact field and reason.

## Or skip the agent

If you already know your release shape, [Get started](./getting-started) takes about five minutes by hand.

## About the manual

`llms.txt` is the agent-facing reference Tagsmith publishes at <https://tagsmith.sadiksaifi.dev/llms.txt>. It contains the full operating rules, configuration reference, command reference, error catalogue, and 21 worked examples — everything an AI assistant needs to drive setup without guessing.
