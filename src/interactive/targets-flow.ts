import { loadConfigFile } from "@/adapters/fs/config-file";
import { validateTargetPaths } from "@/adapters/fs/target-paths";
import { resolveCommandContext } from "@/cli/command-context";
import { renderTargets } from "@/cli/commands/targets-command";
import type { CliOutput } from "@/cli/output/create-output";
import type { ProgressReporter } from "@/cli/output/progress";
import type { PromptAdapter } from "@/interactive/prompt-adapter";

export interface InteractiveTargetsOptions {
  readonly configPath: string | undefined;
  readonly cwd: string;
  readonly output: CliOutput;
  readonly progress: ProgressReporter;
  readonly promptAdapter: PromptAdapter;
}

export async function runInteractiveTargets(options: InteractiveTargetsOptions): Promise<number> {
  const context = await options.progress.phase("Resolving Git repository", async (phase) => {
    const result = await resolveCommandContext({
      configPath: options.configPath,
      cwd: options.cwd,
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
    const result = await validateTargetPaths(context.repoRoot, loaded.effectiveTargets);
    if (!result.ok) {
      phase.fail();
    }
    return result;
  });
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
