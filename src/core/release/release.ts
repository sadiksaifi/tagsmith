import semver from "semver";

import type { ChannelConfig, EffectiveTargetConfig } from "@/core/config/config";

export type ReleaseBump = "major" | "minor" | "patch" | "prerelease";

export type ReleaseRequest =
  | { readonly bump: ReleaseBump; readonly type: "bump" }
  | { readonly type: "version"; readonly version: string };

export interface GitTagRef {
  readonly annotated: boolean;
  readonly name: string;
  readonly peeledCommit: string | undefined;
}

export interface DryRunReleaseInput {
  readonly channelName: string;
  readonly currentHead: string;
  readonly localTags: readonly GitTagRef[];
  readonly push: boolean;
  readonly remoteTags: readonly GitTagRef[];
  readonly request: ReleaseRequest;
  readonly target: EffectiveTargetConfig;
}

export type DryRunReleaseResult =
  | {
      readonly baseVersion: string;
      readonly channel: string;
      readonly commit: string;
      readonly created: false;
      readonly dryRun: true;
      readonly ok: true;
      readonly pushed: false;
      readonly strategy: "prerelease" | "stable";
      readonly tag: string;
      readonly tagMessage: string;
      readonly target: string;
      readonly version: string;
      readonly wouldPush: boolean;
    }
  | { readonly error: string; readonly ok: false };

interface ManagedTag {
  readonly channelName: string;
  readonly local: GitTagRef;
  readonly name: string;
  readonly remote: GitTagRef;
  readonly strategy: "prerelease" | "stable";
  readonly version: semver.SemVer;
}

interface PatternParts {
  readonly prefix: string;
  readonly suffix: string;
}

export function resolveDryRunRelease(input: DryRunReleaseInput): DryRunReleaseResult {
  const channel = input.target.channels.find((candidate) => candidate.name === input.channelName);
  if (channel === undefined) {
    return {
      error: `unknown channel ${input.channelName} for target ${input.target.name}`,
      ok: false,
    };
  }

  if (input.request.type === "version") {
    const requestedTag = formatTag(input.target, input.request.version);
    if (
      input.localTags.some((tagRef) => tagRef.name === requestedTag) ||
      input.remoteTags.some((tagRef) => tagRef.name === requestedTag)
    ) {
      return { error: `tag ${requestedTag} already exists locally or remotely`, ok: false };
    }
  }

  const history = collectManagedHistory(input);
  if (!history.ok) {
    return history;
  }

  const versionResult = resolveRequestedVersion(input.target, channel, input.request, history.tags);
  if (!versionResult.ok) {
    return versionResult;
  }

  const tag = formatTag(input.target, versionResult.version.version);
  if (
    input.localTags.some((tagRef) => tagRef.name === tag) ||
    input.remoteTags.some((tagRef) => tagRef.name === tag)
  ) {
    return { error: `tag ${tag} already exists locally or remotely`, ok: false };
  }

  const dependency = validateDependencies({
    channel,
    currentHead: input.currentHead,
    history: history.tags,
    target: input.target,
    version: versionResult.version,
  });
  if (!dependency.ok) {
    return dependency;
  }

  return {
    baseVersion: baseVersion(versionResult.version),
    channel: channel.name,
    commit: input.currentHead,
    created: false,
    dryRun: true,
    ok: true,
    pushed: false,
    strategy: channel.strategy,
    tag,
    tagMessage: renderTagMessage(input.target.tagMessage, {
      tag,
      target: input.target.name,
      version: versionResult.version.version,
    }),
    target: input.target.name,
    version: versionResult.version.version,
    wouldPush: input.push,
  };
}

