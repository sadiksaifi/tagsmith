import { resolve } from "node:path";

import { beforeEach, describe, expect, test, vi } from "vitest";

const fs = vi.hoisted(() => ({
  realpath: vi.fn<(path: string) => Promise<string>>(),
  stat: vi.fn<(path: string) => Promise<{ isDirectory(): boolean }>>(),
}));

vi.mock("node:fs/promises", () => fs);

import { validateTargetPaths } from "@/adapters/fs/target-paths";
import type { EffectiveTargetConfig } from "@/core/config/config";

function target(name: string, path: string): EffectiveTargetConfig {
  return {
    channels: [{ name: "prod", strategy: "stable" }],
    initialVersion: "0.0.0",
    name,
    path,
    tagMessage: "Release {target} {version}",
    tagPattern: "{target}@{version}",
  };
}

describe("validateTargetPaths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.realpath.mockImplementation(async (path) => path);
    fs.stat.mockResolvedValue({ isDirectory: () => true });
  });

  test("does not start filesystem work when already aborted", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);

    await expect(
      validateTargetPaths("/repo", [target("api", "apps/api")], { signal: controller.signal }),
    ).rejects.toBe(reason);

    expect(fs.realpath).not.toHaveBeenCalled();
    expect(fs.stat).not.toHaveBeenCalled();
  });

  test("aborts before validating queued target paths", async () => {
    const repoRoot = "/repo";
    const firstTargetPath = resolve(repoRoot, "apps/api");
    const secondTargetPath = resolve(repoRoot, "apps/web");
    const controller = new AbortController();
    const reason = new Error("cancelled");
    const statCalls: string[] = [];

    fs.stat.mockImplementation(async (path) => {
      statCalls.push(path);
      if (path === firstTargetPath) {
        controller.abort(reason);
      }
      return { isDirectory: () => true };
    });

    await expect(
      validateTargetPaths(repoRoot, [target("api", "apps/api"), target("web", "apps/web")], {
        signal: controller.signal,
      }),
    ).rejects.toBe(reason);

    expect(statCalls).toEqual([firstTargetPath]);
    expect(statCalls).not.toContain(secondTargetPath);
  });
});
