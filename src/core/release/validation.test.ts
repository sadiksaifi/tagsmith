import { describe, expect, test } from "vitest";

import type { EffectiveTargetConfig } from "@/core/config/config";
import { validateExistingRelease } from "@/core/release/release";

const commit = "0123456789abcdef0123456789abcdef01234567";
const otherCommit = "1111111111111111111111111111111111111111";

const appTarget: EffectiveTargetConfig = {
  channels: [
    { name: "rc", strategy: "prerelease" },
    { name: "stable", strategy: "stable", dependsOn: ["rc"] },
  ],
  initialVersion: "1.0.0",
  name: "app",
  path: "apps/app",
  tagMessage: "Release {target} {version} ({tag})",
  tagPattern: "{target}@{version}",
};

const webTarget: EffectiveTargetConfig = {
  ...appTarget,
  name: "web",
  path: "apps/web",
};

function annotated(name: string, peeled = commit) {
  return { annotated: true, name, peeledCommit: peeled } as const;
}

function run(overrides: Partial<Parameters<typeof validateExistingRelease>[0]> = {}) {
  return validateExistingRelease({
    baseBranch: "main",
    localTags: [annotated("app@1.2.0-rc.1"), annotated("app@1.2.0")],
    remote: "origin",
    remoteTags: [annotated("app@1.2.0-rc.1"), annotated("app@1.2.0")],
    tagName: "app@1.2.0",
    targets: [appTarget, webTarget],
    ...overrides,
  });
}

describe("existing release validation", () => {
  test("infers target and channel, validates dependency tags, and returns deterministic facts", () => {
    expect(run()).toEqual({
      ok: true,
      result: {
        target: "app",
        channel: "stable",
        strategy: "stable",
        version: "1.2.0",
        baseVersion: "1.2.0",
        tag: "app@1.2.0",
        tagMessage: "Release app 1.2.0 (app@1.2.0)",
        commit,
        remote: "origin",
        baseBranch: "main",
        valid: true,
      },
    });
  });

  test("supports single-target targetless pattern inference", () => {
    const targetless = {
      ...appTarget,
      channels: [
        { name: "rc", strategy: "prerelease" as const },
        { name: "stable", strategy: "stable" as const },
      ],
      tagPattern: "v{version}",
    };

    expect(
      run({
        localTags: [annotated("v1.2.0")],
        remoteTags: [annotated("v1.2.0")],
        tagName: "v1.2.0",
        targets: [targetless],
      }),
    ).toMatchObject({ ok: true, result: { target: "app", tag: "v1.2.0" } });
  });

  test("enforces target and channel assertions and ambiguous target matches", () => {
    expect(run({ targetName: "missing" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("unknown target missing"),
    });
    expect(run({ targetName: "web" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("does not match target web"),
    });
    expect(run({ channelName: "rc" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("does not match inferred channel stable"),
    });
    expect(run({ tagName: "unknown@1.2.0" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("does not match any configured target"),
    });
    expect(
      run({
        localTags: [annotated("v1.2.0")],
        remoteTags: [annotated("v1.2.0")],
        tagName: "v1.2.0",
        targets: [
          { ...appTarget, tagPattern: "v{version}" },
          { ...webTarget, tagPattern: "v{version}" },
        ],
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("matches multiple targets") });
  });

  test("reports adoption-boundary tags as legacy instead of malformed managed tags", () => {
    const adoptedTarget = { ...appTarget, initialVersion: "2.10.0", tagPattern: "v{version}" };

    expect(
      run({
        localTags: [{ annotated: false, name: "v2.10.0", peeledCommit: commit }],
        remoteTags: [{ annotated: false, name: "v2.10.0", peeledCommit: commit }],
        tagName: "v2.10.0",
        targets: [adoptedTarget],
      }),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("predates Tagsmith adoption boundary"),
    });
  });

  test("rejects invalid incoming tags and local/remote annotation or peeled mismatches", () => {
    expect(run({ tagName: "app@1.2.0+build.1" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("canonical SemVer"),
    });
    expect(run({ tagName: "app@1.2.0-beta.1" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("wrong prerelease shape for channel beta"),
    });
    expect(
      run({
        tagName: "app@1.2.0",
        targets: [{ ...appTarget, channels: [{ name: "rc", strategy: "prerelease" }] }],
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("stable channel is missing") });
    expect(run({ localTags: [annotated("app@1.2.0-rc.1")] })).toMatchObject({
      ok: false,
      error: expect.stringContaining("must exist locally"),
    });
    expect(
      run({
        localTags: [
          annotated("app@1.2.0-rc.1"),
          { annotated: false, name: "app@1.2.0", peeledCommit: commit },
        ],
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("lightweight") });
    expect(
      run({
        remoteTags: [
          annotated("app@1.2.0-rc.1"),
          { annotated: false, name: "app@1.2.0", peeledCommit: commit },
        ],
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("remote annotation") });
    expect(
      run({
        localTags: [annotated("app@1.2.0-rc.1"), annotated("app@1.2.0", otherCommit)],
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("peeled commits differ") });
  });

  test("does not require unrelated valid managed tags to be mirrored during validation", () => {
    expect(
      run({
        localTags: [annotated("app@1.1.0-rc.1"), annotated("app@1.3.0-rc.1")],
        remoteTags: [annotated("app@1.2.0-rc.1"), annotated("app@1.3.0-rc.1")],
        tagName: "app@1.3.0-rc.1",
      }),
    ).toMatchObject({ ok: true, result: { tag: "app@1.3.0-rc.1" } });
  });

  test("scans malformed managed tags and validates direct same-base dependencies against the validated commit", () => {
    expect(
      run({
        localTags: [annotated("app@1.2.0"), annotated("app@1.2.0-rc.1")],
        remoteTags: [annotated("app@1.2.0"), annotated("app@1.2.0-rc.1")],
        tagName: "app@1.2.0-rc.1",
        targets: [
          {
            ...appTarget,
            channels: [
              { name: "stable", strategy: "stable" },
              { name: "rc", strategy: "prerelease", dependsOn: ["stable"] },
            ],
          },
        ],
      }),
    ).toMatchObject({ ok: true });
    expect(run({ localTags: [annotated("app@bad"), annotated("app@1.2.0")] })).toMatchObject({
      ok: false,
      error: expect.stringContaining("malformed managed tag"),
    });
    expect(
      run({ localTags: [annotated("app@1.2.0")], remoteTags: [annotated("app@1.2.0")] }),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("requires dependency tag"),
    });
    expect(
      run({
        localTags: [annotated("app@1.2.0-rc.1", otherCommit), annotated("app@1.2.0")],
        remoteTags: [annotated("app@1.2.0-rc.1", otherCommit), annotated("app@1.2.0")],
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("validated tag commit") });
  });

  test("requires the latest same-base validation dependency to be paired across local and remote", () => {
    expect(
      run({
        localTags: [
          annotated("app@1.2.0-rc.1"),
          annotated("app@1.2.0"),
          annotated("app@1.2.0-rc.2"),
        ],
        remoteTags: [annotated("app@1.2.0-rc.1"), annotated("app@1.2.0")],
      }),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("app@1.2.0-rc.2 must exist locally and remotely"),
    });
    expect(
      run({
        localTags: [annotated("app@1.2.0-rc.1"), annotated("app@1.2.0")],
        remoteTags: [
          annotated("app@1.2.0-rc.1"),
          annotated("app@1.2.0"),
          annotated("app@1.2.0-rc.2"),
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("app@1.2.0-rc.2 must exist locally and remotely"),
    });
  });
});
