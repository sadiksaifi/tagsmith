import { describe, expect, test } from "vitest";

import type { EffectiveTargetConfig } from "@/core/config/config";
import { listConfiguredTags, resolveDryRunRelease } from "@/core/release/release";

const target: EffectiveTargetConfig = {
  channels: [
    { name: "alpha", strategy: "prerelease" },
    { name: "rc", strategy: "prerelease" },
    { name: "stable", strategy: "stable" },
  ],
  initialVersion: "1.0.0",
  name: "app",
  path: "apps/app",
  tagMessage: "Release {target} {version} ({tag})",
  tagPattern: "{target}@{version}",
};

const commit = "0123456789abcdef0123456789abcdef01234567";

function annotated(name: string, peeled = commit) {
  return { annotated: true, name, peeledCommit: peeled } as const;
}

const dependencyTarget: EffectiveTargetConfig = {
  ...target,
  channels: [
    { name: "rc", strategy: "prerelease" },
    { name: "stable", strategy: "stable", dependsOn: ["rc"] },
  ],
};

function run(overrides: Partial<Parameters<typeof resolveDryRunRelease>[0]> = {}) {
  return resolveDryRunRelease({
    channelName: "stable",
    currentHead: commit,
    localTags: [],
    remoteTags: [],
    request: { type: "bump", bump: "patch" },
    target,
    push: false,
    ...overrides,
  });
}

