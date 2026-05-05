import { parse, type ParseError, printParseErrorCode, visit } from "jsonc-parser";
import semver from "semver";
import { z } from "zod";

export const schemaUrl =
  "https://raw.githubusercontent.com/sadiksaifi/tagsmith/refs/heads/main/schema/v1.json";

export type ChannelStrategy = "prerelease" | "stable";

export interface ChannelConfig {
  readonly dependsOn?: readonly string[] | undefined;
  readonly name: string;
  readonly strategy: ChannelStrategy;
}

export interface TargetConfig {
  readonly channels: readonly ChannelConfig[];
  readonly initialVersion?: string | undefined;
  readonly path: string;
  readonly tagMessage?: string | undefined;
  readonly tagPattern?: string | undefined;
}

export interface TagsmithConfig {
  readonly $schema?: string | undefined;
  readonly configVersion: 1;
  readonly defaults: {
    readonly initialVersion: string;
    readonly tagMessage: string;
    readonly tagPattern: string;
  };
  readonly git: {
    readonly baseBranch: string;
    readonly remote: string;
  };
  readonly targets: Readonly<Record<string, TargetConfig>>;
}

export interface EffectiveTargetConfig {
  readonly channels: readonly ChannelConfig[];
  readonly initialVersion: string;
  readonly name: string;
  readonly path: string;
  readonly tagMessage: string;
  readonly tagPattern: string;
}

export type ParseConfigResult =
  | { readonly config: TagsmithConfig; readonly ok: true }
  | { readonly error: string; readonly ok: false };

export type ValidateConfigResult =
  | {
      readonly config: TagsmithConfig;
      readonly effectiveTargets: readonly EffectiveTargetConfig[];
      readonly ok: true;
      readonly warnings: readonly string[];
    }
  | { readonly error: string; readonly ok: false };

const channelSchema = z.strictObject({
  name: z.string(),
  strategy: z.enum(["prerelease", "stable"]),
  dependsOn: z.array(z.string()).optional(),
});

const targetSchema = z.strictObject({
  path: z.string(),
  channels: z.array(channelSchema).min(1),
  tagPattern: z.string().optional(),
  tagMessage: z.string().optional(),
  initialVersion: z.string().optional(),
});

const configSchema = z.strictObject({
  $schema: z.string().optional(),
  configVersion: z.literal(1),
  git: z.strictObject({
    remote: z.string(),
    baseBranch: z.string(),
  }),
  defaults: z.strictObject({
    tagPattern: z.string(),
    tagMessage: z.string(),
    initialVersion: z.string(),
  }),
  targets: z.record(z.string(), targetSchema),
});

export function parseConfigText(text: string, filePath: string): ParseConfigResult {
  const duplicate = findDuplicateKey(text);
  if (duplicate !== undefined) {
    return { error: `${filePath}: duplicate key ${duplicate.key} at ${duplicate.path}`, ok: false };
  }

  const errors: ParseError[] = [];
  const value: unknown = parse(text, errors, { allowTrailingComma: true, disallowComments: false });

  if (errors.length > 0) {
    const error = errors[0];
    return {
      error: `${filePath}: malformed JSONC (${error === undefined ? "Unknown" : printParseErrorCode(error.error)})`,
      ok: false,
    };
  }

  const schemaResult = configSchema.safeParse(value);
  if (!schemaResult.success) {
    return { error: formatZodError(filePath, schemaResult.error), ok: false };
  }

  if (!isTagsmithConfig(value)) {
    return { error: `${filePath}: invalid config`, ok: false };
  }

  return { config: value, ok: true };
}

function isTagsmithConfig(value: unknown): value is TagsmithConfig {
  return configSchema.safeParse(value).success;
}

