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

export interface ReleasePlan {
  readonly baseVersion: string;
  readonly channel: string;
  readonly commit: string;
  readonly strategy: "prerelease" | "stable";
  readonly tag: string;
  readonly tagMessage: string;
  readonly target: string;
  readonly version: string;
}

export type ValidatedReleaseResult = ReleasePlan & {
  readonly baseBranch: string;
  readonly remote: string;
  readonly valid: true;
};

export interface ValidateExistingReleaseInput {
  readonly baseBranch: string;
  readonly channelName?: string | undefined;
  readonly localTags: readonly GitTagRef[];
  readonly remote: string;
  readonly remoteTags: readonly GitTagRef[];
  readonly tagName: string;
  readonly targetName?: string | undefined;
  readonly targets: readonly EffectiveTargetConfig[];
}

export type ValidateExistingReleaseResult =
  | { readonly ok: true; readonly result: ValidatedReleaseResult }
  | { readonly error: string; readonly ok: false };

export type ListedTagStatus =
  | "legacy local+remote"
  | "legacy local-only"
  | "legacy remote-only"
  | "local+remote"
  | "local-only"
  | "remote-only";

export interface ListedTag {
  readonly channel: string;
  readonly commit: string;
  readonly legacy: boolean;
  readonly local: boolean;
  readonly remote: boolean;
  readonly status: ListedTagStatus;
  readonly tag: string;
  readonly target: string;
  readonly version: string;
}

export interface ListConfiguredTagsInput {
  readonly channelName?: string | undefined;
  readonly localTags: readonly GitTagRef[];
  readonly remoteTags: readonly GitTagRef[];
  readonly targetName?: string | undefined;
  readonly targets: readonly EffectiveTargetConfig[];
}

export type ListConfiguredTagsResult =
  | { readonly ok: true; readonly tags: readonly ListedTag[] }
  | { readonly error: string; readonly ok: false };

export type DryRunReleaseResult =
  | (ReleasePlan & {
      readonly created: false;
      readonly dryRun: true;
      readonly ok: true;
      readonly pushed: false;
      readonly wouldPush: boolean;
    })
  | { readonly error: string; readonly ok: false };

interface ManagedTag {
  readonly channelName: string;
  readonly local: GitTagRef | undefined;
  readonly name: string;
  readonly remote: GitTagRef | undefined;
  readonly strategy: "prerelease" | "stable";
  readonly version: semver.SemVer;
}

interface PatternParts {
  readonly prefix: string;
  readonly suffix: string;
}

