import { constants } from "node:fs";
import { access, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type WriteInitConfigResult =
  | { readonly ok: true }
  | { readonly error: string; readonly ok: false };

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
      await access(options.destination, constants.F_OK);
      return { error: `destination already exists: ${options.destination}`, ok: false };
    } catch {
      // Destination does not exist, so init may create it.
    }
  }

  try {
    await writeFile(options.destination, options.template, { encoding: "utf8" });
    return { ok: true };
  } catch (error) {
    return {
      error: `${options.destination}: ${error instanceof Error ? error.message : "failed to write config file"}`,
      ok: false,
    };
  }
}
