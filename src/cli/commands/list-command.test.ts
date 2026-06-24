import { beforeEach, describe, expect, test, vi } from "vitest";

const adapters = vi.hoisted(() => ({
  loadConfigFile: vi.fn(),
  readLocalTags: vi.fn(),
  readRemoteTags: vi.fn(),
  resolveCommandContext: vi.fn(),
  validateTargetPaths: vi.fn(),
}));

vi.mock("@/adapters/fs/config-file", () => ({ loadConfigFile: adapters.loadConfigFile }));
vi.mock("@/adapters/fs/target-paths", () => ({
  validateTargetPaths: adapters.validateTargetPaths,
}));
vi.mock("@/adapters/git/process-git", () => ({
  readLocalTags: adapters.readLocalTags,
  readRemoteTags: adapters.readRemoteTags,
}));
vi.mock("@/cli/command-context", () => ({
  resolveCommandContext: adapters.resolveCommandContext,
}));

import { runListCommand } from "@/cli/commands/list-command";
import type { CliOutput } from "@/cli/output/create-output";
import type { ProgressPhase, ProgressReporter } from "@/cli/output/progress";
import type { EffectiveTargetConfig, TagsmithConfig } from "@/core/config/config";

class RecordingOutput implements CliOutput {
  errors: string[] = [];

  error(message: string): void {
    this.errors.push(message);
  }

  human(): void {}

  verbose(): void {}

  warn(): void {}

  writeJson(): void {}

  writeRaw(): void {}
}

class NoopProgressReporter implements ProgressReporter {
  async phase<T>(_label: string, task: (phase: ProgressPhase) => Promise<T>): Promise<T> {
    return task({ fail: () => {}, signal: new AbortController().signal });
  }
}

const target: EffectiveTargetConfig = {
  channels: [
    { name: "stable", strategy: "stable" },
    { name: "rc", strategy: "prerelease" },
  ],
  initialVersion: "1.0.0",
  name: "app",
  path: "packages/app",
  tagMessage: "Release {tag}",
  tagPattern: "app@{version}",
};

const brokenTarget: EffectiveTargetConfig = {
  channels: [{ name: "stable", strategy: "stable" }],
  initialVersion: "1.0.0",
  name: "broken",
  path: "packages/missing",
  tagMessage: "Release {tag}",
  tagPattern: "broken@{version}",
};

const config: TagsmithConfig = {
  configVersion: 1,
  defaults: {
    initialVersion: "1.0.0",
    tagMessage: "Release {tag}",
    tagPattern: "{target}@{version}",
  },
  git: {
    baseBranch: "main",
    remote: "origin",
  },
  targets: {
    app: {
      channels: target.channels,
      path: target.path,
    },
  },
};

async function runList(flags: Readonly<Record<string, boolean | string>>) {
  const output = new RecordingOutput();
  const exitCode = await runListCommand({
    configPath: undefined,
    cwd: "/repo",
    flags,
    output,
    progress: new NoopProgressReporter(),
  });

  return { exitCode, output };
}

describe("runListCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adapters.resolveCommandContext.mockResolvedValue({
      configPath: "/repo/.tagsmith.jsonc",
      ok: true,
      repoRoot: "/repo",
    });
    adapters.loadConfigFile.mockResolvedValue({
      config,
      effectiveTargets: [target],
      ok: true,
      warnings: [],
    });
    adapters.validateTargetPaths.mockResolvedValue({
      error: "target path missing",
      ok: false,
    });
    adapters.readLocalTags.mockResolvedValue({
      ok: true,
      tags: [],
    });
    adapters.readRemoteTags.mockResolvedValue({
      error: "remote unreachable",
      ok: false,
    });
  });

  test("reports an unknown target before target path or Git tag reads can mask it", async () => {
    const result = await runList({ "--target": "missing" });

    expect(result.exitCode).toBe(1);
    expect(result.output.errors).toEqual(["unknown target missing"]);
    expect(adapters.validateTargetPaths).not.toHaveBeenCalled();
    expect(adapters.readLocalTags).not.toHaveBeenCalled();
    expect(adapters.readRemoteTags).not.toHaveBeenCalled();
  });

  test("reports an unknown channel before target path or Git tag reads can mask it", async () => {
    const result = await runList({ "--channel": "missing" });

    expect(result.exitCode).toBe(1);
    expect(result.output.errors).toEqual(["unknown channel missing"]);
    expect(adapters.validateTargetPaths).not.toHaveBeenCalled();
    expect(adapters.readLocalTags).not.toHaveBeenCalled();
    expect(adapters.readRemoteTags).not.toHaveBeenCalled();
  });

  test("validates only the requested target path", async () => {
    adapters.loadConfigFile.mockResolvedValue({
      config,
      effectiveTargets: [target, brokenTarget],
      ok: true,
      warnings: [],
    });
    adapters.validateTargetPaths.mockImplementation(
      async (_repoRoot: string, targets: readonly EffectiveTargetConfig[]) =>
        targets.some((configuredTarget) => configuredTarget.name === "broken")
          ? { error: "target path missing", ok: false }
          : { ok: true },
    );

    const result = await runList({ "--local": true, "--target": "app" });

    expect(result.exitCode).toBe(0);
    expect(result.output.errors).toEqual([]);
  });
});
