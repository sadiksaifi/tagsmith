import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import type { EffectiveTargetConfig } from "@/core/config/config";

export type ValidateTargetPathsResult =
  | { readonly ok: true }
  | { readonly error: string; readonly ok: false };

export interface ValidateTargetPathsOptions {
  readonly signal?: AbortSignal | undefined;
}

export async function validateTargetPaths(
  repoRoot: string,
  targets: readonly EffectiveTargetConfig[],
  options: ValidateTargetPathsOptions = {},
): Promise<ValidateTargetPathsResult> {
  const repoRealpath = await abortable(() => realpath(repoRoot), options.signal);
  const seen = new Map<string, string>();

  for (const target of targets) {
    throwIfAborted(options.signal);

    const targetPath = isAbsolute(target.path) ? target.path : resolve(repoRoot, target.path);
    let info: Awaited<ReturnType<typeof stat>>;
    let targetRealpath: string;
    try {
      // oxlint-disable-next-line no-await-in-loop -- target validation must stay sequential so cancellation does not queue more filesystem work.
      info = await abortable(() => stat(targetPath), options.signal);
      throwIfAborted(options.signal);
      // oxlint-disable-next-line no-await-in-loop -- target validation must stay sequential so cancellation does not queue more filesystem work.
      targetRealpath = await abortable(() => realpath(targetPath), options.signal);
      throwIfAborted(options.signal);
    } catch {
      if (options.signal?.aborted === true) {
        throw abortReason(options.signal);
      }

      return {
        error: `targets.${target.name}.path ${target.path} must exist`,
        ok: false,
      };
    }

    if (!info.isDirectory()) {
      return {
        error: `targets.${target.name}.path ${target.path} must be a directory`,
        ok: false,
      };
    }

    const repoRelative = relative(repoRealpath, targetRealpath);
    const insideRepo =
      repoRelative === "" || (!repoRelative.startsWith("..") && !isAbsolute(repoRelative));
    if (!insideRepo) {
      return {
        error: `targets.${target.name}.path ${target.path} must resolve inside the Git repository`,
        ok: false,
      };
    }

    const duplicate = seen.get(targetRealpath);
    if (duplicate !== undefined) {
      return {
        error: `targets.${target.name}.path resolves to the same real directory as targets.${duplicate}.path`,
        ok: false,
      };
    }
    seen.set(targetRealpath, target.name);
  }

  return { ok: true };
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
