import { renderEquivalentCommand } from "@/cli/equivalent-command";
import {
  inspectInitWorkflowDestination,
  resolveInitWorkflowContext,
  writeInitWorkflowTemplate,
} from "@/cli/init-workflow";
import type { CliOutput } from "@/cli/output/create-output";
import type { ProgressReporter } from "@/cli/output/progress";
import type { PromptAdapter } from "@/interactive/prompt-adapter";

export interface InteractiveInitOptions {
  readonly configPath: string | undefined;
  readonly cwd: string;
  readonly force: boolean;
  readonly output: CliOutput;
  readonly progress: ProgressReporter;
  readonly promptAdapter: PromptAdapter;
}

export async function runInteractiveInit(options: InteractiveInitOptions): Promise<number> {
  const context = await options.progress.phase("Resolving Git repository", async (phase) => {
    const result = await resolveInitWorkflowContext({
      configPath: options.configPath,
      cwd: options.cwd,
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

  const forceForEquivalentCommand = options.force || inspected.destinationExists;
  const decision = await options.promptAdapter.confirmInit({
    defaultAction: inspected.destinationExists ? "cancel" : "confirm",
    destination: context.configPath,
    equivalentCommand: renderEquivalentCommand({
      command: "init",
      configPath: options.configPath,
      flags: { force: forceForEquivalentCommand },
    }),
    existingConfig: inspected.destinationExists,
  });

  if (decision === "cancel") {
    await options.promptAdapter.cancel("tagsmith cancelled.");
    return 1;
  }

  const written = await options.progress.phase("Writing config", async (phase) => {
    const result = await writeInitWorkflowTemplate({
      destination: context.configPath,
      force: options.force || inspected.destinationExists,
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

  return 0;
}
