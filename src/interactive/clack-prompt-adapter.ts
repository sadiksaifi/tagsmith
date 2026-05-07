import { cancel, confirm, intro, isCancel, log, note, outro, select, text } from "@clack/prompts";

import type { CommandName } from "@/cli/cli-contract";
import type {
  ConfirmInitInput,
  PromptAdapter,
  RenderTagReviewInput,
  RenderTargetsInput,
  RenderValidateInput,
  RenderValidateWarningsInput,
  SelectActionInput,
  SelectTagBumpInput,
  SelectTagChannelInput,
  SelectTagTargetInput,
  SelectValidateAssertionsInput,
  TagChannelChoice,
  TagReviewDecision,
  ValidateAssertionsDecision,
} from "@/interactive/prompt-adapter";

export function createClackPromptAdapter(): PromptAdapter {
  return new ClackPromptAdapter();
}

class ClackPromptAdapter implements PromptAdapter {
  private tagStarted = false;
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

  async selectAction(
    input: SelectActionInput,
  ): Promise<
    { readonly type: "cancel" } | { readonly type: "select"; readonly value: CommandName }
  > {
    intro("tagsmith");
    const action = await select({
      initialValue: "tag",
      message: "What would you like to do?",
      options: input.commands.map((command) => ({
        label: `${command.name.padEnd(8)} ${command.description}`,
        value: command.name,
      })),
    });

    if (isCancel(action)) {
      return { type: "cancel" };
    }

    if (isAction(action, input)) {
      return { type: "select", value: action };
    }

    return { type: "cancel" };
  }

  async promptTagVersion(): Promise<
    { readonly type: "cancel" } | { readonly type: "submit"; readonly value: string }
  > {
    this.ensureTagIntro();
    const version = await text({
      message: "Explicit SemVer version",
      validate(value) {
        if ((value ?? "").trim().length === 0) {
          return "Version is required";
        }
        return undefined;
      },
    });

    if (isCancel(version)) {
      return { type: "cancel" };
    }

    return { type: "submit", value: version.trim() };
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

  async renderTagDryRun(input: { equivalentCommand: string; facts: string }): Promise<void> {
    this.ensureTagIntro();
    note(
      [
        input.facts,
        "",
        "Equivalent command:",
        input.equivalentCommand,
        "",
        "No tag was created.",
      ].join("\n"),
      "Dry run",
    );
    outro("Done.");
  }

  async renderTagReview(input: RenderTagReviewInput): Promise<TagReviewDecision> {
    this.ensureTagIntro();
    note([input.facts, "", "Equivalent command:", input.equivalentCommand].join("\n"), "Review");
    const action = await select({
      initialValue: input.defaultAction,
      message: input.pushExplicit ? "Create and push this tag?" : "What should Tagsmith do?",
      options: input.pushExplicit
        ? [
            {
              label: "Yes, create annotated local tag and push",
              value: "create-and-push",
            },
            { label: "No, do not create or push a tag", value: "cancel" },
          ]
        : [
            { label: "Create annotated local tag", value: "create-local" },
            {
              label: "Create annotated local tag and push",
              value: "create-and-push",
            },
            { label: "No, do not create a tag", value: "cancel" },
          ],
    });

    if (isCancel(action) || !isTagReviewDecision(action)) {
      return "cancel";
    }

    return action;
  }

  async renderTagWarnings(input: { warnings: readonly string[] }): Promise<void> {
    this.ensureTagIntro();
    for (const warning of input.warnings) {
      log.warn(warning);
    }
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

  async selectTagBump(
    input: SelectTagBumpInput,
  ): Promise<
    | { readonly type: "cancel" }
    | { readonly type: "select"; readonly value: "major" | "minor" | "patch" | "prerelease" }
  > {
    this.ensureTagIntro();
    const bump = await select({
      initialValue: "patch",
      message: "Which bump?",
      options: input.bumps.map((candidate) => ({ label: candidate, value: candidate })),
    });

    if (isCancel(bump)) {
      return { type: "cancel" };
    }

    if (isTagBump(bump)) {
      return { type: "select", value: bump };
    }

    return { type: "cancel" };
  }

  async selectTagChannel(
    input: SelectTagChannelInput,
  ): Promise<{ readonly type: "cancel" } | { readonly type: "select"; readonly value: string }> {
    this.ensureTagIntro();
    const channel = await select({
      message: "Which channel?",
      options: input.channels.map((candidate) => tagChannelOption(candidate)),
    });

    if (isCancel(channel)) {
      return { type: "cancel" };
    }

    return { type: "select", value: channel };
  }

  async selectTagTarget(
    input: SelectTagTargetInput,
  ): Promise<{ readonly type: "cancel" } | { readonly type: "select"; readonly value: string }> {
    this.ensureTagIntro();
    const target = await select({
      message: "Which target?",
      options: input.targets.map((candidate) => ({ label: candidate.name, value: candidate.name })),
    });

    if (isCancel(target)) {
      return { type: "cancel" };
    }

    return { type: "select", value: target };
  }

  async selectTagVersionIntent(): Promise<
    { readonly type: "cancel" } | { readonly type: "select"; readonly value: "bump" | "version" }
  > {
    this.ensureTagIntro();
    const intent = await select({
      initialValue: "bump",
      message: "How should Tagsmith choose the version?",
      options: [
        { label: "Bump from release history", value: "bump" },
        { label: "Use an explicit SemVer version", value: "version" },
      ],
    });

    if (isCancel(intent)) {
      return { type: "cancel" };
    }

    if (intent === "bump" || intent === "version") {
      return { type: "select", value: intent };
    }

    return { type: "cancel" };
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

  private ensureTagIntro(): void {
    if (!this.tagStarted) {
      intro("tagsmith tag");
      this.tagStarted = true;
    }
  }

  private ensureValidateIntro(): void {
    if (!this.validateStarted) {
      intro("tagsmith validate");
      this.validateStarted = true;
    }
  }
}

function isAction(value: string, input: SelectActionInput): value is CommandName {
  return input.commands.some((command) => command.name === value);
}

function isTagBump(value: string): value is "major" | "minor" | "patch" | "prerelease" {
  return value === "major" || value === "minor" || value === "patch" || value === "prerelease";
}

function isTagReviewDecision(value: string): value is TagReviewDecision {
  return value === "cancel" || value === "create-and-push" || value === "create-local";
}

function tagChannelOption(candidate: TagChannelChoice): {
  readonly hint: "prerelease" | "stable";
  readonly label: string;
  readonly value: string;
} {
  return {
    hint: candidate.strategy,
    label: candidate.name,
    value: candidate.name,
  };
}
