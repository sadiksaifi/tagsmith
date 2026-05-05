import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import type { EffectiveTargetConfig } from "@/core/config/config";

export type ValidateTargetPathsResult =
  | { readonly ok: true }
  | { readonly error: string; readonly ok: false };

export async function validateTargetPaths(
  repoRoot: string,
  targets: readonly EffectiveTargetConfig[],
): Promise<ValidateTargetPathsResult> {
  const repoRealpath = await realpath(repoRoot);
  const resolvedTargets = await Promise.all(
    targets.map(async (target) => {
      const targetPath = isAbsolute(target.path) ? target.path : resolve(repoRoot, target.path);
      try {
        const [info, targetRealpath] = await Promise.all([stat(targetPath), realpath(targetPath)]);
        return { info, ok: true as const, target, targetRealpath };
      } catch {
        return {
          error: `targets.${target.name}.path ${target.path} must exist`,
          ok: false as const,
        };
      }
    }),
  );

  const seen = new Map<string, string>();

  for (const resolvedTarget of resolvedTargets) {
    if (!resolvedTarget.ok) {
      return resolvedTarget;
    }

    if (!resolvedTarget.info.isDirectory()) {
      return {
        error: `targets.${resolvedTarget.target.name}.path ${resolvedTarget.target.path} must be a directory`,
        ok: false,
      };
    }

    const repoRelative = relative(repoRealpath, resolvedTarget.targetRealpath);
    const insideRepo =
      repoRelative === "" || (!repoRelative.startsWith("..") && !isAbsolute(repoRelative));
    if (!insideRepo) {
      return {
        error: `targets.${resolvedTarget.target.name}.path ${resolvedTarget.target.path} must resolve inside the Git repository`,
        ok: false,
      };
    }

    const duplicate = seen.get(resolvedTarget.targetRealpath);
    if (duplicate !== undefined) {
      return {
        error: `targets.${resolvedTarget.target.name}.path resolves to the same real directory as targets.${duplicate}.path`,
        ok: false,
      };
    }
    seen.set(resolvedTarget.targetRealpath, resolvedTarget.target.name);
  }

  return { ok: true };
}
