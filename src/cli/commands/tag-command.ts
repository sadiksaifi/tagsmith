import { z } from "zod";

import { loadConfigFile } from "@/adapters/fs/config-file";
import { validateTargetPaths } from "@/adapters/fs/target-paths";
import {
  createAnnotatedTag,
  getCurrentHead,
  getRemoteBranchTip,
  isWorkingTreeClean,
  pushTag,
  readLocalTags,
  readRemoteTags,
} from "@/adapters/git/process-git";
import { resolveCommandContext } from "@/cli/command-context";
import type { CliOutput } from "@/cli/output/create-output";
import type { EffectiveTargetConfig } from "@/core/config/config";
import {
  resolveDryRunRelease,
  type ReleaseBump,
  type ReleasePlan,
  type ReleaseRequest,
} from "@/core/release/release";
import { executeReleaseTag, type ExecutedTagResult } from "@/core/release/tag-execution";

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

export interface TagCommandOptions {
  readonly configPath: string | undefined;
  readonly cwd: string;
  readonly flags: Readonly<Record<string, boolean | string>>;
  readonly output: CliOutput;
}

export async function runTagCommand(options: TagCommandOptions): Promise<number> {
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
    options.output.error(input.error.issues[0]?.message ?? "invalid tag command input");
    return 1;
  }

  const request = parseReleaseRequest(input.data.bump, input.data.version);
  if (!request.ok) {
    options.output.error(request.error);
    return 1;
  }
  if (input.data.channel === undefined) {
    options.output.error("tag requires --channel");
    return 1;
  }

  const context = await resolveCommandContext({
    configPath: input.data.configPath,
    cwd: input.data.cwd,
  });
  if (!context.ok) {
    options.output.error(context.error);
    return 1;
  }

  const loaded = await loadConfigFile(context.configPath);
  if (!loaded.ok) {
    options.output.error(loaded.error);
    return 1;
  }

  const target = selectTarget(loaded.effectiveTargets, input.data.target);
  if (!target.ok) {
    options.output.error(target.error);
    return 1;
  }

  const paths = await validateTargetPaths(context.repoRoot, loaded.effectiveTargets);
  if (!paths.ok) {
    options.output.error(paths.error);
    return 1;
  }

  for (const warning of loaded.warnings) {
    options.output.warn(warning);
  }

  const clean = await isWorkingTreeClean(context.repoRoot);
  if (!clean.ok) {
    options.output.error(clean.error);
    return 1;
  }

  const localTags = await readLocalTags(context.repoRoot);
  if (!localTags.ok) {
    options.output.error(localTags.error);
    return 1;
  }

  const remoteTags = await readRemoteTags(context.repoRoot, loaded.config.git.remote);
  if (!remoteTags.ok) {
    options.output.error(remoteTags.error);
    return 1;
  }

  const remoteTip = await getRemoteBranchTip(
    context.repoRoot,
    loaded.config.git.remote,
    loaded.config.git.baseBranch,
  );
  if (!remoteTip.ok) {
    options.output.error(remoteTip.error);
    return 1;
  }

  const head = await getCurrentHead(context.repoRoot);
  if (!head.ok) {
    options.output.error(head.error);
    return 1;
  }
  if (head.commit !== remoteTip.commit) {
    options.output.error(
      `HEAD must equal ${loaded.config.git.remote}/${loaded.config.git.baseBranch} (${remoteTip.commit}) before tagging`,
    );
    return 1;
  }

  const resolved = resolveDryRunRelease({
    channelName: input.data.channel,
    currentHead: head.commit,
    localTags: localTags.tags,
    push: input.data.push,
    remoteTags: remoteTags.tags,
    request: request.request,
    target: target.target,
  });
  if (!resolved.ok) {
    options.output.error(resolved.error);
    return 1;
  }

  if (input.data.dryRun) {
    if (input.data.json) {
      writeTagJson(options.output, resolved);
      return 0;
    }

    options.output.human(renderHumanDryRun(resolved));
    return 0;
  }

  const executed = await executeReleaseTag(resolved, {
    createAnnotatedTag: (tag) =>
      createAnnotatedTag(context.repoRoot, tag.tag, tag.commit, tag.message),
    push: input.data.push,
    pushTag: (tag) => pushTag(context.repoRoot, loaded.config.git.remote, tag.tag),
    readRemoteTags: () => readRemoteTags(context.repoRoot, loaded.config.git.remote),
  });
  if (!executed.ok) {
    options.output.error(executed.error);
    return 1;
  }

  const result = executed.result;
  if (input.data.json) {
    writeTagJson(options.output, result);
    return 0;
  }
  options.output.human(renderHumanCreated(result));
  return 0;
}

function parseReleaseRequest(
  bump: string | undefined,
  version: string | undefined,
):
  | { readonly ok: true; readonly request: ReleaseRequest }
  | { readonly error: string; readonly ok: false } {
  if (
    (bump === undefined && version === undefined) ||
    (bump !== undefined && version !== undefined)
  ) {
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

function selectTarget(
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

type ResolvedRelease = Exclude<ReturnType<typeof resolveDryRunRelease>, { readonly ok: false }>;

type TagResult =
  | (ReleasePlan & {
      readonly created: false;
      readonly dryRun: true;
      readonly pushed: false;
    })
  | ExecutedTagResult;

function writeTagJson(output: CliOutput, result: TagResult): void {
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

function renderHumanCreated(result: TagResult): string {
  return [
    `Tagged ${result.tag} (${result.version}) for target ${result.target} channel ${result.channel}.`,
    `Commit: ${result.commit.slice(0, 12)}`,
    `Created: ${result.created ? "yes" : "no"}`,
    `Pushed: ${result.pushed ? "yes" : "no"}`,
  ].join("\n");
}

function stringFlag(value: boolean | string | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