export function validateConfig(config: TagsmithConfig, filePath: string): ValidateConfigResult {
  const checks: string[] = [];
  const warnings: string[] = [];
  const effectiveTargets: EffectiveTargetConfig[] = [];

  validateGit(config, checks);
  validateInitialVersion(config.defaults.initialVersion, "defaults.initialVersion", checks);
  validateTagPattern(config.defaults.tagPattern, "defaults.tagPattern", checks, warnings);
  validateTagMessage(config.defaults.tagMessage, "defaults.tagMessage", checks);

  const targetNames = Object.keys(config.targets);
  if (targetNames.length === 0) {
    checks.push("targets must contain at least one target");
  }

  for (const targetName of targetNames) {
    if (!namePattern.test(targetName)) {
      checks.push(`targets.${targetName} must match ${namePattern.source}`);
    }

    const target = config.targets[targetName];
    if (target === undefined) {
      continue;
    }

    validateTarget(targetName, target, checks);

    const tagPattern = target.tagPattern ?? config.defaults.tagPattern;
    const tagMessage = target.tagMessage ?? config.defaults.tagMessage;
    const initialVersion = target.initialVersion ?? config.defaults.initialVersion;

    if (target.tagPattern !== undefined) {
      validateTagPattern(target.tagPattern, `targets.${targetName}.tagPattern`, checks, warnings);
    }
    if (target.tagMessage !== undefined) {
      validateTagMessage(target.tagMessage, `targets.${targetName}.tagMessage`, checks);
    }
    if (target.initialVersion !== undefined) {
      validateInitialVersion(target.initialVersion, `targets.${targetName}.initialVersion`, checks);
    }

    const renderedPattern = renderTagPattern(tagPattern, targetName, "1.2.3");
    if (!isSafeGitTagName(renderedPattern)) {
      checks.push(`targets.${targetName}.tagPattern renders an unsafe Git tag name`);
    }

    const renderedMessage = renderTagMessage(tagMessage, {
      tag: renderedPattern,
      target: targetName,
      version: "1.2.3",
    });
    if (renderedMessage.trim() === "") {
      checks.push(`targets.${targetName}.tagMessage must be non-empty after interpolation`);
    }

    effectiveTargets.push({
      channels: target.channels,
      initialVersion,
      name: targetName,
      path: target.path,
      tagMessage,
      tagPattern,
    });
  }

  validatePatternAmbiguity(effectiveTargets, checks);

  if (checks.length > 0) {
    return { error: `${filePath}: ${checks[0]}`, ok: false };
  }

  return { config, effectiveTargets, ok: true, warnings };
}