function collectManagedHistory(
  input: DryRunReleaseInput,
):
  | { readonly ok: true; readonly tags: readonly ManagedTag[] }
  | { readonly error: string; readonly ok: false } {
  const parts = patternParts(input.target);
  const localManaged = collectSideManagedTags(input.target, input.localTags, parts, "local");
  if (!localManaged.ok) {
    return localManaged;
  }
  const remoteManaged = collectSideManagedTags(input.target, input.remoteTags, parts, "remote");
  if (!remoteManaged.ok) {
    return remoteManaged;
  }

  const remoteByName = new Map(remoteManaged.tags.map((tag) => [tag.name, tag]));
  const localByName = new Map(localManaged.tags.map((tag) => [tag.name, tag]));
  const combined: ManagedTag[] = [];

  for (const local of localManaged.tags) {
    const remote = remoteByName.get(local.name);
    if (remote === undefined) {
      return { error: `managed tag ${local.name} is missing from remote tags`, ok: false };
    }
    if (local.ref.peeledCommit !== remote.ref.peeledCommit) {
      return {
        error: `malformed managed tag ${local.name}: local/remote peeled commits differ`,
        ok: false,
      };
    }
    combined.push({
      channelName: local.channelName,
      local: local.ref,
      name: local.name,
      remote: remote.ref,
      strategy: local.strategy,
      version: local.version,
    });
  }

  for (const remote of remoteManaged.tags) {
    if (!localByName.has(remote.name)) {
      return { error: `managed tag ${remote.name} is missing from local tags`, ok: false };
    }
  }

  return { ok: true, tags: combined };
}

function collectSideManagedTags(
  target: EffectiveTargetConfig,
  refs: readonly GitTagRef[],
  parts: PatternParts,
  side: "local" | "remote",
):
  | { readonly ok: true; readonly tags: readonly SideManagedTag[] }
  | { readonly error: string; readonly ok: false } {
  const tags: SideManagedTag[] = [];

  for (const ref of refs) {
    const captured = captureVersion(ref.name, parts);
    if (captured === undefined) {
      continue;
    }

    if (!ref.annotated || ref.peeledCommit === undefined) {
      return {
        error:
          side === "remote"
            ? `malformed managed tag ${ref.name}: remote annotation cannot be proven`
            : `malformed managed tag ${ref.name}: lightweight tag is not allowed`,
        ok: false,
      };
    }

    const parsed = parsePolicyVersion(captured);
    if (parsed === undefined) {
      const reason = captured.includes("+") ? "build metadata" : "canonical SemVer";
      return { error: `malformed managed tag ${ref.name}: ${reason} is invalid`, ok: false };
    }

    const classified = classifyVersion(target, parsed);
    if (!classified.ok) {
      return { error: `malformed managed tag ${ref.name}: ${classified.error}`, ok: false };
    }

    if (semver.lt(baseVersion(parsed), target.initialVersion)) {
      return {
        error: `malformed managed tag ${ref.name}: version is below initialVersion ${target.initialVersion}`,
        ok: false,
      };
    }

    tags.push({ ...classified, name: ref.name, ref, version: parsed });
  }

  return { ok: true, tags };
}

interface SideManagedTag {
  readonly channelName: string;
  readonly name: string;
  readonly ref: GitTagRef;
  readonly strategy: "prerelease" | "stable";
  readonly version: semver.SemVer;
}

function resolveRequestedVersion(
  target: EffectiveTargetConfig,
  channel: ChannelConfig,
  request: ReleaseRequest,
  history: readonly ManagedTag[],
):
  | { readonly ok: true; readonly version: semver.SemVer }
  | { readonly error: string; readonly ok: false } {
  if (request.type === "bump") {
    return resolveBump(target, channel, request.bump, history);
  }
  return resolveExplicit(target, channel, request.version, history);
}

function resolveBump(
  target: EffectiveTargetConfig,
  channel: ChannelConfig,
  bump: ReleaseBump,
  history: readonly ManagedTag[],
):
  | { readonly ok: true; readonly version: semver.SemVer }
  | { readonly error: string; readonly ok: false } {
  if (channel.strategy === "stable") {
    if (bump === "prerelease") {
      return { error: `stable channel ${channel.name} rejects --bump prerelease`, ok: false };
    }
    return parseResolvedVersion(
      semver.inc(latestStable(history)?.version ?? target.initialVersion, bump),
      `failed to resolve ${bump} bump`,
    );
  }

  if (bump === "prerelease") {
    const latestSameChannel = latestPrereleaseForChannel(history, channel.name);
    if (latestSameChannel === undefined) {
      return {
        error: `Cannot bump prerelease for ${target.name} ${channel.name}: no existing ${channel.name} prerelease tag found. Use --bump major, --bump minor, --bump patch, or --version to start a prerelease line.`,
        ok: false,
      };
    }
    const next = new semver.SemVer(latestSameChannel.version.version);
    const counter = next.prerelease[1];
    if (typeof counter !== "number") {
      return { error: `latest ${channel.name} prerelease has invalid counter`, ok: false };
    }
    next.prerelease = [channel.name, counter + 1];
    next.format();
    return { ok: true, version: next };
  }

  const base = semver.inc(latestStable(history)?.version ?? target.initialVersion, bump);
  if (base === null) {
    return { error: `failed to resolve ${bump} bump`, ok: false };
  }
  const version = parsePolicyVersion(`${base}-${channel.name}.1`);
  if (version === undefined) {
    return { error: `failed to resolve ${bump} bump`, ok: false };
  }
  const latestSameChannel = latestPrereleaseForChannel(history, channel.name);
  if (latestSameChannel !== undefined && semver.lte(version, latestSameChannel.version)) {
    return {
      error: `resolved version ${version.version} must be greater than latest ${channel.name} ${latestSameChannel.version.version}`,
      ok: false,
    };
  }
  return { ok: true, version };
}

