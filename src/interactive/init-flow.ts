import { renderEquivalentCommand } from "@/cli/equivalent-command";
import {
  inspectInitWorkflowDestination,
  resolveInitWorkflowContext,
  writeInitWorkflowTemplate,
} from "@/cli/init-workflow";
import type { CliOutput } from "@/cli/output/create-output";
import type { PromptAdapter } from "@/interactive/prompt-adapter";

export interface InteractiveInitOptions {
  readonly configPath: string | undefined;
  readonly cwd: string;
  readonly force: boolean;
  readonly output: CliOutput;
  readonly promptAdapter: PromptAdapter;
}

export async function runInteractiveInit(options: InteractiveInitOptions): Promise<number> {
  const context = await resolveInitWorkflowContext({
    configPath: options.configPath,
    cwd: options.cwd,
  });
  if (!context.ok) {
    options.output.error(context.error);
    return 1;
  }

  const inspected = await inspectInitWorkflowDestination(context.configPath);
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

  const written = await writeInitWorkflowTemplate({
    destination: context.configPath,
    force: options.force || inspected.destinationExists,
    template: context.template,
  });
  if (!written.ok) {
    options.output.error(written.error);
    return 1;
  }

  return 0;
}
