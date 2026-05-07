import { loadConfigFile } from "@/adapters/fs/config-file";
import { validateTargetPaths } from "@/adapters/fs/target-paths";
import { resolveCommandContext } from "@/cli/command-context";
import { renderTargets } from "@/cli/commands/targets-command";
import type { CliOutput } from "@/cli/output/create-output";
import type { PromptAdapter } from "@/interactive/prompt-adapter";

export interface InteractiveTargetsOptions {
  readonly configPath: string | undefined;
  readonly cwd: string;
  readonly output: CliOutput;
  readonly promptAdapter: PromptAdapter;
}

export async function runInteractiveTargets(options: InteractiveTargetsOptions): Promise<number> {
  const context = await resolveCommandContext({
    configPath: options.configPath,
    cwd: options.cwd,
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

  await options.promptAdapter.renderTargets({
    facts: renderTargets(loaded.effectiveTargets),
    warnings: loaded.warnings,
  });
  return 0;
}