function resolveExplicit(
  target: EffectiveTargetConfig,
  channel: ChannelConfig,
  value: string,
  history: readonly ManagedTag[],
):
  | { readonly ok: true; readonly version: semver.SemVer }
  | { readonly error: string; readonly ok: false } {
  const version = parsePolicyVersion(value);
  if (version === undefined) {
    return {
      error: `${value} must be canonical SemVer without build metadata or leading v`,
      ok: false,
    };
  }

  if (channel.strategy === "stable" && version.prerelease.length > 0) {
    return { error: `${value} must be a stable SemVer for channel ${channel.name}`, ok: false };
  }
  if (channel.strategy === "prerelease" && version.prerelease[0] !== channel.name) {
    return { error: `${value} must match channel ${channel.name}`, ok: false };
  }

  const classified = classifyVersion(target, version);
  if (!classified.ok) {
    return { error: classified.error, ok: false };
  }
  if (classified.channelName !== channel.name) {
    return { error: `${value} must match channel ${channel.name}`, ok: false };
  }

  if (channel.strategy === "stable") {
    const latestStableTag = latestStable(history);
    if (latestStableTag !== undefined && semver.lte(version, latestStableTag.version)) {
      return {
        error: `${value} must be greater than latest stable ${latestStableTag.version.version}`,
        ok: false,
      };
    }
    if (latestStableTag === undefined && semver.lt(version, target.initialVersion)) {
      return {
        error: `${value} must be greater than or equal to initialVersion ${target.initialVersion}`,
        ok: false,
      };
    }
    return { ok: true, version };
  }

  const latestSameChannel = latestPrereleaseForChannel(history, channel.name);
  if (latestSameChannel !== undefined && semver.lte(version, latestSameChannel.version)) {
    return {
      error: `${value} must be greater than latest ${channel.name} ${latestSameChannel.version.version}`,
      ok: false,
    };
  }

  const latestStableTag = latestStable(history);
  const base = baseVersion(version);
  if (latestStableTag !== undefined && semver.lte(base, latestStableTag.version.version)) {
    return {
      error: `${value} base version must be greater than latest stable ${latestStableTag.version.version}`,
      ok: false,
    };
  }
  if (latestStableTag === undefined && semver.lt(base, target.initialVersion)) {
    return {
      error: `${value} base version must be greater than or equal to initialVersion ${target.initialVersion}`,
      ok: false,
    };
  }

  return { ok: true, version };
}

function validateDependencies(input: {
  readonly channel: ChannelConfig;
  readonly currentHead: string;
  readonly history: readonly ManagedTag[];
  readonly target: EffectiveTargetConfig;
  readonly version: semver.SemVer;
}): { readonly ok: true } | { readonly error: string; readonly ok: false } {
  const base = baseVersion(input.version);

  for (const dependencyName of input.channel.dependsOn ?? []) {
    const dependencyChannel = input.target.channels.find(
      (channel) => channel.name === dependencyName,
    );
    if (dependencyChannel === undefined) {
      return {
        error: `channel ${input.channel.name} depends on missing channel ${dependencyName}`,
        ok: false,
      };
    }

    const dependency = latestDependencyForBase(input.history, dependencyChannel, base);
    if (dependency === undefined) {
      return {
        error: `resolved ${formatTag(input.target, input.version.version)} requires dependency tag for ${dependencyName} at ${base}`,
        ok: false,
      };
    }
    if (
      dependency.local.peeledCommit !== input.currentHead ||
      dependency.remote.peeledCommit !== input.currentHead
    ) {
      return {
        error: `dependency tag ${dependency.name} must peel to current HEAD ${input.currentHead}`,
        ok: false,
      };
    }
  }

  return { ok: true };
}

