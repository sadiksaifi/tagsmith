import { z } from "zod";

import { writeInitConfigFile } from "@/adapters/fs/init-config-file";
import { resolveCommandContext } from "@/cli/command-context";
import type { CliOutput } from "@/cli/output/create-output";
import { initConfigTemplate } from "@/core/init/init-template";

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

  const context = await resolveCommandContext({
    configPath: input.data.configPath,
    cwd: input.data.cwd,
  });
  if (!context.ok) {
    options.output.error(context.error);
    return 1;
  }

  if (input.data.dryRun) {
    options.output.writeRaw(initConfigTemplate);
    return 0;
  }

  const written = await writeInitConfigFile({
    destination: context.configPath,
    force: input.data.force,
    template: initConfigTemplate,
  });
  if (!written.ok) {
    options.output.error(written.error);
    return 1;
  }

  options.output.human(`Created Tagsmith config at ${context.configPath}`);
  return 0;
}
