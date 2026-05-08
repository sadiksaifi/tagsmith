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

export async function inspectInitConfigDestination(
  destination: string,
): Promise<InitConfigDestinationInspectionResult> {
  const parent = dirname(destination);

  try {
    const parentInfo = await stat(parent);
    if (!parentInfo.isDirectory()) {
      return { error: `destination parent directory is not a directory: ${parent}`, ok: false };
    }
  } catch {
    return { error: `destination parent directory does not exist: ${parent}`, ok: false };
  }

  try {
    await lstat(destination);
    return { destinationExists: true, ok: true, parentDirectory: parent };
  } catch (error) {
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
  const inspected = await inspectInitConfigDestination(options.destination);
  if (!inspected.ok) {
    return inspected;
  }

  if (!options.force && inspected.destinationExists) {
    return { error: `destination already exists: ${options.destination}`, ok: false };
  }

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
