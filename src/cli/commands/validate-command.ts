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
import type { EffectiveTargetConfig } from "@/core/config/config";
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

export interface ValidateCommandInput {
  readonly channel: string | undefined;
  readonly configPath: string | undefined;
  readonly cwd: string;
  readonly githubOutput: boolean;
  readonly json: boolean;
  readonly tag: string | undefined;
  readonly target: string | undefined;
}

export type ResolvedValidateCommandInput = ValidateCommandInput & { readonly tag: string };

export interface ValidateCommandOptions {
  readonly configPath: string | undefined;
  readonly cwd: string;
  readonly flags: Readonly<Record<string, boolean | string>>;
  readonly output: CliOutput;
}

export type BuildValidateCommandInputResult =
  | { readonly input: ValidateCommandInput; readonly ok: true }
  | { readonly error: string; readonly ok: false };

export function buildValidateCommandInput(
  options: Pick<ValidateCommandOptions, "configPath" | "cwd" | "flags">,
): BuildValidateCommandInputResult {
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
    return {
      error: input.error.issues[0]?.message ?? "invalid validate command input",
      ok: false,
    };
  }

  return {
    input: {
      channel: input.data.channel,
      configPath: input.data.configPath,
      cwd: input.data.cwd,
      githubOutput: input.data.githubOutput,
      json: input.data.json,
      tag: input.data.tag,
      target: input.data.target,
    },
    ok: true,
  };
}

export async function runValidateCommand(options: ValidateCommandOptions): Promise<number> {
  const input = buildValidateCommandInput(options);
  if (!input.ok) {
    options.output.error(input.error);
    return 1;
  }

  if (input.input.tag === undefined) {
    options.output.error("validate requires --tag");
    return 1;
  }

  const githubOutputPath = process.env.GITHUB_OUTPUT;
  if (
    input.input.githubOutput &&
    (githubOutputPath === undefined || githubOutputPath.length === 0)
  ) {
    options.output.error("validate --github-output requires GITHUB_OUTPUT");
    return 1;
  }

  const prepared = await prepareValidateWorkflow(input.input);
  if (!prepared.ok) {
    options.output.error(prepared.error);
    return 1;
  }

  for (const warning of prepared.warnings) {
    options.output.warn(warning);
  }

  const validated = await validatePreparedRelease(
    { ...input.input, tag: input.input.tag },
    prepared,
  );
  if (!validated.ok) {
    options.output.error(validated.error);
    return 1;
  }

  if (input.input.json) {
    writeValidateJson(options.output, validated.result);
    return 0;
  }

  if (input.input.githubOutput) {
    try {
      writeGitHubOutputFile(githubOutputPath ?? "", validateGithubOutput(validated.result));
    } catch (error) {
      options.output.error(
        error instanceof Error
          ? `failed to write GitHub output: ${error.message}`
          : "failed to write GitHub output",
      );
      return 1;
    }
    return 0;
  }

  options.output.human(renderHumanValidated(validated.result));
  return 0;
}

export type PreparedValidateWorkflow =
  | {
      readonly baseBranch: string;
      readonly configRemote: string;
      readonly effectiveTargets: readonly EffectiveTargetConfig[];
      readonly ok: true;
      readonly repoRoot: string;
      readonly warnings: readonly string[];
    }
  | { readonly error: string; readonly ok: false };

export async function prepareValidateWorkflow(
  input: ValidateCommandInput,
): Promise<PreparedValidateWorkflow> {
  const context = await resolveCommandContext({
    configPath: input.configPath,
    cwd: input.cwd,
  });
  if (!context.ok) {
    return { error: context.error, ok: false };
  }

  const loaded = await loadConfigFile(context.configPath);
  if (!loaded.ok) {
    return { error: loaded.error, ok: false };
  }

  const paths = await validateTargetPaths(context.repoRoot, loaded.effectiveTargets);
  if (!paths.ok) {
    return { error: paths.error, ok: false };
  }

  return {
    baseBranch: loaded.config.git.baseBranch,
    configRemote: loaded.config.git.remote,
    effectiveTargets: loaded.effectiveTargets,
    ok: true,
    repoRoot: context.repoRoot,
    warnings: loaded.warnings,
  };
}

export async function validatePreparedRelease(
  input: ResolvedValidateCommandInput,
  prepared: Extract<PreparedValidateWorkflow, { readonly ok: true }>,
): Promise<
  | { readonly ok: true; readonly result: ValidatedReleaseResult }
  | { readonly error: string; readonly ok: false }
> {
  const localTags = await readLocalTags(prepared.repoRoot);
  if (!localTags.ok) {
    return { error: localTags.error, ok: false };
  }

  const remoteTags = await readRemoteTags(prepared.repoRoot, prepared.configRemote);
  if (!remoteTags.ok) {
    return { error: remoteTags.error, ok: false };
  }

  const validated = validateExistingRelease({
    baseBranch: prepared.baseBranch,
    channelName: input.channel,
    localTags: localTags.tags,
    remote: prepared.configRemote,
    remoteTags: remoteTags.tags,
    tagName: input.tag,
    targetName: input.target,
    targets: prepared.effectiveTargets,
  });
  if (!validated.ok) {
    return { error: validated.error, ok: false };
  }

  const remoteTip = await getRemoteBranchTip(
    prepared.repoRoot,
    prepared.configRemote,
    prepared.baseBranch,
  );
  if (!remoteTip.ok) {
    return { error: remoteTip.error, ok: false };
  }

  const reachable = await isCommitReachableFrom(
    prepared.repoRoot,
    validated.result.commit,
    remoteTip.commit,
    prepared.configRemote,
    prepared.baseBranch,
  );
  if (!reachable.ok) {
    return { error: reachable.error, ok: false };
  }

  return { ok: true, result: validated.result };
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

export function renderHumanValidated(result: ValidatedReleaseResult): string {
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
