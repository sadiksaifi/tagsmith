export interface RenderTargetsInput {
  readonly facts: string;
  readonly warnings: readonly string[];
}

export interface ConfirmInitInput {
  readonly defaultAction: "cancel" | "confirm";
  readonly destination: string;
  readonly equivalentCommand: string;
  readonly existingConfig: boolean;
}

export interface ValidateChannelChoice {
  readonly name: string;
  readonly strategy: "prerelease" | "stable";
}

export interface ValidateTargetChoice {
  readonly channels: readonly ValidateChannelChoice[];
  readonly name: string;
}

export interface SelectValidateAssertionsInput {
  readonly targets: readonly ValidateTargetChoice[];
}

export interface TagChannelChoice {
  readonly name: string;
  readonly strategy: "prerelease" | "stable";
}

export interface TagTargetChoice {
  readonly name: string;
}

export interface SelectTagTargetInput {
  readonly targets: readonly TagTargetChoice[];
}

export interface SelectTagChannelInput {
  readonly channels: readonly TagChannelChoice[];
}

export interface SelectTagBumpInput {
  readonly bumps:
    | readonly ["major", "minor", "patch"]
    | readonly ["major", "minor", "patch", "prerelease"];
}

export interface RenderTagWarningsInput {
  readonly warnings: readonly string[];
}

export interface RenderTagPlanInput {
  readonly equivalentCommand: string;
  readonly facts: string;
}

export type TagReviewDecision = "cancel" | "create-and-push" | "create-local";

export interface RenderTagReviewInput extends RenderTagPlanInput {
  readonly defaultAction: TagReviewDecision;
  readonly pushExplicit: boolean;
}

export type PromptDecision = "cancel" | "confirm";

export type PromptSelectDecision<T extends string> =
  | { readonly type: "cancel" }
  | { readonly type: "select"; readonly value: T };

export type PromptTextDecision =
  | { readonly type: "cancel" }
  | { readonly type: "submit"; readonly value: string };

export type ValidateAssertionsDecision =
  | { readonly type: "cancel" }
  | { readonly type: "infer" }
  | { readonly target: string; readonly type: "assert-target" }
  | { readonly channel: string; readonly target: string; readonly type: "assert-target-channel" };

export interface RenderValidateInput {
  readonly facts: string;
}

export interface RenderValidateWarningsInput {
  readonly warnings: readonly string[];
}

export interface PromptAdapter {
  cancel(message: string): Promise<void>;
  confirmInit(input: ConfirmInitInput): Promise<PromptDecision>;
  promptTagVersion(): Promise<PromptTextDecision>;
  promptValidateTag(): Promise<PromptTextDecision>;
  renderTagDryRun(input: RenderTagPlanInput): Promise<void>;
  renderTagReview(input: RenderTagReviewInput): Promise<TagReviewDecision>;
  renderTagWarnings(input: RenderTagWarningsInput): Promise<void>;
  renderTargets(input: RenderTargetsInput): Promise<void>;
  renderValidate(input: RenderValidateInput): Promise<void>;
  renderValidateWarnings(input: RenderValidateWarningsInput): Promise<void>;
  selectTagBump(
    input: SelectTagBumpInput,
  ): Promise<PromptSelectDecision<"major" | "minor" | "patch" | "prerelease">>;
  selectTagChannel(input: SelectTagChannelInput): Promise<PromptSelectDecision<string>>;
  selectTagTarget(input: SelectTagTargetInput): Promise<PromptSelectDecision<string>>;
  selectTagVersionIntent(): Promise<PromptSelectDecision<"bump" | "version">>;
  selectValidateAssertions(
    input: SelectValidateAssertionsInput,
  ): Promise<ValidateAssertionsDecision>;
}
