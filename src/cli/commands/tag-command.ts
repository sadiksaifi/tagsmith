import { z } from "zod";

import { loadConfigFile } from "@/adapters/fs/config-file";
import { validateTargetPaths } from "@/adapters/fs/target-paths";
import {
  createAnnotatedTag,
  getCurrentHead,
  isWorkingTreeClean,
  pushTag,
  readLocalTags,
  readRemoteTags,
} from "@/adapters/git/process-git";
import { resolveCommandContext } from "@/cli/command-context";
import type { CliOutput } from "@/cli/output/create-output";
import type { ProgressReporter } from "@/cli/output/progress";
import type { ChannelConfig, EffectiveTargetConfig } from "@/core/config/config";
import {
  resolveDryRunRelease,
  type ReleaseBump,
  type ReleasePlan,
  type ReleaseRequest,
} from "@/core/release/release";
import {
  executeReleaseTag,
  type ExecutedTagResult,
  type ReleaseTagExecutionResult,
} from "@/core/release/tag-execution";

const bumpSchema = z.enum(["major", "minor", "patch", "prerelease"]);

const tagInputSchema = z
  .object({
    bump: z.string().optional(),
    channel: z.string().optional(),
    configPath: z.string().optional(),
    cwd: z.string(),
    dryRun: z.boolean(),
    json: z.boolean(),
    push: z.boolean(),
    target: z.string().optional(),
    version: z.string().optional(),
  })
  .strict();

export interface TagCommandInput {
  readonly channel: string | undefined;
  readonly configPath: string | undefined;
  readonly cwd: string;
  readonly dryRun: boolean;
  readonly json: boolean;
  readonly push: boolean;
  readonly request: ReleaseRequest | undefined;
  readonly target: string | undefined;
}

export type ResolvedTagCommandInput = TagCommandInput & {
  readonly channel: string;
  readonly request: ReleaseRequest;
  readonly target: string;
};

export interface PreparedTagWorkflow {
  readonly configRemote: string;
  readonly effectiveTargets: readonly EffectiveTargetConfig[];
  readonly ok: true;
  readonly repoRoot: string;
  readonly warnings: readonly string[];
}

export type PrepareTagWorkflowResult =
  | PreparedTagWorkflow
  | { readonly error: string; readonly ok: false };

export interface TagCommandOptions {
  readonly configPath: string | undefined;
  readonly cwd: string;
  readonly flags: Readonly<Record<string, boolean | string>>;
  readonly output: CliOutput;
  readonly progress: ProgressReporter;
}

export type BuildTagCommandInputResult =
  | { readonly input: TagCommandInput; readonly ok: true }
  | { readonly error: string; readonly ok: false };

export function buildTagCommandInput(
  options: Pick<TagCommandOptions, "configPath" | "cwd" | "flags">,
): BuildTagCommandInputResult {
  const input = tagInputSchema.safeParse({
    bump: stringFlag(options.flags["--bump"]),
    channel: stringFlag(options.flags["--channel"]),
    configPath: options.configPath,
    cwd: options.cwd,
    dryRun: options.flags["--dry-run"] === true,
    json: options.flags["--json"] === true,
    push: options.flags["--push"] === true,
    target: stringFlag(options.flags["--target"]),
    version: stringFlag(options.flags["--version"]),
  });

  if (!input.success) {
    return {
      error: input.error.issues[0]?.message ?? "invalid tag command input",
      ok: false,
    };
  }

  const request = parseOptionalReleaseRequest(input.data.bump, input.data.version);
  if (!request.ok) {
    return request;
  }

  return {
    input: {
      channel: input.data.channel,
      configPath: input.data.configPath,
      cwd: input.data.cwd,
      dryRun: input.data.dryRun,
      json: input.data.json,
      push: input.data.push,
      request: request.request,
      target: input.data.target,
    },
    ok: true,
  };
}

export async function runTagCommand(options: TagCommandOptions): Promise<number> {
  const built = buildTagCommandInput(options);
  if (!built.ok) {
    options.output.error(built.error);
    return 1;
  }

  if (built.input.request === undefined) {
    options.output.error("tag requires exactly one of --bump or --version");
    return 1;
  }
  if (built.input.channel === undefined) {
    options.output.error("tag requires --channel");
    return 1;
  }

  const prepared = await prepareTagWorkflow(built.input, {
    progress: options.progress,
    requireTargetSelection: true,
  });
  if (!prepared.ok) {
    options.output.error(prepared.error);
    return 1;
  }

  const target = selectTarget(prepared.effectiveTargets, built.input.target);
  if (!target.ok) {
    options.output.error(target.error);
    return 1;
  }

  for (const warning of prepared.warnings) {
    options.output.warn(warning);
  }

  const resolvedInput: ResolvedTagCommandInput = {
    ...built.input,
    channel: built.input.channel,
    request: built.input.request,
    target: target.target.name,
  };
  const resolved = await resolvePreparedTagRelease(
    resolvedInput,
    prepared,
    target.target,
    options.progress,
  );
  if (!resolved.ok) {
    options.output.error(resolved.error);
    return 1;
  }

  if (built.input.dryRun) {
    if (built.input.json) {
      writeTagJson(options.output, resolved);
      return 0;
    }

    options.output.human(renderHumanDryRun(resolved));
    return 0;
  }

  const executed = await executePreparedTagRelease(
    resolved,
    prepared,
    built.input.push,
    options.progress,
  );
  if (!executed.ok) {
    options.output.error(executed.error);
    return 1;
  }

  const result = executed.result;
  if (built.input.json) {
    writeTagJson(options.output, result);
    return 0;
  }
  options.output.human(renderHumanCreated(result));
  return 0;
}

