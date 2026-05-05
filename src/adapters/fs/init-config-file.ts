import { lstat, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type WriteInitConfigResult =
  | { readonly ok: true }
  | { readonly error: string; readonly ok: false };

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = error.code;
  return typeof code === "string" ? code : undefined;
}

export async function writeInitConfigFile(options: {
  readonly destination: string;
  readonly force: boolean;
  readonly template: string;
}): Promise<WriteInitConfigResult> {
  const parent = dirname(options.destination);

  try {
    const parentInfo = await stat(parent);
    if (!parentInfo.isDirectory()) {
      return { error: `destination parent directory is not a directory: ${parent}`, ok: false };
    }
  } catch {
    return { error: `destination parent directory does not exist: ${parent}`, ok: false };
  }

  if (!options.force) {
    try {
      await lstat(options.destination);
      return { error: `destination already exists: ${options.destination}`, ok: false };
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        return {
          error: `${options.destination}: ${error instanceof Error ? error.message : "failed to inspect config file"}`,
          ok: false,
        };
      }
    }
  }

  try {
    await writeFile(options.destination, options.template, {
      encoding: "utf8",
      flag: options.force ? "w" : "wx",
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
