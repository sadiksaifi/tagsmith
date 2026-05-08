import { lstat, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type InitConfigDestinationInspectionResult =
  | {
      readonly destinationExists: boolean;
      readonly ok: true;
      readonly parentDirectory: string;
    }
  | { readonly error: string; readonly ok: false };

export type WriteInitConfigResult =
  | { readonly ok: true }
  | { readonly error: string; readonly ok: false };

export interface InitConfigFileOperationOptions {
  readonly signal?: AbortSignal | undefined;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = error.code;
  return typeof code === "string" ? code : undefined;
}

async function abortable<T>(
  operation: () => Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  throwIfAborted(signal);
  const running = operation();
  if (signal === undefined) {
    return running;
  }

  return new Promise<T>((resolvePromise, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    running
      .then(resolvePromise, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw abortReason(signal);
  }
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted", "AbortError");
}

export async function inspectInitConfigDestination(
  destination: string,
  options: InitConfigFileOperationOptions = {},
): Promise<InitConfigDestinationInspectionResult> {
  const parent = dirname(destination);

  try {
    const parentInfo = await abortable(() => stat(parent), options.signal);
    if (!parentInfo.isDirectory()) {
      return { error: `destination parent directory is not a directory: ${parent}`, ok: false };
    }
  } catch {
    if (options.signal?.aborted === true) {
      throw abortReason(options.signal);
    }

    return { error: `destination parent directory does not exist: ${parent}`, ok: false };
  }

  try {
    await abortable(() => lstat(destination), options.signal);
    return { destinationExists: true, ok: true, parentDirectory: parent };
  } catch (error) {
    if (options.signal?.aborted === true) {
      throw abortReason(options.signal);
    }

    if (errorCode(error) === "ENOENT") {
      return { destinationExists: false, ok: true, parentDirectory: parent };
    }

    return {
      error: `${destination}: ${error instanceof Error ? error.message : "failed to inspect config file"}`,
      ok: false,
    };
  }
}

export async function writeInitConfigFile(options: {
  readonly destination: string;
  readonly force: boolean;
  readonly signal?: AbortSignal | undefined;
  readonly template: string;
}): Promise<WriteInitConfigResult> {
  const inspected = await inspectInitConfigDestination(options.destination, {
    signal: options.signal,
  });
  if (!inspected.ok) {
    return inspected;
  }

  if (!options.force && inspected.destinationExists) {
    return { error: `destination already exists: ${options.destination}`, ok: false };
  }

  throwIfAborted(options.signal);

  try {
    await writeFile(options.destination, options.template, {
      encoding: "utf8",
      flag: options.force ? "w" : "wx",
      signal: options.signal,
    });
    return { ok: true };
  } catch (error) {
    if (!options.force && errorCode(error) === "EEXIST") {
      return { error: `destination already exists: ${options.destination}`, ok: false };
    }

    return {
      error: `${options.destination}: ${error instanceof Error ? error.message : "failed to write config file"}`,
      ok: false,
    };
  }
}
