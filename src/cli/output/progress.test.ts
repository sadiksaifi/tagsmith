import { describe, expect, test } from "vitest";

import {
  createProgressReporter,
  noopProgressReporter,
  type ProgressSpinner,
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
