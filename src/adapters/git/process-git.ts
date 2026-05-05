import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DiscoverGitRootResult =
  | { readonly ok: true; readonly repoRoot: string }
  | { readonly error: string; readonly ok: false };

export async function discoverGitRoot(cwd: string): Promise<DiscoverGitRootResult> {
  try {
    const result = await execFileAsync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
    });
    return { ok: true, repoRoot: result.stdout.trim() };
  } catch {
    return { error: `Git repository not found from ${cwd}`, ok: false };
  }
}