export function renderTagPattern(pattern: string, target: string, version: string): string {
  return pattern.replace("{target}", target).replace("{version}", version);
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

const namePattern = /^[a-z][a-z0-9-]*$/u;

function validateGit(config: TagsmithConfig, checks: string[]): void {
  if (!isValidGitRemoteName(config.git.remote)) {
    checks.push("git.remote must be a safe configured remote name without whitespace or slash");
  }

  if (
    !isValidGitBranchName(config.git.baseBranch) ||
    config.git.baseBranch.startsWith(`${config.git.remote}/`) ||
    config.git.baseBranch.startsWith("origin/")
  ) {
    checks.push("git.baseBranch must be an unqualified branch name");
  }
}

function isValidGitRemoteName(remoteName: string): boolean {
  return isValidGitName(remoteName, { allowSlash: false, rejectTrailingDot: false });
}

function isValidGitBranchName(branchName: string): boolean {
  return isValidGitName(branchName, { allowSlash: true, rejectTrailingDot: true });
}

function isValidGitName(
  value: string,
  options: { readonly allowSlash: boolean; readonly rejectTrailingDot: boolean },
): boolean {
  return (
    value.length > 0 &&
    !value.startsWith("-") &&
    !value.startsWith("/") &&
    !value.endsWith("/") &&
    !(options.rejectTrailingDot && value.endsWith(".")) &&
    (options.allowSlash || !value.includes("/")) &&
    !value.includes("//") &&
    !value.includes("..") &&
    !value.includes("@{") &&
    value !== "@" &&
    !value.split("/").some((part) => part.startsWith(".") || part.endsWith(".lock")) &&
    !/[\s\p{Cc}~^:?*[\\]/u.test(value)
  );
}

function validateTarget(targetName: string, target: TargetConfig, checks: string[]): void {
  const channelNames = new Set<string>();
  let stableCount = 0;

  for (const channel of target.channels) {
    const channelPath = `targets.${targetName}.channels.${channel.name}`;
    if (!namePattern.test(channel.name)) {
      checks.push(`${channelPath}.name must match ${namePattern.source}`);
    }
    if (channelNames.has(channel.name)) {
      checks.push(`targets.${targetName}.channels contains duplicate channel ${channel.name}`);
    }
    channelNames.add(channel.name);
    if (channel.strategy === "stable") {
      stableCount += 1;
    }
  }

  if (stableCount !== 1) {
    checks.push(`targets.${targetName}.channels must contain exactly one stable channel`);
  }

  for (const channel of target.channels) {
    for (const dependency of channel.dependsOn ?? []) {
      if (dependency === channel.name) {
        checks.push(
          `targets.${targetName}.channels.${channel.name}.dependsOn may not depend on self`,
        );
      }
      if (!channelNames.has(dependency)) {
        checks.push(
          `targets.${targetName}.channels.${channel.name}.dependsOn references missing channel ${dependency}`,
        );
      }
    }
  }

  if (hasCycle(target.channels)) {
    checks.push(`targets.${targetName}.channels dependency cycle is invalid`);
  }
}

function hasCycle(channels: readonly ChannelConfig[]): boolean {
  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visitChannel(name: string): boolean {
    if (visiting.has(name)) {
      return true;
    }
    if (visited.has(name)) {
      return false;
    }

    visiting.add(name);
    const channel = byName.get(name);
    for (const dependency of channel?.dependsOn ?? []) {
      if (byName.has(dependency) && visitChannel(dependency)) {
        return true;
      }
    }
    visiting.delete(name);
    visited.add(name);
    return false;
  }

  return channels.some((channel) => visitChannel(channel.name));
}

function validateInitialVersion(value: string, fieldPath: string, checks: string[]): void {
  const parsed = semver.parse(value, { loose: false });
  if (
    parsed === null ||
    parsed.version !== value ||
    parsed.build.length > 0 ||
    parsed.prerelease.length > 0
  ) {
    checks.push(`${fieldPath} must be canonical stable SemVer without build metadata or leading v`);
  }
}

function validateTagPattern(
  pattern: string,
  fieldPath: string,
  checks: string[],
  warnings: string[],
): void {
  const placeholders = Array.from(pattern.matchAll(/\{[^}]*\}/gu), (match) => match[0]);
  const versionCount = placeholders.filter((placeholder) => placeholder === "{version}").length;
  const targetCount = placeholders.filter((placeholder) => placeholder === "{target}").length;

  if (
    placeholders.some((placeholder) => placeholder !== "{version}" && placeholder !== "{target}")
  ) {
    checks.push(`${fieldPath} contains unsupported placeholder`);
  }
  if (versionCount !== 1) {
    checks.push(`${fieldPath} requires exactly one {version}`);
  }
  if (targetCount > 1) {
    checks.push(`${fieldPath} may contain {target} at most once`);
  }

  const literals = pattern.replaceAll("{version}", "").replaceAll("{target}", "");
  if (!/^[a-z0-9._@-]*$/u.test(literals)) {
    checks.push(`${fieldPath} tagPattern contains unsafe characters`);
  }

  const versionIndex = pattern.indexOf("{version}");
  if (versionIndex >= 0 && pattern !== "v{version}") {
    const before = pattern[versionIndex - 1];
    const after = pattern[versionIndex + "{version}".length];
    if (isTouchingCharacter(before) || isTouchingCharacter(after)) {
      warnings.push(`${fieldPath} {version} touches an alphanumeric or underscore character`);
    }
  }
}

function isTouchingCharacter(value: string | undefined): boolean {
  return value !== undefined && /[a-z0-9_}]/u.test(value);
}

