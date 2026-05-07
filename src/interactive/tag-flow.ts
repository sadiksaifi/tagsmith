import {
  buildTagCommandInput,
  prepareTagWorkflow,
  renderTagPlanFacts,
  resolvePreparedTagRelease,
  selectChannel,
  selectTarget,
  type ResolvedTagCommandInput,
  type TagCommandInput,
} from "@/cli/commands/tag-command";
import { renderEquivalentCommand } from "@/cli/equivalent-command";
import type { CliOutput } from "@/cli/output/create-output";
import type { ChannelConfig, EffectiveTargetConfig } from "@/core/config/config";
import type { ReleaseBump, ReleaseRequest } from "@/core/release/release";
import type { PromptAdapter } from "@/interactive/prompt-adapter";

export interface InteractiveTagOptions {
  readonly configPath: string | undefined;
  readonly cwd: string;
  readonly flags: Readonly<Record<string, boolean | string>>;
  readonly output: CliOutput;
  readonly promptAdapter: PromptAdapter;
}

export async function runInteractiveTag(options: InteractiveTagOptions): Promise<number> {
  const built = buildTagCommandInput(options);
  if (!built.ok) {
    options.output.error(built.error);
    return 1;
  }

  const prepared = await prepareTagWorkflow(built.input);
  if (!prepared.ok) {
    options.output.error(prepared.error);
    return 1;
  }

  await options.promptAdapter.renderTagWarnings({ warnings: prepared.warnings });

  const target = await resolveInteractiveTarget(
    built.input.target,
    prepared.effectiveTargets,
    options.promptAdapter,
  );
  if (!target.ok) {
    if (target.cancelled) {
      await options.promptAdapter.cancel("tagsmith cancelled.");
    } else {
      options.output.error(target.error);
    }
    return 1;
  }

  const channel = await resolveInteractiveChannel(
    built.input.channel,
    target.target,
    options.promptAdapter,
  );
  if (!channel.ok) {
    if (channel.cancelled) {
      await options.promptAdapter.cancel("tagsmith cancelled.");
    } else {
      options.output.error(channel.error);
    }
    return 1;
  }

  const request = await resolveInteractiveReleaseRequest(
    built.input.request,
    channel.channel,
    options.promptAdapter,
  );
  if (!request.ok) {
    await options.promptAdapter.cancel("tagsmith cancelled.");
    return 1;
  }

  const resolvedInput: ResolvedTagCommandInput = {
    ...built.input,
    channel: channel.channel.name,
    request: request.request,
    target: target.target.name,
  };
  const resolved = await resolvePreparedTagRelease(resolvedInput, prepared, target.target);
  if (!resolved.ok) {
    options.output.error(resolved.error);
    return 1;
  }

  const equivalentCommand = renderEquivalentCommand({
    command: "tag",
    configPath: built.input.configPath,
    flags: {
      bump: request.request.type === "bump" ? request.request.bump : undefined,
      channel: resolved.channel,
      dryRun: built.input.dryRun,
      push: built.input.push,
      target: resolved.target,
      version: request.request.type === "version" ? request.request.version : undefined,
    },
  });
  const facts = renderTagPlanFacts(resolved, request.request);

  if (built.input.dryRun) {
    await options.promptAdapter.renderTagDryRun({ equivalentCommand, facts });
    return 0;
  }

  const decision = await options.promptAdapter.renderTagReview({ equivalentCommand, facts });
  if (decision === "cancel") {
    await options.promptAdapter.cancel("tagsmith cancelled.");
    return 1;
  }

  await options.promptAdapter.cancel("tagsmith cancelled.");
  return 1;
}

type TargetResult =
  | { readonly ok: true; readonly target: EffectiveTargetConfig }
  | { readonly cancelled: true; readonly ok: false }
  | { readonly cancelled?: false; readonly error: string; readonly ok: false };

async function resolveInteractiveTarget(
  requested: string | undefined,
  targets: readonly EffectiveTargetConfig[],
  promptAdapter: PromptAdapter,
): Promise<TargetResult> {
  const selected = selectTarget(targets, requested);
  if (selected.ok) {
    return selected;
  }
  if (requested !== undefined || targets.length <= 1) {
    return selected;
  }

  const prompted = await promptAdapter.selectTagTarget({
    targets: targets.map((target) => ({ name: target.name })),
  });
  if (prompted.type === "cancel") {
    return { cancelled: true, ok: false };
  }

  return selectTarget(targets, prompted.value);
}

type ChannelResult =
  | { readonly channel: ChannelConfig; readonly ok: true }
  | { readonly cancelled: true; readonly ok: false }
  | { readonly cancelled?: false; readonly error: string; readonly ok: false };

async function resolveInteractiveChannel(
  requested: string | undefined,
  target: EffectiveTargetConfig,
  promptAdapter: PromptAdapter,
): Promise<ChannelResult> {
  const selected = selectChannel(target, requested);
  if (selected.ok) {
    return selected;
  }
  if (requested !== undefined || target.channels.length <= 1) {
    return selected;
  }

  const prompted = await promptAdapter.selectTagChannel({
    channels: target.channels.map((channel) => ({
      name: channel.name,
      strategy: channel.strategy,
    })),
  });
  if (prompted.type === "cancel") {
    return { cancelled: true, ok: false };
  }

  return selectChannel(target, prompted.value);
}

type RequestResult =
  | { readonly ok: true; readonly request: ReleaseRequest }
  | { readonly ok: false };

async function resolveInteractiveReleaseRequest(
  requested: TagCommandInput["request"],
  channel: ChannelConfig,
  promptAdapter: PromptAdapter,
): Promise<RequestResult> {
  if (requested !== undefined) {
    return { ok: true, request: requested };
  }

  const intent = await promptAdapter.selectTagVersionIntent();
  if (intent.type === "cancel") {
    return { ok: false };
  }

  if (intent.value === "version") {
    const version = await promptAdapter.promptTagVersion();
    return version.type === "cancel"
      ? { ok: false }
      : { ok: true, request: { type: "version", version: version.value } };
  }

  const bump = await promptAdapter.selectTagBump({ bumps: bumpChoices(channel.strategy) });
  return bump.type === "cancel"
    ? { ok: false }
    : { ok: true, request: { bump: bump.value as ReleaseBump, type: "bump" } };
}

function bumpChoices(
  strategy: "prerelease" | "stable",
): readonly ["major", "minor", "patch"] | readonly ["major", "minor", "patch", "prerelease"] {
  return strategy === "stable"
    ? ["major", "minor", "patch"]
    : ["major", "minor", "patch", "prerelease"];
}
