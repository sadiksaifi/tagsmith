import { beforeEach, describe, expect, test, vi } from "vitest";

const fs = vi.hoisted(() => ({
  lstat: vi.fn<(path: string) => Promise<unknown>>(),
  stat: vi.fn<(path: string) => Promise<{ isDirectory(): boolean }>>(),
  writeFile: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));

vi.mock("node:fs/promises", () => fs);

import { inspectInitConfigDestination, writeInitConfigFile } from "@/adapters/fs/init-config-file";

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("inspectInitConfigDestination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.stat.mockResolvedValue({ isDirectory: () => true });
    fs.lstat.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
    fs.writeFile.mockResolvedValue(undefined);
  });

  test("does not start filesystem work when already aborted", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);

    await expect(
      inspectInitConfigDestination("/repo/.tagsmith.jsonc", { signal: controller.signal }),
    ).rejects.toBe(reason);

    expect(fs.stat).not.toHaveBeenCalled();
    expect(fs.lstat).not.toHaveBeenCalled();
  });

  test("aborts destination inspection before checking the config path", async () => {
    const parentStat = deferred<{ isDirectory(): boolean }>();
    const controller = new AbortController();
    const reason = new Error("cancelled");
    fs.stat.mockReturnValue(parentStat.promise);

    const inspected = inspectInitConfigDestination("/repo/.tagsmith.jsonc", {
      signal: controller.signal,
    });

    await vi.waitFor(() => expect(fs.stat).toHaveBeenCalledWith("/repo"));
    controller.abort(reason);

    await expect(inspected).rejects.toBe(reason);
    expect(fs.lstat).not.toHaveBeenCalled();

    parentStat.resolve({ isDirectory: () => true });
  });
});

describe("writeInitConfigFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.stat.mockResolvedValue({ isDirectory: () => true });
    fs.lstat.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
    fs.writeFile.mockResolvedValue(undefined);
  });

  test("uses the abort signal for preflight inspection and does not write after cancellation", async () => {
    const parentStat = deferred<{ isDirectory(): boolean }>();
    const controller = new AbortController();
    const reason = new Error("cancelled");
    fs.stat.mockReturnValue(parentStat.promise);

    const written = writeInitConfigFile({
      destination: "/repo/.tagsmith.jsonc",
      force: false,
      signal: controller.signal,
      template: "{}\n",
    });

    await vi.waitFor(() => expect(fs.stat).toHaveBeenCalledWith("/repo"));
    controller.abort(reason);

    await expect(written).rejects.toBe(reason);
    expect(fs.lstat).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();

    parentStat.resolve({ isDirectory: () => true });
  });
});
