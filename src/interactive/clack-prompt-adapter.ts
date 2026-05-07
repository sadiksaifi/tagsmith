import { cancel, confirm, intro, isCancel, log, note, outro } from "@clack/prompts";

import type {
  ConfirmInitInput,
  PromptAdapter,
  RenderTargetsInput,
} from "@/interactive/prompt-adapter";

export function createClackPromptAdapter(): PromptAdapter {
  return new ClackPromptAdapter();
}

class ClackPromptAdapter implements PromptAdapter {
  async cancel(message: string): Promise<void> {
    cancel(message);
  }

  async confirmInit(input: ConfirmInitInput): Promise<"cancel" | "confirm"> {
    intro("tagsmith init");
    note(
      [
        `Destination: ${input.destination}`,
        `Existing config: ${input.existingConfig ? "yes" : "no"}`,
        "",
        "Equivalent command:",
        input.equivalentCommand,
      ].join("\n"),
      "Review",
    );

    const confirmed = await confirm({
      active: input.existingConfig ? "Yes, overwrite config" : "Yes, create config",
      inactive: input.existingConfig ? "No, do not overwrite config" : "No, do not create config",
      initialValue: input.defaultAction === "confirm",
      message: input.existingConfig ? "Overwrite this config file?" : "Create this config file?",
    });

    if (isCancel(confirmed) || !confirmed) {
      return "cancel";
    }

    return "confirm";
  }

  async renderTargets(input: RenderTargetsInput): Promise<void> {
    intro("tagsmith targets");
    for (const warning of input.warnings) {
      log.warn(warning);
    }
    note(input.facts, "Targets");
    outro("Done.");
  }
}