export async function prepareTagWorkflow(
  input: TagCommandInput,
  options: { readonly progress: ProgressReporter; readonly requireTargetSelection?: boolean },
): Promise<PrepareTagWorkflowResult> {
  const context = await options.progress.phase("Resolving Git repository", async (phase) => {
    const result = await resolveCommandContext({
      configPath: input.configPath,
      cwd: input.cwd,
      signal: phase.signal,
    });
    if (!result.ok) {
      phase.fail();
    }
    return result;
  });
  if (!context.ok) {
    return { error: context.error, ok: false };
  }

  const loaded = await options.progress.phase("Loading config", async (phase) => {
    const result = await loadConfigFile(context.configPath, { signal: phase.signal });
    if (!result.ok) {
      phase.fail();
    }
    return result;
  });
  if (!loaded.ok) {
    return { error: loaded.error, ok: false };
  }

  if (input.target !== undefined || options.requireTargetSelection === true) {
    const target = selectTarget(loaded.effectiveTargets, input.target);
    if (!target.ok) {
      return target;
    }
  }

  const paths = await options.progress.phase("Validating target paths", async (phase) => {
    const result = await validateTargetPaths(context.repoRoot, loaded.effectiveTargets, {
      signal: phase.signal,
    });
    if (!result.ok) {
      phase.fail();
    }
    return result;
  });
  if (!paths.ok) {
    return { error: paths.error, ok: false };
  }

  return {
    configRemote: loaded.config.git.remote,
    effectiveTargets: loaded.effectiveTargets,
    ok: true,
    repoRoot: context.repoRoot,
    warnings: loaded.warnings,
  };
}

export async function executePreparedTagRelease(
  plan: ReleasePlan,
  prepared: PreparedTagWorkflow,
  push: boolean,
  progress: ProgressReporter,
): Promise<ReleaseTagExecutionResult> {
  return executeReleaseTag(plan, {
    createAnnotatedTag: (tag) =>
      progress.phase(`Creating tag ${tag.tag}`, async (phase) => {
        const result = await createAnnotatedTag(
          prepared.repoRoot,
          tag.tag,
          tag.commit,
          tag.message,
          { signal: phase.signal },
        );
        if (!result.ok) {
          phase.fail();
        }
        return result;
      }),
    push,
    pushTag: (tag) =>
      progress.phase(`Pushing tag ${tag.tag}`, async (phase) => {
        const result = await pushTag(prepared.repoRoot, prepared.configRemote, tag.tag, {
          signal: phase.signal,
        });
        if (!result.ok) {
          phase.fail();
        }
        return result;
      }),
    readRemoteTags: () =>
      progress.phase("Verifying pushed tag", async (phase) => {
        const result = await readRemoteTags(prepared.repoRoot, prepared.configRemote, {
          signal: phase.signal,
        });
        if (!result.ok) {
          phase.fail();
        }
        return result;
      }),
  });
}

export async function resolvePreparedTagRelease(
  input: ResolvedTagCommandInput,
  prepared: PreparedTagWorkflow,
  target: EffectiveTargetConfig,
  progress: ProgressReporter,
): Promise<ResolvedRelease | { readonly error: string; readonly ok: false }> {
  const clean = await progress.phase("Checking working tree", async (phase) => {
    const result = await isWorkingTreeClean(prepared.repoRoot, { signal: phase.signal });
    if (!result.ok) {
      phase.fail();
    }
    return result;
  });
  if (!clean.ok) {
    return { error: clean.error, ok: false };
  }

  const localTags = await progress.phase("Reading local tags", async (phase) => {
    const result = await readLocalTags(prepared.repoRoot, { signal: phase.signal });
    if (!result.ok) {
      phase.fail();
    }
    return result;
  });
  if (!localTags.ok) {
    return { error: localTags.error, ok: false };
  }

  const remoteTags = await progress.phase(
    `Reading tags from ${prepared.configRemote}`,
    async (phase) => {
      const result = await readRemoteTags(prepared.repoRoot, prepared.configRemote, {
        signal: phase.signal,
      });
      if (!result.ok) {
        phase.fail();
      }
      return result;
    },
  );
  if (!remoteTags.ok) {
    return { error: remoteTags.error, ok: false };
  }

  const head = await progress.phase("Reading current HEAD", async (phase) => {
    const result = await getCurrentHead(prepared.repoRoot, { signal: phase.signal });
    if (!result.ok) {
      phase.fail();
    }
    return result;
  });
  if (!head.ok) {
    return { error: head.error, ok: false };
  }

  return resolveDryRunRelease({
    channelName: input.channel,
    currentHead: head.commit,
    localTags: localTags.tags,
    push: input.push,
    remoteTags: remoteTags.tags,
    request: input.request,
    target,
  });
}

