import { intro, log, note, outro } from "@clack/prompts";

import type { PromptAdapter, RenderTargetsInput } from "@/interactive/prompt-adapter";

export function createClackPromptAdapter(): PromptAdapter {
  return new ClackPromptAdapter();
}

class ClackPromptAdapter implements PromptAdapter {
  async renderTargets(input: RenderTargetsInput): Promise<void> {
    intro("tagsmith targets");
    for (const warning of input.warnings) {
      log.warn(warning);
    }
    note(input.facts, "Targets");
    outro("Done.");
  }
}
