---
layout: home

hero:
  name: Tagsmith
  text: Opinionated Git tag and SemVer release-tag manager.
  tagline: Declarative release intent for single-target repositories and monorepos. Interactive for humans, deterministic for automation.
  actions:
    - theme: brand
      text: Get started
      link: /docs/getting-started
    - theme: alt
      text: AI-assisted setup
      link: /docs/ai-assisted-setup
    - theme: alt
      text: Docs
      link: /docs/

features:
  - title: Declarative JSONC config
    details: Comments, trailing commas, schema support. Unknown keys and duplicate keys are rejected.
  - title: Stable and prerelease channels
    details: Per-target channels with optional direct dependsOn gates. Prerelease versions encode the channel name, e.g. 1.2.3-rc.1.
  - title: CI-safe machine outputs
    details: --json and --github-output emit deterministic shapes with full commit SHAs, no ANSI, and no stderr chatter on success.
  - title: Conservative Git model
    details: Annotated tags only. No auto-fetch, checkout, merge, or branch switches. HEAD must equal remote/baseBranch before tagging.
  - title: Interactive when it helps
    details: Bare tagsmith in a TTY opens an action menu, prompts only for missing inputs, and never auto-pivots between commands.
  - title: Same surface for scripts and CI
    details: Every interactive decision maps to an explicit flag. 100% non-interactive capability equals 100% interactive capability.
---
