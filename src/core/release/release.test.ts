import { describe, expect, test } from "vitest";

import type { EffectiveTargetConfig } from "@/core/config/config";
import { resolveDryRunRelease } from "@/core/release/release";

const target: EffectiveTargetConfig = {
  channels: [
    { name: "alpha", strategy: "prerelease" },
    { name: "rc", strategy: "prerelease" },
    { name: "prod", strategy: "stable" },
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
    { name: "prod", strategy: "stable", dependsOn: ["rc"] },
  ],
};

function run(overrides: Partial<Parameters<typeof resolveDryRunRelease>[0]> = {}) {
  return resolveDryRunRelease({
    channelName: "prod",
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
        channelName: "prod",
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
          channels: target.channels.filter((channel) => channel.name !== "prod"),
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
          channels: target.channels.filter((channel) => channel.name !== "prod"),
        },
      }),
    ).toMatchObject({ ok: true, version: "1.4.0-rc.2" });
  });

  test("validates explicit version policy, duplicate tags, and channel shape", () => {
    expect(run({ request: { type: "version", version: "1.0.0" } })).toMatchObject({
      ok: true,
      version: "1.0.0",
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

  test("rejects malformed managed history across local and remote tag reads", () => {
    const cases = [
      [
        "lightweight",
        { localTags: [{ annotated: false, name: "app@1.2.0", peeledCommit: commit }] },
      ],
      ["canonical SemVer", { localTags: [annotated("app@v1.2.0")] }],
      ["build metadata", { localTags: [annotated("app@1.2.0+build.1")] }],
      ["prerelease shape", { localTags: [annotated("app@1.2.0-rc")] }],
      ["below initialVersion", { localTags: [annotated("app@0.9.9")] }],
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
      ok: false,
      error: expect.stringContaining("missing from local"),
    });
    expect(run({ localTags: [annotated("app@1.2.0")] })).toMatchObject({
      ok: false,
      error: expect.stringContaining("missing from remote"),
    });
    expect(
      run({
        localTags: [annotated("app@1.0.1")],
        remoteTags: [annotated("app@1.0.1")],
      }),
    ).toMatchObject({ ok: true, version: "1.0.2" });
    expect(
      run({ channelName: "prod", request: { type: "version", version: "1.2.0-rc.1" } }),
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
        channelName: "prod",
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
        request: { type: "version", version: "1.2.0" },
        target: {
          ...target,
          channels: [
            { name: "rc", strategy: "prerelease" },
            { name: "prod", strategy: "stable", dependsOn: ["missing"] },
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