function validateTagMessage(message: string, fieldPath: string, checks: string[]): void {
  const placeholders = Array.from(message.matchAll(/\{[^}]*\}/gu), (match) => match[0]);
  if (
    placeholders.some(
      (placeholder) =>
        placeholder !== "{target}" && placeholder !== "{version}" && placeholder !== "{tag}",
    )
  ) {
    checks.push(`${fieldPath} contains unsupported placeholder`);
  }

  if (/\p{Cc}/u.test(message)) {
    checks.push(`${fieldPath} must be printable single-line text`);
  }
}

function validatePatternAmbiguity(
  targets: readonly EffectiveTargetConfig[],
  checks: string[],
): void {
  if (targets.length <= 1) {
    return;
  }

  for (let leftIndex = 0; leftIndex < targets.length; leftIndex += 1) {
    const left = targets[leftIndex];
    if (left === undefined) {
      continue;
    }

    for (let rightIndex = leftIndex + 1; rightIndex < targets.length; rightIndex += 1) {
      const right = targets[rightIndex];
      if (right === undefined) {
        continue;
      }

      if (patternsOverlap(left, right)) {
        checks.push(
          `targets ${left.name} and ${right.name} have ambiguous effective tagPattern ${right.tagPattern}`,
        );
      }
    }
  }
}

function patternsOverlap(left: EffectiveTargetConfig, right: EffectiveTargetConfig): boolean {
  const leftPattern = compileRenderedPattern(left.tagPattern, left.name);
  const rightPattern = compileRenderedPattern(right.tagPattern, right.name);
  const leftSamples = sampleRenderedTags(leftPattern);
  const rightSamples = sampleRenderedTags(rightPattern);

  return (
    leftSamples.some((sample) => rightPattern.regex.test(sample)) ||
    rightSamples.some((sample) => leftPattern.regex.test(sample))
  );
}

function compileRenderedPattern(
  pattern: string,
  targetName: string,
): { readonly prefix: string; readonly regex: RegExp; readonly suffix: string } {
  const rendered = pattern.replace("{target}", targetName);
  const [prefix = "", suffix = ""] = rendered.split("{version}");

  return {
    prefix,
    regex: new RegExp(`^${escapeRegex(prefix)}${semverTagPattern}${escapeRegex(suffix)}$`, "u"),
    suffix,
  };
}

const semverTagPattern = String.raw`(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9A-Za-z-][0-9A-Za-z-]*))*)?`;

function sampleRenderedTags(pattern: {
  readonly prefix: string;
  readonly suffix: string;
}): string[] {
  return [
    `${pattern.prefix}1.2.3${pattern.suffix}`,
    `${pattern.prefix}1.2.3-rc.1${pattern.suffix}`,
  ];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isSafeGitTagName(tagName: string): boolean {
  return isValidGitName(tagName, { allowSlash: false, rejectTrailingDot: true });
}

function findDuplicateKey(
  text: string,
): { readonly key: string; readonly path: string } | undefined {
  const seenByPath = new Map<string, Set<string>>();
  let duplicate: { readonly key: string; readonly path: string } | undefined;

  visit(
    text,
    {
      onObjectProperty(property, _offset, _length, _startLine, _startCharacter, pathSupplier) {
        if (duplicate !== undefined) {
          return;
        }
        const path = renderJsonPath(pathSupplier());
        const seen = seenByPath.get(path) ?? new Set<string>();
        if (seen.has(property)) {
          duplicate = { key: property, path };
          return;
        }
        seen.add(property);
        seenByPath.set(path, seen);
      },
    },
    { allowTrailingComma: true, disallowComments: false },
  );

  return duplicate;
}

function renderJsonPath(path: readonly (number | string)[]): string {
  if (path.length === 0) {
    return "$";
  }

  return `$.${path.join(".")}`;
}

function formatZodError(filePath: string, error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue === undefined) {
    return `${filePath}: invalid config`;
  }

  const path = issue.path.length > 0 ? issue.path.join(".") : "$";
  if (issue.code === "unrecognized_keys") {
    const key = issue.keys[0];
    const keyPath = key === undefined ? path : path === "$" ? key : `${path}.${key}`;
    return `${filePath}: ${keyPath}: ${issue.message}`;
  }
  return `${filePath}: ${path}: ${issue.message}`;
}
