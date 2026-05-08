import { beforeEach, describe, expect, test, vi } from "vitest";

const workflow = vi.hoisted(() => ({
  inspectInitWorkflowDestination: vi.fn(),
  resolveInitWorkflowContext: vi.fn(),
  writeInitWorkflowTemplate: vi.fn(),
}));

vi.mock("@/cli/init-workflow", () => workflow);

import type { CliOutput } from "@/cli/output/create-output";
import type { ProgressPhase, ProgressReporter } from "@/cli/output/progress";
import { runInteractiveInit } from "@/interactive/init-flow";
import type { PromptAdapter } from "@/interactive/prompt-adapter";

class SignalRecordingProgressReporter implements ProgressReporter {
  readonly signals = new Map<string, AbortSignal>();

  async phase<T>(label: string, task: (phase: ProgressPhase) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    this.signals.set(label, controller.signal);
    return task({ fail: () => {}, signal: controller.signal });
  }
}

const output: CliOutput = {
  error: () => {},
  human: () => {},
  verbose: () => {},
  warn: () => {},
  writeJson: () => {},
  writeRaw: () => {},
};

const promptAdapter: PromptAdapter = {
  cancel: async () => {},
  confirmInit: async () => "confirm",
  promptTagVersion: async () => ({ type: "cancel" }),
  promptValidateTag: async () => ({ type: "cancel" }),
  renderTagDryRun: async () => {},
  renderTagReview: async () => "cancel",
  renderTagWarnings: async () => {},
  renderTargets: async () => {},
  renderValidate: async () => {},
  renderValidateWarnings: async () => {},
  selectAction: async () => ({ type: "cancel" }),
  selectTagBump: async () => ({ type: "cancel" }),
  selectTagChannel: async () => ({ type: "cancel" }),
  selectTagTarget: async () => ({ type: "cancel" }),
  selectTagVersionIntent: async () => ({ type: "cancel" }),
  selectValidateAssertions: async () => ({ type: "infer" }),
};

describe("runInteractiveInit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workflow.resolveInitWorkflowContext.mockResolvedValue({
      configPath: "/repo/.tagsmith.jsonc",
      ok: true,
      repoRoot: "/repo",
      template: "{}\n",
    });
    workflow.inspectInitWorkflowDestination.mockResolvedValue({
      destinationExists: false,
      ok: true,
      parentDirectory: "/repo",
    });
    workflow.writeInitWorkflowTemplate.mockResolvedValue({ ok: true });
  });

  test("passes the progress signal to init destination inspection and stops before prompting or writing when it aborts", async () => {
    const progress = new SignalRecordingProgressReporter();
    const reason = new Error("cancelled");
    const confirmInit = vi.fn(async () => "confirm" as const);
    workflow.inspectInitWorkflowDestination.mockImplementation(async (_destination, options) => {
      expect(options.signal).toBe(progress.signals.get("Inspecting config destination"));
      throw reason;
    });

    await expect(
      runInteractiveInit({
        configPath: undefined,
        cwd: "/repo",
        force: false,
        output,
        progress,
        promptAdapter: { ...promptAdapter, confirmInit },
      }),
    ).rejects.toBe(reason);

    expect(confirmInit).not.toHaveBeenCalled();
    expect(workflow.writeInitWorkflowTemplate).not.toHaveBeenCalled();
  });
});
