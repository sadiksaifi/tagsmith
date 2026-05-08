import { z } from "zod";

import {
  inspectInitWorkflowDestination,
  resolveInitWorkflowContext,
  writeInitWorkflowTemplate,
} from "@/cli/init-workflow";
import type { CliOutput } from "@/cli/output/create-output";
import type { ProgressReporter } from "@/cli/output/progress";

const initInputSchema = z
  .object({
    configPath: z.string().optional(),
    cwd: z.string(),
    dryRun: z.boolean(),
    force: z.boolean(),
  })
  .strict();

export interface InitCommandOptions {
  readonly configPath: string | undefined;
  readonly cwd: string;
  readonly flags: Readonly<Record<string, boolean | string>>;
  readonly output: CliOutput;
  readonly progress: ProgressReporter;
}

export async function runInitCommand(options: InitCommandOptions): Promise<number> {
  const input = initInputSchema.safeParse({
    configPath: options.configPath,
    cwd: options.cwd,
    dryRun: options.flags["--dry-run"] === true,
    force: options.flags["--force"] === true,
  });

  if (!input.success) {
    options.output.error(input.error.issues[0]?.message ?? "invalid init command input");
    return 1;
  }

  const context = await options.progress.phase("Resolving Git repository", async (phase) => {
    const result = await resolveInitWorkflowContext({
      configPath: input.data.configPath,
      cwd: input.data.cwd,
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

  if (input.data.dryRun) {
    options.output.writeRaw(context.template);
    return 0;
  }

  const inspected = await options.progress.phase("Inspecting config destination", async (phase) => {
    const result = await inspectInitWorkflowDestination(context.configPath);
    if (!result.ok) {
      phase.fail();
    }
    return result;
  });
  if (!inspected.ok) {
    options.output.error(inspected.error);
    return 1;
  }

  const written = await options.progress.phase("Writing config", async (phase) => {
    const result = await writeInitWorkflowTemplate({
      destination: context.configPath,
      force: input.data.force,
      template: context.template,
    });
    if (!result.ok) {
      phase.fail();
    }
    return result;
  });
  if (!written.ok) {
    options.output.error(written.error);
    return 1;
  }

  options.output.human(`Created Tagsmith config at ${context.configPath}`);
  return 0;
}
