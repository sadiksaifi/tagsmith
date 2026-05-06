import { describe, expect, test } from "vitest";

import type { EffectiveTargetConfig } from "@/core/config/config";
import { validateExistingRelease } from "@/core/release/release";

const commit = "0123456789abcdef0123456789abcdef01234567";
const otherCommit = "1111111111111111111111111111111111111111";

const appTarget: EffectiveTargetConfig = {
  channels: [
    { name: "rc", strategy: "prerelease" },
    { name: "prod", strategy: "stable", dependsOn: ["rc"] },
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
        channel: "prod",
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
        { name: "prod", strategy: "stable" as const },
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
    expect(run({ targetName: "web" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("does not match target web"),
    });
    expect(run({ channelName: "rc" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("does not match inferred channel prod"),
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

  test("rejects invalid incoming tags and local/remote annotation or peeled mismatches", () => {
    expect(run({ tagName: "app@1.2.0+build.1" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("canonical SemVer"),
    });
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

  test("scans malformed managed tags and validates direct same-base dependencies against the validated commit", () => {
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
});