function parseOptionalReleaseRequest(
  bump: string | undefined,
  version: string | undefined,
):
  | { readonly ok: true; readonly request: ReleaseRequest | undefined }
  | { readonly error: string; readonly ok: false } {
  if (bump === undefined && version === undefined) {
    return { ok: true, request: undefined };
  }
  if (bump !== undefined && version !== undefined) {
    return { error: "tag requires exactly one of --bump or --version", ok: false };
  }
  if (bump !== undefined) {
    const parsed = bumpSchema.safeParse(bump);
    if (!parsed.success) {
      return {
        error: `invalid --bump ${bump}; expected major, minor, patch, or prerelease`,
        ok: false,
      };
    }
    return { ok: true, request: { bump: parsed.data as ReleaseBump, type: "bump" } };
  }
  return { ok: true, request: { type: "version", version: version ?? "" } };
}

export function selectTarget(
  targets: readonly EffectiveTargetConfig[],
  requested: string | undefined,
):
  | { readonly ok: true; readonly target: EffectiveTargetConfig }
  | { readonly error: string; readonly ok: false } {
  if (requested !== undefined) {
    const target = targets.find((candidate) => candidate.name === requested);
    return target === undefined
      ? { error: `unknown target ${requested}`, ok: false }
      : { ok: true, target };
  }
  if (targets.length === 1 && targets[0] !== undefined) {
    return { ok: true, target: targets[0] };
  }
  return { error: "tag requires --target when config has multiple targets", ok: false };
}

export function selectChannel(
  target: EffectiveTargetConfig,
  requested: string | undefined,
):
  | { readonly channel: ChannelConfig; readonly ok: true }
  | { readonly error: string; readonly ok: false } {
  if (requested !== undefined) {
    const channel = target.channels.find((candidate) => candidate.name === requested);
    return channel === undefined
      ? { error: `unknown channel ${requested} for target ${target.name}`, ok: false }
      : { channel, ok: true };
  }
  if (target.channels.length === 1 && target.channels[0] !== undefined) {
    return { channel: target.channels[0], ok: true };
  }
  return { error: "tag requires --channel", ok: false };
}

type ResolvedRelease = Exclude<ReturnType<typeof resolveDryRunRelease>, { readonly ok: false }>;

export type TagResult =
  | (ReleasePlan & {
      readonly created: false;
      readonly dryRun: true;
      readonly pushed: false;
    })
  | ExecutedTagResult;

export function writeTagJson(output: CliOutput, result: TagResult): void {
  output.writeJson({
    target: result.target,
    channel: result.channel,
    strategy: result.strategy,
    version: result.version,
    baseVersion: result.baseVersion,
    tag: result.tag,
    tagMessage: result.tagMessage,
    commit: result.commit,
    created: result.created,
    pushed: result.pushed,
    dryRun: result.dryRun,
  });
}

function renderHumanDryRun(result: ResolvedRelease): string {
  return [
    `Resolved ${result.tag} (${result.version}) for target ${result.target} channel ${result.channel}.`,
    `Commit: ${result.commit}`,
    "Dry run: No tag was created.",
    result.wouldPush
      ? "Because --push was provided, Tagsmith would have pushed the tag."
      : "No push would have happened.",
  ].join("\n");
}

export function renderHumanCreated(result: TagResult): string {
  return [
    `Tagged ${result.tag} (${result.version}) for target ${result.target} channel ${result.channel}.`,
    `Commit: ${result.commit.slice(0, 12)}`,
    `Created: ${result.created ? "yes" : "no"}`,
    `Pushed: ${result.pushed ? "yes" : "no"}`,
  ].join("\n");
}

export function renderTagPlanFacts(result: ReleasePlan, request: ReleaseRequest): string {
  const versionIntent =
    request.type === "bump" ? `bump ${request.bump}` : `explicit version ${request.version}`;

  return [
    `Target: ${result.target}`,
    `Channel: ${result.channel}`,
    `Strategy: ${result.strategy}`,
    `Version intent: ${versionIntent}`,
    `Version: ${result.version}`,
    `Tag: ${result.tag}`,
    `Tag message: ${result.tagMessage}`,
    `Commit: ${result.commit}`,
  ].join("\n");
}

function stringFlag(value: boolean | string | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
