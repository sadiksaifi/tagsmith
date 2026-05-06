import { z } from "zod";

import { loadConfigFile } from "@/adapters/fs/config-file";
import { validateTargetPaths } from "@/adapters/fs/target-paths";
import {
  getRemoteBranchTip,
  isCommitReachableFrom,
  readLocalTags,
  readRemoteTags,
} from "@/adapters/git/process-git";
import { resolveCommandContext } from "@/cli/command-context";
import type { CliOutput, GitHubOutputValue } from "@/cli/output/create-output";
import { writeGitHubOutputFile } from "@/cli/output/create-output";
import { validateExistingRelease, type ValidatedReleaseResult } from "@/core/release/release";

const validateInputSchema = z
  .object({
    channel: z.string().optional(),
    configPath: z.string().optional(),
    cwd: z.string(),
    githubOutput: z.boolean(),
    json: z.boolean(),
    tag: z.string().optional(),
    target: z.string().optional(),
  })
  .strict();

export interface ValidateCommandOptions {
  readonly configPath: string | undefined;
  readonly cwd: string;
  readonly flags: Readonly<Record<string, boolean | string>>;
  readonly output: CliOutput;
}

export async function runValidateCommand(options: ValidateCommandOptions): Promise<number> {
  const input = validateInputSchema.safeParse({
    channel: stringFlag(options.flags["--channel"]),
    configPath: options.configPath,
    cwd: options.cwd,
    githubOutput: options.flags["--github-output"] === true,
    json: options.flags["--json"] === true,
    tag: stringFlag(options.flags["--tag"]),
    target: stringFlag(options.flags["--target"]),
  });

  if (!input.success) {
    options.output.error(input.error.issues[0]?.message ?? "invalid validate command input");
    return 1;
  }

  if (input.data.tag === undefined) {
    options.output.error("validate requires --tag");
    return 1;
  }

  const githubOutputPath = process.env.GITHUB_OUTPUT;
  if (
    input.data.githubOutput &&
    (githubOutputPath === undefined || githubOutputPath.length === 0)
  ) {
    options.output.error("validate --github-output requires GITHUB_OUTPUT");
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

  const paths = await validateTargetPaths(context.repoRoot, loaded.effectiveTargets);
  if (!paths.ok) {
    options.output.error(paths.error);
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

  const validated = validateExistingRelease({
    baseBranch: loaded.config.git.baseBranch,
    channelName: input.data.channel,
    localTags: localTags.tags,
    remote: loaded.config.git.remote,
    remoteTags: remoteTags.tags,
    tagName: input.data.tag,
    targetName: input.data.target,
    targets: loaded.effectiveTargets,
  });
  if (!validated.ok) {
    options.output.error(validated.error);
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

  const reachable = await isCommitReachableFrom(
    context.repoRoot,
    validated.result.commit,
    remoteTip.commit,
    loaded.config.git.remote,
    loaded.config.git.baseBranch,
  );
  if (!reachable.ok) {
    options.output.error(reachable.error);
    return 1;
  }

  if (input.data.json) {
    writeValidateJson(options.output, validated.result);
    return 0;
  }

  if (input.data.githubOutput) {
    writeGitHubOutputFile(githubOutputPath ?? "", validateGithubOutput(validated.result));
    return 0;
  }

  options.output.human(renderHumanValidated(validated.result));
  return 0;
}

function writeValidateJson(output: CliOutput, result: ValidatedReleaseResult): void {
  output.writeJson(validateJson(result));
}

function validateJson(result: ValidatedReleaseResult): Record<string, GitHubOutputValue> {
  return {
    target: result.target,
    channel: result.channel,
    strategy: result.strategy,
    version: result.version,
    baseVersion: result.baseVersion,
    tag: result.tag,
    tagMessage: result.tagMessage,
    commit: result.commit,
    remote: result.remote,
    baseBranch: result.baseBranch,
    valid: result.valid,
  };
}

function validateGithubOutput(
  result: ValidatedReleaseResult,
): Readonly<Record<string, GitHubOutputValue>> {
  return validateJson(result);
}

function renderHumanValidated(result: ValidatedReleaseResult): string {
  return [
    `Validated ${result.tag} (${result.version}) for target ${result.target} channel ${result.channel}.`,
    `Commit: ${result.commit.slice(0, 12)}`,
    `Remote: ${result.remote}`,
    `Base branch: ${result.baseBranch}`,
    "Valid: true",
  ].join("\n");
}

function stringFlag(value: boolean | string | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
