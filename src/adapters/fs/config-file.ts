import { readFile } from "node:fs/promises";

import {
  parseConfigText,
  validateConfig,
  type TagsmithConfig,
  type ValidateConfigResult,
} from "@/core/config/config";

export interface FileOperationOptions {
  readonly signal?: AbortSignal | undefined;
}

export async function loadConfigFile(
  filePath: string,
  options: FileOperationOptions = {},
): Promise<ValidateConfigResult> {
  let text: string;
  try {
    text = await readFile(filePath, { encoding: "utf8", signal: options.signal });
  } catch (error) {
    return { error: `${filePath}: ${fileError(error, "failed to read config file")}`, ok: false };
  }

  const parsed = parseConfigText(text, filePath);
  if (!parsed.ok) {
    return parsed;
  }

  return validateConfig(parsed.config, filePath);
}

export function configForJson(config: TagsmithConfig): TagsmithConfig {
  return config;
}

function fileError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}
