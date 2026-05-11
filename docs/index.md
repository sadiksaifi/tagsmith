---
layout: home

hero:
  name: Tagsmith
  text: Opinionated Git tag and SemVer release-tag manager.
  tagline: Declarative release intent for single-target repositories and monorepos.
  actions:
    - theme: brand
      text: Get started
      link: https://github.com/sadiksaifi/tagsmith#quick-start
    - theme: alt
      text: AI-assisted setup
      link: /llms.txt
      target: _blank
    - theme: alt
      text: View on GitHub
      link: https://github.com/sadiksaifi/tagsmith

features:
  - title: Declarative JSONC config
    details: Comments, trailing commas, schema support, duplicate-key rejection, and unknown-key rejection.
  - title: Stable and prerelease channels
    details: Per-target channels with optional direct dependsOn gates.
  - title: CI-safe outputs
    details: Deterministic --json and --github-output modes with no ANSI or stderr chatter on success.
  - title: Conservative Git model
    details: Annotated tags only, no auto-fetch, HEAD must equal remote base branch tip before tagging.
---

## AI-assisted setup

From inside your repository, give your AI assistant:

> Fetch <https://sadiksaifi.github.io/tagsmith/llms.txt> and follow the instructions.

## Manual setup

See the [Quick start](https://github.com/sadiksaifi/tagsmith#quick-start) section in the project README for current commands and configuration examples.
