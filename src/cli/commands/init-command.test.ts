import { beforeEach, describe, expect, test, vi } from "vitest";

const workflow = vi.hoisted(() => ({
  inspectInitWorkflowDestination: vi.fn(),
  resolveInitWorkflowContext: vi.fn(),
  writeInitWorkflowTemplate: vi.fn(),
}));

vi.mock("@/cli/init-workflow", () => workflow);

import { runInitCommand } from "@/cli/commands/init-command";
import type { CliOutput } from "@/cli/output/create-output";
import type { ProgressPhase, ProgressReporter } from "@/cli/output/progress";

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

describe("runInitCommand", () => {
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

  test("passes the progress signal to init destination inspection and stops before write when it aborts", async () => {
    const progress = new SignalRecordingProgressReporter();
    const reason = new Error("cancelled");
    workflow.inspectInitWorkflowDestination.mockImplementation(async (_destination, options) => {
      expect(options.signal).toBe(progress.signals.get("Inspecting config destination"));
      throw reason;
    });

    await expect(
      runInitCommand({
        configPath: undefined,
        cwd: "/repo",
        flags: {},
        output,
        progress,
      }),
    ).rejects.toBe(reason);

    expect(workflow.writeInitWorkflowTemplate).not.toHaveBeenCalled();
  });
});
