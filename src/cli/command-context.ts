import { isAbsolute, resolve } from "node:path";

import { discoverGitRoot } from "@/adapters/git/process-git";

export type CommandContextResult =
  | { readonly configPath: string; readonly ok: true; readonly repoRoot: string }
  | { readonly error: string; readonly ok: false };

export async function resolveCommandContext(options: {
  readonly configPath: string | undefined;
  readonly cwd: string;
}): Promise<CommandContextResult> {
  const gitRoot = await discoverGitRoot(options.cwd);
  if (!gitRoot.ok) {
    return gitRoot;
  }

  const configPath =
    options.configPath === undefined
      ? resolve(gitRoot.repoRoot, ".tagsmith.jsonc")
      : isAbsolute(options.configPath)
        ? options.configPath
        : resolve(gitRoot.repoRoot, options.configPath);

  return { configPath, ok: true, repoRoot: gitRoot.repoRoot };
}
