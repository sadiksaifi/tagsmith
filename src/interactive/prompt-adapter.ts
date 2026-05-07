export interface RenderTargetsInput {
  readonly facts: string;
  readonly warnings: readonly string[];
}

export interface PromptAdapter {
  renderTargets(input: RenderTargetsInput): Promise<void>;
}
