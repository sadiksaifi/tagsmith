---
title: "Git tag patterns for Tagsmith releases"
description: "Configure Tagsmith tagPattern templates for single-target repos and monorepos, including SemVer captures, target names, ambiguity rules, and Git ref safety."
outline: deep
---

# Tag patterns

`tagPattern` controls the Git tag name Tagsmith renders for a given target and version. The grammar is intentionally strict to keep tag names safe and unambiguous.

## Grammar

A `tagPattern` is a literal string that may contain:

- exactly one `{version}` placeholder — **required**
- at most one `{target}` placeholder — optional
- literal characters from `[a-z0-9._@-]`

Channel name is **never** rendered into the tag. It is encoded inside the version for prerelease channels (e.g. `1.2.3-rc.1`).

### Rejected forms

- More than one `{version}`.
- More than one `{target}`.
- Any other placeholder (e.g. `{channel}`, `{date}`). `{channel}` is intentionally unsupported.
- Slashes (`/`), whitespace, uppercase letters, or any punctuation outside the allowed set.
- Patterns whose rendered output starts with `-` or `.`.
- Patterns whose rendered output ends with `.` or `.lock`.
- Patterns whose rendered output contains `..`.

The check is twofold: the **pattern** must use only allowed characters and placeholders, and every **rendered** tag must also be a safe Git tag name.

## Recommended patterns

| Repo shape          | Pattern              | Example tag                   |
| ------------------- | -------------------- | ----------------------------- |
| Single-target       | `v{version}`         | `v1.2.3`, `v1.2.4-rc.1`       |
| Monorepo            | `{target}@{version}` | `api@1.2.3`, `web@1.2.4-rc.1` |
| Migration namespace | `managed-v{version}` | `managed-v1.2.3`              |

The migration pattern is useful when you want a fresh namespace. If you want to keep an existing `v{version}` namespace with historical lightweight tags, prefer setting `initialVersion` to the last pre-adoption release instead; matching tags at or below that base are treated as legacy history without rewriting them.

## Warnings

Tagsmith emits a human-mode warning (no exit-code change) when `{version}` touches an alphanumeric character or `_` on either side. The single exception is the recommended `v{version}` pattern, which does not warn.

Why: patterns like `release1.2.3` are valid Git tag names but read ambiguously. Patterns like `release-1.2.3` or `release_1.2.3` may also confuse downstream tools that key on numeric prefixes. The warning prompts you to add a clear separator. Add a `.`, `-`, `_`, `@`, or end-of-string boundary around `{version}` to silence it.

Warnings are suppressed in `--json`, `--github-output`, and `init --dry-run` raw modes.

## Multi-target ambiguity

When a config has multiple targets, every target's effective pattern must be statically unambiguous against the others. Identical patterns are an obvious conflict, but the validator also detects effective overlap. Config validation fails with:

```
targets <A> and <B> have ambiguous effective tagPattern <pattern>
```

The fix is to:

- give each target its own `{target}` placeholder (recommended), or
- set distinct per-target `tagPattern` overrides with non-overlapping literal portions.

## Render examples

| Pattern              | Target                                     | Version      | Rendered tag     |
| -------------------- | ------------------------------------------ | ------------ | ---------------- |
| `v{version}`         | `app` (single target, `{target}` optional) | `1.2.3`      | `v1.2.3`         |
| `v{version}`         | `app`                                      | `1.2.4-rc.1` | `v1.2.4-rc.1`    |
| `{target}@{version}` | `api`                                      | `1.2.3`      | `api@1.2.3`      |
| `{target}@{version}` | `web`                                      | `1.2.4-rc.2` | `web@1.2.4-rc.2` |
| `pkg-auth@{version}` | `auth`                                     | `1.0.0`      | `pkg-auth@1.0.0` |

## Tag name as Git ref

Tagsmith creates **annotated tags only**. Lightweight tags are rejected as malformed managed tags during preflight. After push, Tagsmith re-reads the remote and verifies the tag is annotated there too.

The rendered tag must satisfy Git's own ref naming rules in addition to Tagsmith's literal-character set. The full Git ref restrictions Tagsmith enforces (in addition to the pattern character whitelist):

- no leading `.` or `-`
- no trailing `.`
- no `..` anywhere
- no `.lock` suffix

If a pattern can render a tag that violates these, validation fails with `targets.<name>.tagPattern renders an unsafe Git tag name`.
