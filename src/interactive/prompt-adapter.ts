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

export type PromptDecision = "cancel" | "confirm";

export interface PromptAdapter {
  cancel(message: string): Promise<void>;
  confirmInit(input: ConfirmInitInput): Promise<PromptDecision>;
  renderTargets(input: RenderTargetsInput): Promise<void>;
}
