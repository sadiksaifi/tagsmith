---
title: "Set up Tagsmith with an AI coding agent"
description: "Use the generated Tagsmith LLM documentation to let an AI coding agent configure release targets, tag patterns, channels, and CI validation safely."
outline: deep
---

# Setup with AI

Copy this into your AI coding agent (Claude Code, Cursor, Codex, opencode, etc.) from inside your repository:

```text
Follow the LLM-only instructions at https://tagsmith.site/docs/setup-with-ai.md to set up Tagsmith in this repository.
```

## Install the Agent Skill

For reusable Tagsmith instructions that compatible coding agents discover automatically:

```sh
npx skills add sadiksaifi/tagsmith --skill tagsmith
```

The source is also published at <https://tagsmith.site/skills/tagsmith/SKILL.md>.

## After setup

Validate the generated config:

```sh
npx tagsmith@latest targets
```

If anything is wrong, Tagsmith prints the exact field and reason.

<llm-only>

<!--@include: ../../skills/tagsmith/SKILL.md#agent-guidance-->

</llm-only>