describe("dry-run release resolution", () => {
  test("resolves stable and prerelease bump policies from managed history and initialVersion", () => {
    expect(run()).toMatchObject({ ok: true, version: "1.0.1", tag: "app@1.0.1" });
    expect(
      run({ localTags: [annotated("app@1.2.0")], remoteTags: [annotated("app@1.2.0")] }),
    ).toMatchObject({ ok: true, version: "1.2.1" });
    expect(
      run({
        channelName: "stable",
        localTags: [annotated("app@1.2.0"), annotated("app@1.4.0-rc.1")],
        remoteTags: [annotated("app@1.2.0"), annotated("app@1.4.0-rc.1")],
        request: { type: "bump", bump: "minor" },
      }),
    ).toMatchObject({ ok: true, version: "1.3.0" });
    expect(
      run({
        channelName: "rc",
        request: { type: "bump", bump: "minor" },
        target: {
          ...target,
          channels: target.channels.filter((channel) => channel.name !== "stable"),
        },
      }),
    ).toMatchObject({ ok: true, version: "1.1.0-rc.1", baseVersion: "1.1.0" });
    expect(
      run({
        channelName: "rc",
        localTags: [annotated("app@1.4.0-rc.1")],
        remoteTags: [annotated("app@1.4.0-rc.1")],
        request: { type: "bump", bump: "prerelease" },
        target: {
          ...target,
          channels: target.channels.filter((channel) => channel.name !== "stable"),
        },
      }),
    ).toMatchObject({ ok: true, version: "1.4.0-rc.2" });
  });

  test("validates explicit version policy, duplicate tags, and channel shape", () => {
    expect(run({ request: { type: "version", version: "1.0.0" } })).toMatchObject({
      ok: false,
      error: expect.stringContaining("greater than initialVersion"),
    });
    expect(
      run({
        localTags: [annotated("app@1.0.0")],
        remoteTags: [annotated("app@1.0.0")],
        request: { type: "version", version: "1.0.0" },
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("already exists") });
    expect(
      run({
        localTags: [annotated("app@1.0.0")],
        request: { type: "version", version: "1.0.0" },
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("already exists") });
    expect(
      run({
        remoteTags: [annotated("app@1.0.0")],
        request: { type: "version", version: "1.0.0" },
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("already exists") });
    expect(
      run({
        localTags: [annotated("app@1.2.0")],
        remoteTags: [annotated("app@1.2.0")],
        request: { type: "version", version: "1.1.9" },
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("greater than latest stable") });
    expect(
      run({ channelName: "rc", request: { type: "version", version: "1.2.0-beta.1" } }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("must match channel rc") });
    expect(run({ request: { type: "version", version: "v1.2.3" } })).toMatchObject({
      ok: false,
      error: expect.stringContaining("canonical SemVer"),
    });
  });

  test("ignores lightweight matching tags at or below the adoption boundary", () => {
    const adoptedTarget = { ...target, initialVersion: "2.10.0", tagPattern: "v{version}" };

    expect(
      run({
        localTags: [
          { annotated: false, name: "v2.9.0", peeledCommit: commit },
          { annotated: false, name: "v2.10.0", peeledCommit: commit },
          { annotated: false, name: "v2.10.0+legacy", peeledCommit: commit },
        ],
        remoteTags: [
          { annotated: false, name: "v2.9.0", peeledCommit: commit },
          { annotated: false, name: "v2.10.0", peeledCommit: commit },
          { annotated: false, name: "v2.10.0+legacy", peeledCommit: commit },
        ],
        target: adoptedTarget,
      }),
    ).toMatchObject({ ok: true });
  });

  test("rejects malformed managed history across local and remote tag reads", () => {
    const cases = [
      [
        "lightweight",
        { localTags: [{ annotated: false, name: "app@1.2.0", peeledCommit: commit }] },
      ],
      ["canonical SemVer", { localTags: [annotated("app@v1.2.0")] }],
      ["build metadata", { localTags: [annotated("app@1.2.0+build.1")] }],
      ["prerelease shape", { localTags: [annotated("app@1.2.0-rc")] }],
      [
        "remote annotation",
        { remoteTags: [{ annotated: false, name: "app@1.2.0", peeledCommit: commit }] },
      ],
      [
        "peeled commits differ",
        {
          localTags: [annotated("app@1.2.0", commit)],
          remoteTags: [annotated("app@1.2.0", "1111111111111111111111111111111111111111")],
        },
      ],
    ] as const;

    for (const [message, overrides] of cases) {
      expect(run(overrides)).toMatchObject({ ok: false, error: expect.stringContaining(message) });
    }
  });

  test("allows parallel prerelease channels but rejects backward same-channel lines", () => {
    expect(
      run({
        channelName: "rc",
        localTags: [annotated("app@1.4.0-alpha.1"), annotated("app@1.3.0-rc.1")],
        remoteTags: [annotated("app@1.4.0-alpha.1"), annotated("app@1.3.0-rc.1")],
        request: { type: "version", version: "1.4.0-rc.1" },
      }),
    ).toMatchObject({ ok: true });
    expect(
      run({
        channelName: "rc",
        localTags: [annotated("app@1.4.0-rc.2")],
        remoteTags: [annotated("app@1.4.0-rc.2")],
        request: { type: "version", version: "1.3.0-rc.5" },
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("greater than latest rc") });
  });

  test("covers additional failure boundaries without reinterpreting history", () => {
    expect(run({ channelName: "missing" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("unknown channel"),
    });
    expect(
      run({
        localTags: [annotated("other@not-semver")],
        remoteTags: [annotated("other@not-semver")],
      }),
    ).toMatchObject({ ok: true });
    expect(run({ remoteTags: [annotated("app@1.2.0")] })).toMatchObject({
      ok: true,
      version: "1.2.1",
    });
    expect(run({ localTags: [annotated("app@1.2.0")] })).toMatchObject({
      ok: true,
      version: "1.2.1",
    });
    expect(
      run({
        localTags: [annotated("app@1.0.1")],
        remoteTags: [annotated("app@1.0.1")],
      }),
    ).toMatchObject({ ok: true, version: "1.0.2" });
    expect(
      run({ channelName: "stable", request: { type: "version", version: "1.2.0-rc.1" } }),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("stable SemVer"),
    });
    expect(run({ channelName: "rc", request: { type: "bump", bump: "prerelease" } })).toMatchObject(
      {
        ok: false,
        error: expect.stringContaining("no existing rc prerelease"),
      },
    );
    expect(
      run({
        channelName: "rc",
        localTags: [annotated("app@1.2.0")],
        remoteTags: [annotated("app@1.2.0")],
        request: { type: "version", version: "1.2.0-rc.1" },
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("greater than latest stable") });
    expect(
      run({
        channelName: "rc",
        request: { type: "version", version: "1.0.0-rc.1" },
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("greater than initialVersion") });
    expect(
      run({
        channelName: "rc",
        request: { type: "version", version: "0.9.9-rc.1" },
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("initialVersion") });
    expect(run({ request: { type: "version", version: "0.9.9" } })).toMatchObject({
      ok: false,
      error: expect.stringContaining("initialVersion"),
    });
    expect(
      run({
        request: { type: "bump", bump: "patch" },
        target: { ...target, initialVersion: "not-semver" },
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("failed to resolve") });
    expect(
      run({
        channelName: "stable",
        target: { ...target, channels: [{ name: "rc", strategy: "prerelease" }] },
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("unknown channel") });
  });

  test("validates direct same-base dependencies against current HEAD", () => {
    expect(
      run({
        localTags: [annotated("app@1.2.0")],
        remoteTags: [annotated("app@1.2.0")],
        request: { type: "version", version: "1.2.1" },
        target: dependencyTarget,
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("requires dependency tag") });
    expect(
      run({
        localTags: [annotated("app@1.2.0-rc.1")],
        remoteTags: [annotated("app@1.2.0-rc.1")],
        request: { type: "version", version: "1.2.0" },
        target: dependencyTarget,
      }),
    ).toMatchObject({ ok: true });
    expect(
      run({
        localTags: [annotated("app@1.2.0-rc.1")],
        request: { type: "version", version: "1.2.0" },
        target: dependencyTarget,
      }),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("must exist locally and remotely"),
    });
    expect(
      run({
        remoteTags: [annotated("app@1.2.0-rc.1")],
        request: { type: "version", version: "1.2.0" },
        target: dependencyTarget,
      }),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("must exist locally and remotely"),
    });
    expect(
      run({
        request: { type: "version", version: "1.2.0" },
        target: {
          ...target,
          channels: [
            { name: "rc", strategy: "prerelease" },
            { name: "stable", strategy: "stable", dependsOn: ["missing"] },
          ],
        },
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("depends on missing channel") });
    expect(
      run({
        localTags: [annotated("app@1.2.0-rc.1", "1111111111111111111111111111111111111111")],
        remoteTags: [annotated("app@1.2.0-rc.1", "1111111111111111111111111111111111111111")],
        request: { type: "version", version: "1.2.0" },
        target: dependencyTarget,
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("current HEAD") });
  });
});

describe("configured tag listing", () => {
  test("classifies a managed tag that exists locally and remotely", () => {
    expect(
      listConfiguredTags({
        localTags: [annotated("app@1.2.0")],
        remoteTags: [annotated("app@1.2.0")],
        targets: [target],
      }),
    ).toEqual({
      ok: true,
      tags: [
        {
          channel: "stable",
          commit,
          legacy: false,
          local: true,
          remote: true,
          status: "local+remote",
          tag: "app@1.2.0",
          target: "app",
          version: "1.2.0",
        },
      ],
    });
  });

  test("sorts listed tags by target name then SemVer descending", () => {
    const apiTarget = { ...target, name: "api" };

    expect(
      listConfiguredTags({
        localTags: [
          annotated("app@1.2.0"),
          annotated("api@1.0.1"),
          annotated("api@1.1.0-rc.1"),
          annotated("api@1.1.0"),
        ],
        remoteTags: [
          annotated("app@1.2.0"),
          annotated("api@1.0.1"),
          annotated("api@1.1.0-rc.1"),
          annotated("api@1.1.0"),
        ],
        targets: [target, apiTarget],
      }),
    ).toMatchObject({
      ok: true,
      tags: [
        { tag: "api@1.1.0", target: "api", version: "1.1.0" },
        { tag: "api@1.1.0-rc.1", target: "api", version: "1.1.0-rc.1" },
        { tag: "api@1.0.1", target: "api", version: "1.0.1" },
        { tag: "app@1.2.0", target: "app", version: "1.2.0" },
      ],
    });
  });

  test("lists lightweight tags at the adoption boundary as legacy", () => {
    const adoptedTarget = { ...target, initialVersion: "1.2.0", tagPattern: "v{version}" };

    expect(
      listConfiguredTags({
        localTags: [{ annotated: false, name: "v1.2.0", peeledCommit: commit }],
        remoteTags: [{ annotated: false, name: "v1.2.0", peeledCommit: commit }],
        targets: [adoptedTarget],
      }),
    ).toEqual({
      ok: true,
      tags: [
        {
          channel: "stable",
          commit,
          legacy: true,
          local: true,
          remote: true,
          status: "legacy local+remote",
          tag: "v1.2.0",
          target: "app",
          version: "1.2.0",
        },
      ],
    });
  });

  test("filters listed tags to a requested target", () => {
    const apiTarget = { ...target, name: "api" };

    expect(
      listConfiguredTags({
        localTags: [annotated("app@1.2.0"), annotated("api@1.3.0")],
        remoteTags: [annotated("app@1.2.0"), annotated("api@1.3.0")],
        targetName: "api",
        targets: [target, apiTarget],
      }),
    ).toMatchObject({
      ok: true,
      tags: [{ tag: "api@1.3.0", target: "api" }],
    });

    expect(
      listConfiguredTags({
        localTags: [],
        remoteTags: [],
        targetName: "missing",
        targets: [target, apiTarget],
      }),
    ).toEqual({ error: "unknown target missing", ok: false });
  });

  test("filters listed tags to a requested channel", () => {
    expect(
      listConfiguredTags({
        channelName: "rc",
        localTags: [annotated("app@1.2.0"), annotated("app@1.3.0-rc.1")],
        remoteTags: [annotated("app@1.2.0"), annotated("app@1.3.0-rc.1")],
        targets: [target],
      }),
    ).toMatchObject({
      ok: true,
      tags: [{ channel: "rc", tag: "app@1.3.0-rc.1" }],
    });

    expect(
      listConfiguredTags({
        channelName: "missing",
        localTags: [],
        remoteTags: [],
        targets: [target],
      }),
    ).toEqual({ error: "unknown channel missing", ok: false });
  });
});
