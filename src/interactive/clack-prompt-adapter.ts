import { cancel, confirm, intro, isCancel, log, note, outro, select, text } from "@clack/prompts";

import type {
  ConfirmInitInput,
  PromptAdapter,
  RenderTargetsInput,
  RenderValidateInput,
  RenderValidateWarningsInput,
  SelectValidateAssertionsInput,
  ValidateAssertionsDecision,
} from "@/interactive/prompt-adapter";

export function createClackPromptAdapter(): PromptAdapter {
  return new ClackPromptAdapter();
}

class ClackPromptAdapter implements PromptAdapter {
  private validateStarted = false;

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

  async promptValidateTag(): Promise<
    { readonly type: "cancel" } | { readonly type: "submit"; readonly value: string }
  > {
    this.ensureValidateIntro();
    const tag = await text({
      message: "Git tag to validate",
      validate(value) {
        if ((value ?? "").trim().length === 0) {
          return "Git tag is required";
        }
        return undefined;
      },
    });

    if (isCancel(tag)) {
      return { type: "cancel" };
    }

    return { type: "submit", value: tag.trim() };
  }

  async renderTargets(input: RenderTargetsInput): Promise<void> {
    intro("tagsmith targets");
    for (const warning of input.warnings) {
      log.warn(warning);
    }
    note(input.facts, "Targets");
    outro("Done.");
  }

  async renderValidate(input: RenderValidateInput): Promise<void> {
    this.ensureValidateIntro();
    note(input.facts, "Validated");
    outro("Done.");
  }

  async renderValidateWarnings(input: RenderValidateWarningsInput): Promise<void> {
    this.ensureValidateIntro();
    for (const warning of input.warnings) {
      log.warn(warning);
    }
  }

  async selectValidateAssertions(
    input: SelectValidateAssertionsInput,
  ): Promise<ValidateAssertionsDecision> {
    this.ensureValidateIntro();
    const assertion = await select({
      initialValue: "infer",
      message: "Add validation assertions?",
      options: [
        { label: "No, infer target and channel from tag", value: "infer" },
        { label: "Assert target", value: "target" },
        { label: "Assert target and channel", value: "target-channel" },
      ],
    });

    if (isCancel(assertion)) {
      return { type: "cancel" };
    }
    if (assertion === "infer") {
      return { type: "infer" };
    }

    const target = await select({
      message: "Which target should the tag validate against?",
      options: input.targets.map((candidate) => ({
        label: candidate.name,
        value: candidate.name,
      })),
    });

    if (isCancel(target)) {
      return { type: "cancel" };
    }
    if (assertion === "target") {
      return { target, type: "assert-target" };
    }

    const targetChoice = input.targets.find((candidate) => candidate.name === target);
    const channel = await select({
      message: "Which channel should the tag validate against?",
      options: (targetChoice?.channels ?? []).map((candidate) => ({
        hint: candidate.strategy,
        label: candidate.name,
        value: candidate.name,
      })),
    });

    if (isCancel(channel)) {
      return { type: "cancel" };
    }

    return { channel, target, type: "assert-target-channel" };
  }

  private ensureValidateIntro(): void {
    if (!this.validateStarted) {
      intro("tagsmith validate");
      this.validateStarted = true;
    }
  }
}
