import { z } from "zod";

import { loadConfigFile } from "@/adapters/fs/config-file";
import { validateTargetPaths } from "@/adapters/fs/target-paths";
import { resolveCommandContext } from "@/cli/command-context";
import type { CliOutput } from "@/cli/output/create-output";
import type { ProgressReporter } from "@/cli/output/progress";
import type { EffectiveTargetConfig } from "@/core/config/config";

const targetsInputSchema = z
  .object({
    configPath: z.string().optional(),
    cwd: z.string(),
    json: z.boolean(),
  })
  .strict();

export interface TargetsCommandOptions {
  readonly configPath: string | undefined;
  readonly cwd: string;
  readonly flags: Readonly<Record<string, boolean | string>>;
  readonly output: CliOutput;
  readonly progress: ProgressReporter;
}

export async function runTargetsCommand(options: TargetsCommandOptions): Promise<number> {
  const input = targetsInputSchema.safeParse({
    configPath: options.configPath,
    cwd: options.cwd,
    json: options.flags["--json"] === true,
  });

  if (!input.success) {
    options.output.error(input.error.issues[0]?.message ?? "invalid targets command input");
    return 1;
  }

  const context = await options.progress.phase("Resolving Git repository", async (phase) => {
    const result = await resolveCommandContext({
      configPath: input.data.configPath,
      cwd: input.data.cwd,
      signal: phase.signal,
    });
    if (!result.ok) {
      phase.fail();
    }
    return result;
  });
  if (!context.ok) {
    options.output.error(context.error);
    return 1;
  }

  const loaded = await options.progress.phase("Loading config", async (phase) => {
    const result = await loadConfigFile(context.configPath, { signal: phase.signal });
    if (!result.ok) {
      phase.fail();
    }
    return result;
  });
  if (!loaded.ok) {
    options.output.error(loaded.error);
    return 1;
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
    options.output.error(paths.error);
    return 1;
  }

  if (input.data.json) {
    options.output.writeJson(loaded.config);
    return 0;
  }

  for (const warning of loaded.warnings) {
    options.output.warn(warning);
  }
  options.output.human(renderTargets(loaded.effectiveTargets));
  return 0;
}

export function renderTargets(targets: readonly EffectiveTargetConfig[]): string {
  return targets
    .map((target) =>
      [
        target.name,
        `  path: ${target.path}`,
        `  channels: ${target.channels.map(renderChannel).join(", ")}`,
        `  tagPattern: ${target.tagPattern}`,
        `  tagMessage: ${target.tagMessage}`,
        `  initialVersion: ${target.initialVersion}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function renderChannel(channel: EffectiveTargetConfig["channels"][number]): string {
  const dependsOn = channel.dependsOn?.length ? `, dependsOn: ${channel.dependsOn.join(",")}` : "";
  return `${channel.name} (${channel.strategy}${dependsOn})`;
}
