import { Writable } from "node:stream";

import type { OutputMode, OutputWriter } from "@/cli/output/create-output";

export interface ProgressPhase {
  fail(message?: string): void;
}

export interface ProgressReporter {
  phase<T>(label: string, task: (phase: ProgressPhase) => Promise<T>): Promise<T>;
}

export interface ProgressSpinner {
  clear(): void;
  error(message?: string): void;
  start(message?: string): void;
  readonly isCancelled: boolean;
}

export type ProgressSpinnerFactory = () => Promise<ProgressSpinner>;

export interface CreateProgressReporterOptions {
  readonly ci?: boolean | string | undefined;
  readonly createSpinner?: ProgressSpinnerFactory;
  readonly mode: OutputMode;
  readonly stderr: OutputWriter;
  readonly stderrIsTty?: boolean | undefined;
}

export const noopProgressReporter: ProgressReporter = {
  async phase(_label, task) {
    return task({ fail: () => {} });
  },
};

export function createProgressReporter(options: CreateProgressReporterOptions): ProgressReporter {
  if (options.mode !== "human" || options.stderrIsTty !== true || isTruthyCi(options.ci)) {
    return noopProgressReporter;
  }

  const createSpinner = options.createSpinner ?? (() => createClackSpinner(options.stderr));
  return new TtyProgressReporter(createSpinner);
}

class TtyProgressReporter implements ProgressReporter {
  private disabled = false;

  constructor(private readonly createSpinner: ProgressSpinnerFactory) {}

  async phase<T>(label: string, task: (phase: ProgressPhase) => Promise<T>): Promise<T> {
    const active = await this.startPhase(label);
    let failedMessage: string | undefined;
    const phase: ProgressPhase = {
      fail(message) {
        failedMessage = message ?? label;
      },
    };

    try {
      const result = await task(phase);
      if (failedMessage === undefined) {
        this.clear(active);
      } else {
        this.error(active, failedMessage);
      }
      return result;
    } catch (error) {
      this.error(active, failedMessage ?? label);
      throw error;
    }
  }

  private async startPhase(label: string): Promise<ProgressSpinner | undefined> {
    if (this.disabled) {
      return undefined;
    }

    try {
      const spinner = await this.createSpinner();
      spinner.start(label);
      return spinner;
    } catch {
      this.disabled = true;
      return undefined;
    }
  }

  private clear(spinner: ProgressSpinner | undefined): void {
    try {
      spinner?.clear();
    } catch {}
  }

  private error(spinner: ProgressSpinner | undefined, message: string): void {
    try {
      spinner?.error(message);
    } catch {}
  }
}

async function createClackSpinner(stderr: OutputWriter): Promise<ProgressSpinner> {
  if (!(stderr instanceof Writable)) {
    throw new Error("progress output must be a writable stream");
  }

  const { spinner } = await import("@clack/prompts");
  return spinner({ indicator: "dots", output: stderr });
}

function isTruthyCi(value: boolean | string | undefined): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === undefined) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false";
}