export function validateExistingRelease(
  input: ValidateExistingReleaseInput,
): ValidateExistingReleaseResult {
  const targetSelection = selectValidationTarget(input);
  if (!targetSelection.ok) {
    return targetSelection;
  }

  const captured = captureVersion(input.tagName, patternParts(targetSelection.target));
  if (captured === undefined) {
    return {
      error: `tag ${input.tagName} does not match target ${targetSelection.target.name}`,
      ok: false,
    };
  }

  if (isAtOrBeforeAdoptionBoundary(captured, targetSelection.target)) {
    return {
      error: `tag ${input.tagName} predates Tagsmith adoption boundary initialVersion ${targetSelection.target.initialVersion} and is outside managed history`,
      ok: false,
    };
  }

  const version = parsePolicyVersion(captured);
  if (version === undefined) {
    return {
      error: `tag ${input.tagName} must contain canonical SemVer without build metadata`,
      ok: false,
    };
  }

  const classified = classifyVersion(targetSelection.target, version);
  if (!classified.ok) {
    return { error: `tag ${input.tagName}: ${classified.error}`, ok: false };
  }

  if (input.channelName !== undefined && input.channelName !== classified.channelName) {
    return {
      error: `--channel ${input.channelName} does not match inferred channel ${classified.channelName}`,
      ok: false,
    };
  }

  if (!input.localTags.some((tag) => tag.name === input.tagName)) {
    return { error: `tag ${input.tagName} must exist locally`, ok: false };
  }
  if (!input.remoteTags.some((tag) => tag.name === input.tagName)) {
    return { error: `tag ${input.tagName} must exist remotely`, ok: false };
  }

  const history = collectValidationHistory({
    localTags: input.localTags,
    remoteTags: input.remoteTags,
    target: targetSelection.target,
  });
  if (!history.ok) {
    return history;
  }

  const requested = history.tags.find((tag) => tag.name === input.tagName);
  if (requested === undefined) {
    const localExists = input.localTags.some((tag) => tag.name === input.tagName);
    const remoteExists = input.remoteTags.some((tag) => tag.name === input.tagName);
    if (!localExists) {
      return { error: `tag ${input.tagName} must exist locally`, ok: false };
    }
    if (!remoteExists) {
      return { error: `tag ${input.tagName} must exist remotely`, ok: false };
    }
    return { error: `tag ${input.tagName} is not a valid managed tag`, ok: false };
  }

  if (requested.local === undefined || requested.remote === undefined) {
    return { error: `tag ${input.tagName} must exist locally and remotely`, ok: false };
  }

  const channel = targetSelection.target.channels.find(
    (candidate) => candidate.name === requested.channelName,
  );
  if (channel === undefined) {
    return { error: `unknown channel ${requested.channelName}`, ok: false };
  }

  const dependency = validateValidationDependencies({
    channel,
    expectedCommit: requested.local.peeledCommit ?? "",
    history,
    target: targetSelection.target,
    version,
  });
  if (!dependency.ok) {
    return dependency;
  }

  return {
    ok: true,
    result: {
      baseBranch: input.baseBranch,
      baseVersion: baseVersion(version),
      channel: requested.channelName,
      commit: requested.local.peeledCommit ?? "",
      remote: input.remote,
      strategy: requested.strategy,
      tag: input.tagName,
      tagMessage: renderTagMessage(targetSelection.target.tagMessage, {
        tag: input.tagName,
        target: targetSelection.target.name,
        version: version.version,
      }),
      target: targetSelection.target.name,
      valid: true,
      version: version.version,
    },
  };
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
    expectedCommit: input.currentHead,
    history: history.tags,
    subject: "current HEAD",
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

export function listConfiguredTags(input: ListConfiguredTagsInput): ListConfiguredTagsResult {
  const selectedTargets =
    input.targetName === undefined
      ? input.targets
      : input.targets.filter((target) => target.name === input.targetName);
  if (input.targetName !== undefined && selectedTargets.length === 0) {
    return { error: `unknown target ${input.targetName}`, ok: false };
  }
  if (
    input.channelName !== undefined &&
    !selectedTargets.some((target) =>
      target.channels.some((channel) => channel.name === input.channelName),
    )
  ) {
    return { error: `unknown channel ${input.channelName}`, ok: false };
  }

  const tags: ListedTag[] = [];

  for (const target of selectedTargets) {
    const history = collectManagedHistory({
      localTags: input.localTags,
      remoteTags: input.remoteTags,
      target,
    });
    if (!history.ok) {
      return history;
    }
    const legacy = collectLegacyHistory({
      localTags: input.localTags,
      remoteTags: input.remoteTags,
      target,
    });
    if (!legacy.ok) {
      return legacy;
    }

    tags.push(
      ...history.tags.filter(isRequestedChannel(input.channelName)).map((tag) => ({
        channel: tag.channelName,
        commit: tag.local?.peeledCommit ?? tag.remote?.peeledCommit ?? "",
        legacy: false,
        local: tag.local !== undefined,
        remote: tag.remote !== undefined,
        status: listedTagStatus(tag.local !== undefined, tag.remote !== undefined),
        tag: tag.name,
        target: target.name,
        version: tag.version.raw,
      })),
      ...legacy.tags.filter(isRequestedChannel(input.channelName)).map((tag) => ({
        channel: tag.channelName,
        commit: tag.local?.peeledCommit ?? tag.remote?.peeledCommit ?? "",
        legacy: true,
        local: tag.local !== undefined,
        remote: tag.remote !== undefined,
        status: listedTagStatus(tag.local !== undefined, tag.remote !== undefined, true),
        tag: tag.name,
        target: target.name,
        version: tag.version.raw,
      })),
    );
  }

  return { ok: true, tags: sortListedTags(tags) };
}

function isRequestedChannel(channelName: string | undefined) {
  return (tag: { readonly channelName: string }) =>
    channelName === undefined || tag.channelName === channelName;
}

function collectLegacyHistory(input: {
  readonly localTags: readonly GitTagRef[];
  readonly remoteTags: readonly GitTagRef[];
  readonly target: EffectiveTargetConfig;
}):
  | { readonly ok: true; readonly tags: readonly LegacyTag[] }
  | { readonly error: string; readonly ok: false } {
  const parts = patternParts(input.target);
  const local = collectSideLegacyTags(input.target, input.localTags, parts);
  if (!local.ok) {
    return local;
  }
  const remote = collectSideLegacyTags(input.target, input.remoteTags, parts);
  if (!remote.ok) {
    return remote;
  }

  return { ok: true, tags: combineLegacyTags(local.tags, remote.tags) };
}

function combineLegacyTags(
  localTags: readonly SideLegacyTag[],
  remoteTags: readonly SideLegacyTag[],
): readonly LegacyTag[] {
  const remoteByName = new Map(remoteTags.map((tag) => [tag.name, tag]));
  const seenRemoteNames = new Set<string>();
  const combined: LegacyTag[] = [];

  for (const local of localTags) {
    const remote = remoteByName.get(local.name);
    if (remote !== undefined) {
      seenRemoteNames.add(remote.name);
    }
    combined.push({
      channelName: local.channelName,
      local: local.ref,
      name: local.name,
      remote: remote?.ref,
      version: local.version,
    });
  }

  for (const remote of remoteTags) {
    if (seenRemoteNames.has(remote.name)) {
      continue;
    }
    combined.push({
      channelName: remote.channelName,
      local: undefined,
      name: remote.name,
      remote: remote.ref,
      version: remote.version,
    });
  }

  return combined;
}

function collectSideLegacyTags(
  target: EffectiveTargetConfig,
  refs: readonly GitTagRef[],
  parts: PatternParts,
):
  | { readonly ok: true; readonly tags: readonly SideLegacyTag[] }
  | { readonly error: string; readonly ok: false } {
  const tags: SideLegacyTag[] = [];

  for (const ref of refs) {
    const captured = captureVersion(ref.name, parts);
    if (captured === undefined || !isAtOrBeforeAdoptionBoundary(captured, target)) {
      continue;
    }

    const version = semver.parse(captured, { loose: false });
    if (version === null) {
      return { error: `malformed legacy tag ${ref.name}: SemVer is invalid`, ok: false };
    }

    const classified = classifyVersion(target, version);
    if (!classified.ok) {
      return { error: `malformed legacy tag ${ref.name}: ${classified.error}`, ok: false };
    }

    tags.push({ ...classified, name: ref.name, ref, version });
  }

  return { ok: true, tags };
}

function collectManagedHistory(input: {
  readonly localTags: readonly GitTagRef[];
  readonly remoteTags: readonly GitTagRef[];
  readonly target: EffectiveTargetConfig;
}):
  | { readonly ok: true; readonly tags: readonly ManagedTag[] }
  | { readonly error: string; readonly ok: false } {
  const history = collectManagedSides(input);
  if (!history.ok) {
    return history;
  }

  return combineManagedTags(history.local.tags, history.remote.tags, { includeSideOnly: true });
}

function collectValidationHistory(input: {
  readonly localTags: readonly GitTagRef[];
  readonly remoteTags: readonly GitTagRef[];
  readonly target: EffectiveTargetConfig;
}):
  | {
      readonly localTags: readonly SideManagedTag[];
      readonly ok: true;
      readonly remoteTags: readonly SideManagedTag[];
      readonly tags: readonly ManagedTag[];
    }
  | { readonly error: string; readonly ok: false } {
  const history = collectManagedSides(input);
  if (!history.ok) {
    return history;
  }

  const paired = combineManagedTags(history.local.tags, history.remote.tags, {
    includeSideOnly: false,
  });
  if (!paired.ok) {
    return paired;
  }

  return {
    localTags: history.local.tags,
    ok: true,
    remoteTags: history.remote.tags,
    tags: paired.tags,
  };
}

function collectManagedSides(input: {
  readonly localTags: readonly GitTagRef[];
  readonly remoteTags: readonly GitTagRef[];
  readonly target: EffectiveTargetConfig;
}):
  | {
      readonly local: { readonly tags: readonly SideManagedTag[] };
      readonly ok: true;
      readonly remote: { readonly tags: readonly SideManagedTag[] };
    }
  | { readonly error: string; readonly ok: false } {
  const parts = patternParts(input.target);
  const local = collectSideManagedTags(input.target, input.localTags, parts, "local");
  if (!local.ok) {
    return local;
  }
  const remote = collectSideManagedTags(input.target, input.remoteTags, parts, "remote");
  if (!remote.ok) {
    return remote;
  }

  return { local, ok: true, remote };
}

function combineManagedTags(
  localTags: readonly SideManagedTag[],
  remoteTags: readonly SideManagedTag[],
  options: { readonly includeSideOnly: boolean },
):
  | { readonly ok: true; readonly tags: readonly ManagedTag[] }
  | { readonly error: string; readonly ok: false } {
  const remoteByName = new Map(remoteTags.map((tag) => [tag.name, tag]));
  const seenRemoteNames = new Set<string>();
  const combined: ManagedTag[] = [];

  for (const local of localTags) {
    const remote = remoteByName.get(local.name);
    if (remote !== undefined) {
      seenRemoteNames.add(remote.name);
      if (local.ref.peeledCommit !== remote.ref.peeledCommit) {
        return {
          error: `malformed managed tag ${local.name}: local/remote peeled commits differ`,
          ok: false,
        };
      }
    }
    if (remote !== undefined || options.includeSideOnly) {
      combined.push({
        channelName: local.channelName,
        local: local.ref,
        name: local.name,
        remote: remote?.ref,
        strategy: local.strategy,
        version: local.version,
      });
    }
  }

  if (options.includeSideOnly) {
    for (const remote of remoteTags) {
      if (seenRemoteNames.has(remote.name)) {
        continue;
      }
      combined.push({
        channelName: remote.channelName,
        local: undefined,
        name: remote.name,
        remote: remote.ref,
        strategy: remote.strategy,
        version: remote.version,
      });
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

    if (isAtOrBeforeAdoptionBoundary(captured, target)) {
      continue;
    }

    const parsed = parsePolicyVersion(captured);
    if (parsed === undefined) {
      const reason = captured.includes("+") ? "build metadata" : "canonical SemVer";
      return { error: `malformed managed tag ${ref.name}: ${reason} is invalid`, ok: false };
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

interface SideLegacyTag {
  readonly channelName: string;
  readonly name: string;
  readonly ref: GitTagRef;
  readonly strategy: "prerelease" | "stable";
  readonly version: semver.SemVer;
}

interface LegacyTag {
  readonly channelName: string;
  readonly local: GitTagRef | undefined;
  readonly name: string;
  readonly remote: GitTagRef | undefined;
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
    if (latestStableTag === undefined && semver.lte(version, target.initialVersion)) {
      return {
        error: `${value} must be greater than initialVersion ${target.initialVersion}`,
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
  if (latestStableTag === undefined && semver.lte(base, target.initialVersion)) {
    return {
      error: `${value} base version must be greater than initialVersion ${target.initialVersion}`,
      ok: false,
    };
  }

  return { ok: true, version };
}

function validateDependencies(input: {
  readonly channel: ChannelConfig;
  readonly expectedCommit: string;
  readonly history: readonly ManagedTag[];
  readonly subject: string;
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
    if (dependency.local === undefined || dependency.remote === undefined) {
      return {
        error: `dependency tag ${dependency.name} must exist locally and remotely`,
        ok: false,
      };
    }
    if (
      dependency.local.peeledCommit !== input.expectedCommit ||
      dependency.remote.peeledCommit !== input.expectedCommit
    ) {
      return {
        error: `dependency tag ${dependency.name} must peel to ${input.subject} ${input.expectedCommit}`,
        ok: false,
      };
    }
  }

  return { ok: true };
}

function validateValidationDependencies(input: {
  readonly channel: ChannelConfig;
  readonly expectedCommit: string;
  readonly history: {
    readonly localTags: readonly SideManagedTag[];
    readonly remoteTags: readonly SideManagedTag[];
    readonly tags: readonly ManagedTag[];
  };
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

    const latestSideDependency = latestSideDependencyForBase(
      [...input.history.localTags, ...input.history.remoteTags],
      dependencyChannel,
      base,
    );
    if (latestSideDependency === undefined) {
      return {
        error: `resolved ${formatTag(input.target, input.version.version)} requires dependency tag for ${dependencyName} at ${base}`,
        ok: false,
      };
    }

    const dependency = input.history.tags.find((tag) => tag.name === latestSideDependency.name);
    if (dependency === undefined) {
      return {
        error: `dependency tag ${latestSideDependency.name} must exist locally and remotely`,
        ok: false,
      };
    }
    if (dependency.local === undefined || dependency.remote === undefined) {
      return {
        error: `dependency tag ${dependency.name} must exist locally and remotely`,
        ok: false,
      };
    }
    if (
      dependency.local.peeledCommit !== input.expectedCommit ||
      dependency.remote.peeledCommit !== input.expectedCommit
    ) {
      return {
        error: `dependency tag ${dependency.name} must peel to validated tag commit ${input.expectedCommit}`,
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
  return latest(history.filter((tag) => isDependencyForBase(tag, channel, base)));
}

function latestSideDependencyForBase(
  history: readonly SideManagedTag[],
  channel: ChannelConfig,
  base: string,
): SideManagedTag | undefined {
  return latestSide(history.filter((tag) => isDependencyForBase(tag, channel, base)));
}

function isDependencyForBase(
  tag: Pick<ManagedTag, "channelName" | "version">,
  channel: ChannelConfig,
  base: string,
): boolean {
  if (tag.channelName !== channel.name) {
    return false;
  }
  if (channel.strategy === "stable") {
    return tag.version.prerelease.length === 0 && tag.version.version === base;
  }
  return tag.version.prerelease.length > 0 && baseVersion(tag.version) === base;
}

function selectValidationTarget(
  input: ValidateExistingReleaseInput,
):
  | { readonly ok: true; readonly target: EffectiveTargetConfig }
  | { readonly error: string; readonly ok: false } {
  if (input.targetName !== undefined) {
    const target = input.targets.find((candidate) => candidate.name === input.targetName);
    if (target === undefined) {
      return { error: `unknown target ${input.targetName}`, ok: false };
    }
    if (captureVersion(input.tagName, patternParts(target)) === undefined) {
      return { error: `tag ${input.tagName} does not match target ${target.name}`, ok: false };
    }
    return { ok: true, target };
  }

  const matches = input.targets.filter(
    (target) => captureVersion(input.tagName, patternParts(target)) !== undefined,
  );
  if (matches.length === 1 && matches[0] !== undefined) {
    return { ok: true, target: matches[0] };
  }
  if (matches.length === 0) {
    return { error: `tag ${input.tagName} does not match any configured target`, ok: false };
  }
  return { error: `tag ${input.tagName} matches multiple targets`, ok: false };
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

function listedTagStatus(local: boolean, remote: boolean, legacy = false): ListedTagStatus {
  const prefix = legacy ? "legacy " : "";
  if (local && remote) {
    return `${prefix}local+remote`;
  }
  return local ? `${prefix}local-only` : `${prefix}remote-only`;
}

function sortListedTags(tags: readonly ListedTag[]): readonly ListedTag[] {
  return tags.toSorted((left, right) => {
    const targetOrder = left.target.localeCompare(right.target);
    return targetOrder === 0 ? semver.rcompare(left.version, right.version) : targetOrder;
  });
}

function isAtOrBeforeAdoptionBoundary(value: string, target: EffectiveTargetConfig): boolean {
  const version = semver.parse(value, { loose: false });
  if (version === null || value.startsWith("v")) {
    return false;
  }
  return semver.lte(baseVersion(version), target.initialVersion);
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

function latestSide(tags: readonly SideManagedTag[]): SideManagedTag | undefined {
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
