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

export type PromptDecision = "cancel" | "confirm";

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
  promptValidateTag(): Promise<PromptTextDecision>;
  renderTargets(input: RenderTargetsInput): Promise<void>;
  renderValidate(input: RenderValidateInput): Promise<void>;
  renderValidateWarnings(input: RenderValidateWarningsInput): Promise<void>;
  selectValidateAssertions(
    input: SelectValidateAssertionsInput,
  ): Promise<ValidateAssertionsDecision>;
}
