import { describe, expect, test } from "vitest";

import {
  createProgressReporter,
  isProgressCancelledError,
  noopProgressReporter,
  type ProgressSpinner,
  type ProgressSpinnerControls,
} from "@/cli/output/progress";

class MemoryWriter {
  text = "";

  write(chunk: string): boolean {
    this.text += chunk;
    return true;
  }
}

class RecordingSpinner implements ProgressSpinner {
  readonly events: string[] = [];
  isCancelled = false;

  clear(): void {
    this.events.push("clear");
  }

  error(message?: string): void {
    this.events.push(`error:${message ?? ""}`);
  }

  start(message?: string): void {
    this.events.push(`start:${message ?? ""}`);
  }
}

class CancelRecordingSpinner extends RecordingSpinner {
  cancel(message?: string): void {
    this.events.push(`cancel:${message ?? ""}`);
  }
}

describe("progress reporter", () => {
  test("disabled modes execute work without creating spinners", async () => {
    const modes = ["json", "github", "raw"] as const;

    const created = await Promise.all(
      modes.map(async (mode) => {
        let spinnerCreated = false;
        const reporter = createProgressReporter({
          ci: false,
          createSpinner: async () => {
            spinnerCreated = true;
            return new RecordingSpinner();
          },
          mode,
          stderr: new MemoryWriter(),
          stderrIsTty: true,
        });

        await expect(reporter.phase("Loading config", async () => "done")).resolves.toBe("done");
        return spinnerCreated;
      }),
    );

    expect(created).toEqual([false, false, false]);
  });

  test("human non-TTY and CI execute work without creating spinners", async () => {
    const cases = [
      { ci: false, stderrIsTty: false },
      { ci: true, stderrIsTty: true },
      { ci: "true", stderrIsTty: true },
    ];

    const created = await Promise.all(
      cases.map(async (testCase) => {
        let spinnerCreated = false;
        const reporter = createProgressReporter({
          ...testCase,
          createSpinner: async () => {
            spinnerCreated = true;
            return new RecordingSpinner();
          },
          mode: "human",
          stderr: new MemoryWriter(),
        });

        await expect(reporter.phase("Loading config", async () => "done")).resolves.toBe("done");
        return spinnerCreated;
      }),
    );

    expect(created).toEqual([false, false, false]);
  });

  test("enabled human TTY progress clears successful phases", async () => {
    const spinners: RecordingSpinner[] = [];
    const reporter = createProgressReporter({
      ci: false,
      createSpinner: async () => {
        const spinner = new RecordingSpinner();
        spinners.push(spinner);
        return spinner;
      },
      mode: "human",
      stderr: new MemoryWriter(),
      stderrIsTty: true,
    });

    await expect(reporter.phase("Loading config", async () => "done")).resolves.toBe("done");

    expect(spinners).toHaveLength(1);
    expect(spinners[0]?.events).toEqual(["start:Loading config", "clear"]);
  });

  test("expected failures mark the active phase as failed", async () => {
    const spinners: RecordingSpinner[] = [];
    const reporter = createProgressReporter({
      ci: false,
      createSpinner: async () => {
        const spinner = new RecordingSpinner();
        spinners.push(spinner);
        return spinner;
      },
      mode: "human",
      stderr: new MemoryWriter(),
      stderrIsTty: true,
    });

    await expect(
      reporter.phase("Loading config", async (phase) => {
        phase.fail("Config unavailable");
        return { ok: false as const };
      }),
    ).resolves.toEqual({ ok: false });

    expect(spinners[0]?.events).toEqual(["start:Loading config", "error:Config unavailable"]);
  });

  test("thrown failures mark the active phase as failed and rethrow", async () => {
    const spinners: RecordingSpinner[] = [];
    const reporter = createProgressReporter({
      ci: false,
      createSpinner: async () => {
        const spinner = new RecordingSpinner();
        spinners.push(spinner);
        return spinner;
      },
      mode: "human",
      stderr: new MemoryWriter(),
      stderrIsTty: true,
    });

    await expect(
      reporter.phase("Reading tags", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(spinners[0]?.events).toEqual(["start:Reading tags", "error:Reading tags"]);
  });

  test("spinner cancellation aborts the active phase and prevents later work", async () => {
    let controls: ProgressSpinnerControls | undefined;
    const spinners: RecordingSpinner[] = [];
    const reporter = createProgressReporter({
      ci: false,
      createSpinner: async (spinnerControls) => {
        controls = spinnerControls;
        const spinner = new RecordingSpinner();
        spinners.push(spinner);
        return spinner;
      },
      mode: "human",
      stderr: new MemoryWriter(),
      stderrIsTty: true,
    });
    const steps: string[] = [];

    async function workflow(): Promise<void> {
      await reporter.phase("Creating tag signal@1.2.3", async (phase) => {
        steps.push("create");
        controls?.onCancel();
        await Promise.resolve();
        expect(phase.signal.aborted).toBe(true);
      });
      steps.push("push");
    }

    let caught: unknown;
    try {
      await workflow();
    } catch (error) {
      caught = error;
    }

    expect(isProgressCancelledError(caught)).toBe(true);
    expect(steps).toEqual(["create"]);
    expect(spinners[0]?.events).toEqual([
      "start:Creating tag signal@1.2.3",
      "error:tagsmith cancelled.",
    ]);
  });

  test("cancellation uses spinner cancel when available", async () => {
    let controls: ProgressSpinnerControls | undefined;
    const spinners: CancelRecordingSpinner[] = [];
    const reporter = createProgressReporter({
      ci: false,
      createSpinner: async (spinnerControls) => {
        controls = spinnerControls;
        const spinner = new CancelRecordingSpinner();
        spinners.push(spinner);
        return spinner;
      },
      mode: "human",
      stderr: new MemoryWriter(),
      stderrIsTty: true,
    });

    let caught: unknown;
    try {
      await reporter.phase("Pushing tag signal@1.2.3", async () => {
        controls?.onCancel();
      });
    } catch (error) {
      caught = error;
    }

    expect(isProgressCancelledError(caught)).toBe(true);
    expect(spinners[0]?.events).toEqual([
      "start:Pushing tag signal@1.2.3",
      "cancel:tagsmith cancelled.",
    ]);
  });

  test("SIGINT cancellation aborts the active phase", async () => {
    const reporter = createProgressReporter({
      ci: false,
      createSpinner: async () => new RecordingSpinner(),
      mode: "human",
      stderr: new MemoryWriter(),
      stderrIsTty: true,
    });

    let caught: unknown;
    try {
      await reporter.phase("Reading remote tags", async (phase) => {
        process.emit("SIGINT", "SIGINT");
        expect(phase.signal.aborted).toBe(true);
      });
    } catch (error) {
      caught = error;
    }

    expect(isProgressCancelledError(caught)).toBe(true);
  });

  test("cancelled task rejections become controlled cancellation", async () => {
    let controls: ProgressSpinnerControls | undefined;
    const reporter = createProgressReporter({
      ci: false,
      createSpinner: async (spinnerControls) => {
        controls = spinnerControls;
        return new RecordingSpinner();
      },
      mode: "human",
      stderr: new MemoryWriter(),
      stderrIsTty: true,
    });

    let caught: unknown;
    try {
      await reporter.phase("Creating tag signal@1.2.3", async () => {
        controls?.onCancel();
        throw new Error("exec aborted");
      });
    } catch (error) {
      caught = error;
    }

    expect(isProgressCancelledError(caught)).toBe(true);
  });

  test("cancelled task signal rejections clean up the active spinner", async () => {
    let controls: ProgressSpinnerControls | undefined;
    const spinners: CancelRecordingSpinner[] = [];
    const reporter = createProgressReporter({
      ci: false,
      createSpinner: async (spinnerControls) => {
        controls = spinnerControls;
        const spinner = new CancelRecordingSpinner();
        spinners.push(spinner);
        return spinner;
      },
      mode: "human",
      stderr: new MemoryWriter(),
      stderrIsTty: true,
    });

    let caught: unknown;
    try {
      await reporter.phase("Inspecting config destination", async (phase) => {
        controls?.onCancel();
        throw phase.signal.reason;
      });
    } catch (error) {
      caught = error;
    }

    expect(isProgressCancelledError(caught)).toBe(true);
    expect(spinners[0]?.events).toEqual([
      "start:Inspecting config destination",
      "cancel:tagsmith cancelled.",
    ]);
  });

  test("spinner rendering failures degrade to no-op", async () => {
    let attempts = 0;
    const reporter = createProgressReporter({
      ci: false,
      createSpinner: async () => {
        attempts += 1;
        return {
          clear() {
            throw new Error("clear failed");
          },
          error() {
            throw new Error("error failed");
          },
          isCancelled: false,
          start() {
            throw new Error("start failed");
          },
        };
      },
      mode: "human",
      stderr: new MemoryWriter(),
      stderrIsTty: true,
    });

    await expect(reporter.phase("Loading config", async () => "done")).resolves.toBe("done");
    await expect(reporter.phase("Reading tags", async () => "done")).resolves.toBe("done");
    expect(attempts).toBe(1);
  });

  test("no-op reporter executes work", async () => {
    await expect(noopProgressReporter.phase("Writing config", async () => "done")).resolves.toBe(
      "done",
    );
  });
});