function latestDependencyForBase(
  history: readonly ManagedTag[],
  channel: ChannelConfig,
  base: string,
): ManagedTag | undefined {
  const matches = history.filter((tag) => {
    if (tag.channelName !== channel.name) {
      return false;
    }
    if (channel.strategy === "stable") {
      return tag.version.prerelease.length === 0 && tag.version.version === base;
    }
    return tag.version.prerelease.length > 0 && baseVersion(tag.version) === base;
  });
  return latest(matches);
}

function classifyVersion(
  target: EffectiveTargetConfig,
  version: semver.SemVer,
):
  | { readonly channelName: string; readonly ok: true; readonly strategy: "prerelease" | "stable" }
  | { readonly error: string; readonly ok: false } {
  if (version.prerelease.length === 0) {
    const stable = target.channels.find((channel) => channel.strategy === "stable");
    return stable === undefined
      ? { error: "stable channel is missing", ok: false }
      : { channelName: stable.name, ok: true, strategy: "stable" };
  }

  const [channelName, counter, ...rest] = version.prerelease;
  if (
    typeof channelName !== "string" ||
    typeof counter !== "number" ||
    counter < 1 ||
    rest.length > 0
  ) {
    return { error: "wrong prerelease shape", ok: false };
  }
  const channel = target.channels.find(
    (candidate) => candidate.name === channelName && candidate.strategy === "prerelease",
  );
  if (channel === undefined) {
    return { error: `wrong prerelease shape for channel ${channelName}`, ok: false };
  }
  return { channelName: channel.name, ok: true, strategy: "prerelease" };
}

function parseResolvedVersion(
  value: string | null,
  error: string,
):
  | { readonly ok: true; readonly version: semver.SemVer }
  | { readonly error: string; readonly ok: false } {
  if (value === null) {
    return { error, ok: false };
  }
  const version = parsePolicyVersion(value);
  return version === undefined ? { error, ok: false } : { ok: true, version };
}

function parsePolicyVersion(value: string): semver.SemVer | undefined {
  const version = semver.parse(value, { loose: false });
  if (version === null || version.version !== value || version.build.length > 0) {
    return undefined;
  }
  return version;
}

function latestStable(history: readonly ManagedTag[]): ManagedTag | undefined {
  return latest(history.filter((tag) => tag.strategy === "stable"));
}

function latestPrereleaseForChannel(
  history: readonly ManagedTag[],
  channelName: string,
): ManagedTag | undefined {
  return latest(
    history.filter((tag) => tag.strategy === "prerelease" && tag.channelName === channelName),
  );
}

function latest(tags: readonly ManagedTag[]): ManagedTag | undefined {
  return tags.toSorted((left, right) => semver.rcompare(left.version, right.version))[0];
}

function baseVersion(version: semver.SemVer): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function captureVersion(tagName: string, parts: PatternParts): string | undefined {
  if (!tagName.startsWith(parts.prefix) || !tagName.endsWith(parts.suffix)) {
    return undefined;
  }
  return tagName.slice(parts.prefix.length, tagName.length - parts.suffix.length);
}

function patternParts(target: EffectiveTargetConfig): PatternParts {
  const rendered = target.tagPattern.replace("{target}", target.name);
  const marker = "{version}";
  const index = rendered.indexOf(marker);
  return {
    prefix: rendered.slice(0, index),
    suffix: rendered.slice(index + marker.length),
  };
}

function formatTag(target: EffectiveTargetConfig, version: string): string {
  return target.tagPattern.replace("{target}", target.name).replace("{version}", version);
}

function renderTagMessage(
  message: string,
  values: { readonly tag: string; readonly target: string; readonly version: string },
): string {
  return message
    .replaceAll("{target}", values.target)
    .replaceAll("{version}", values.version)
    .replaceAll("{tag}", values.tag);
}
