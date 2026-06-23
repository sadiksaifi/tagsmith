---
title: "tagsmith list command reference"
description: "Reference the tagsmith list command for inspecting local and remote Git tags that match the current Tagsmith configuration."
outline: deep
---

# `tagsmith list`

Lists existing Git tags that are relevant to the current Tagsmith config. This command inspects already-produced tags; it does not list configured targets and never creates, pushes, fetches, or validates reachability.

## Synopsis

```sh
tagsmith list
tagsmith list --local
tagsmith list --remote
tagsmith list --local --remote
tagsmith list --target <name>
tagsmith list --json
```

## Flags

| Flag              | Required | Description                                              |
| ----------------- | -------- | -------------------------------------------------------- |
| `--local`         | optional | Include local tags.                                      |
| `--remote`        | optional | Include remote tags from configured `git.remote`.        |
| `--target <name>` | optional | Show only tags matching the named configured target.     |
| `--json`          | optional | Machine output. See [Output modes](../output#list-json). |

With no `--local`/`--remote`, `list` reads both local and remote tags. `--local --remote` is the same as the default.

## Behavior

In order:

1. Discover repo, load config, validate target paths.
2. Read local tags, remote tags, or both according to the source flags.
3. Match tag names against configured target `tagPattern` values.
4. Ignore tags that match no configured target.
5. Classify matching tags by target, channel, version, legacy state, and source presence.
6. Sort by target name ascending, then SemVer descending within each target.

`--target <name>` fails with `unknown target <name>` when the target is not configured.

## Managed and legacy tags

Managed tags are matching tags after the target's `initialVersion` adoption boundary. They must satisfy the same managed-tag policy used by `tag` and `validate`: canonical SemVer without build metadata, configured channel shape, annotated local tags, provable remote annotations, and matching local/remote peeled commits when a tag exists on both sides.

Legacy tags are matching tags at or before the target's `initialVersion` adoption boundary. They are shown instead of hidden, and they do not need to be annotated.

Pattern-matching tags with invalid SemVer fail as malformed. Tags matching no target pattern are ignored.

## Status

Human and JSON output use the same status vocabulary:

- `local+remote`
- `local-only`
- `remote-only`
- `legacy local+remote`
- `legacy local-only`
- `legacy remote-only`

## Output

Human-mode output:

```text
tag            target  channel  version     status
app@1.3.0     app     stable   1.3.0       local+remote
app@1.2.0     app     stable   1.2.0       legacy remote-only
app@1.1.0-rc.1 app    rc       1.1.0-rc.1  local-only
```

`list --json` emits an array of records. See [Output modes](../output#list-json).

## Common errors

- `unknown target <name>` — `--target` does not match a configured target.
- `failed to read local tags` — Git local tag inspection failed.
- `failed to read remote tags from <remote>` — remote tag inspection failed.
- malformed managed tag errors when the matching managed namespace has broken tags.
