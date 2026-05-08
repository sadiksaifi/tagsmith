import { Writable } from "node:stream";

import type { OutputMode, OutputWriter } from "@/cli/output/create-output";

export interface ProgressPhase {
  fail(message?: string): void;
  readonly signal: AbortSignal;
}

export interface ProgressReporter {
  phase<T>(label: string, task: (phase: ProgressPhase) => Promise<T>): Promise<T>;
}

export interface ProgressSpinner {
  cancel?(message?: string): void;
  clear(): void;
  error(message?: string): void;
  start(message?: string): void;
  readonly isCancelled: boolean;
}

export interface ProgressSpinnerControls {
  readonly onCancel: () => void;
  readonly signal: AbortSignal;
}

export type ProgressSpinnerFactory = (
  controls: ProgressSpinnerControls,
) => Promise<ProgressSpinner>;

const cancellationMessage = "tagsmith cancelled.";

export class ProgressCancelledError extends Error {
  constructor() {
    super(cancellationMessage);
    this.name = "ProgressCancelledError";
  }
}

export function isProgressCancelledError(error: unknown): error is ProgressCancelledError {
  return error instanceof ProgressCancelledError;
}

export interface CreateProgressReporterOptions {
  readonly ci?: boolean | string | undefined;
  readonly createSpinner?: ProgressSpinnerFactory;
  readonly mode: OutputMode;
  readonly stderr: OutputWriter;
  readonly stderrIsTty?: boolean | undefined;
}

export const noopProgressReporter: ProgressReporter = {
  async phase(_label, task) {
    return task({ fail: () => {}, signal: new AbortController().signal });
  },
};

export function createProgressReporter(options: CreateProgressReporterOptions): ProgressReporter {
  if (options.mode !== "human" || options.stderrIsTty !== true || isTruthyCi(options.ci)) {
    return noopProgressReporter;
  }

  const createSpinner =
    options.createSpinner ?? ((controls) => createClackSpinner(options.stderr, controls));
  return new TtyProgressReporter(createSpinner);
}

class TtyProgressReporter implements ProgressReporter {
  private disabled = false;

  constructor(private readonly createSpinner: ProgressSpinnerFactory) {}

  async phase<T>(label: string, task: (phase: ProgressPhase) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const cancel = () => abortProgress(controller);
    const active = await this.startPhase(label, { onCancel: cancel, signal: controller.signal });
    let failedMessage: string | undefined;
    let cancellationCleanedUp = false;
    const cancelActive = () => {
      if (!cancellationCleanedUp) {
        cancellationCleanedUp = true;
        this.cancel(active);
      }
    };
    const onSigint = () => abortProgress(controller);
    const phase: ProgressPhase = {
      fail(message) {
        failedMessage = message ?? label;
      },
      signal: controller.signal,
    };

    process.once("SIGINT", onSigint);
    try {
      const result = await task(phase);
      if (controller.signal.aborted) {
        cancelActive();
        throw new ProgressCancelledError();
      }
      if (failedMessage === undefined) {
        this.clear(active);
      } else {
        this.error(active, failedMessage);
      }
      return result;
    } catch (error) {
      if (controller.signal.aborted) {
        cancelActive();
        throw new ProgressCancelledError();
      }
      if (isProgressCancelledError(error)) {
        throw error;
      }
      this.error(active, failedMessage ?? label);
      throw error;
    } finally {
      process.off("SIGINT", onSigint);
    }
  }

  private async startPhase(
    label: string,
    controls: ProgressSpinnerControls,
  ): Promise<ProgressSpinner | undefined> {
    if (this.disabled) {
      return undefined;
    }

    try {
      const spinner = await this.createSpinner(controls);
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

  private cancel(spinner: ProgressSpinner | undefined): void {
    try {
      if (spinner?.cancel === undefined) {
        spinner?.error(cancellationMessage);
        return;
      }
      spinner.cancel(cancellationMessage);
    } catch {}
  }
}

async function createClackSpinner(
  stderr: OutputWriter,
  controls: ProgressSpinnerControls,
): Promise<ProgressSpinner> {
  if (!(stderr instanceof Writable)) {
    throw new Error("progress output must be a writable stream");
  }

  const { spinner } = await import("@clack/prompts");
  return spinner({
    indicator: "dots",
    onCancel: controls.onCancel,
    output: stderr,
    signal: controls.signal,
    withGuide: false,
  });
}

function abortProgress(controller: AbortController): void {
  if (!controller.signal.aborted) {
    controller.abort(new ProgressCancelledError());
  }
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
