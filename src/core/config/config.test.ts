import { describe, expect, test } from "vitest";

import { parseConfigText, validateConfig } from "@/core/config/config";

const validConfig = `{
  // comments are allowed
  "$schema": "https://raw.githubusercontent.com/sadiksaifi/tagsmith/refs/heads/main/schema/v1.json",
  "configVersion": 1,
  "git": { "remote": "origin", "baseBranch": "main" },
  "defaults": {
    "tagPattern": "{target}@{version}",
    "tagMessage": "Release {target} {version}",
    "initialVersion": "0.0.0",
  },
  "targets": {
    "api": {
      "path": "apps/api",
      "channels": [
        { "name": "alpha", "strategy": "prerelease" },
        { "name": "rc", "strategy": "prerelease", "dependsOn": ["alpha"] },
        { "name": "prod", "strategy": "stable", "dependsOn": ["rc"] },
      ],
    },
  },
}`;

function expectInvalid(text: string, message: string) {
  const parsed = parseConfigText(text, "/repo/.tagsmith.jsonc");
  if (!parsed.ok) {
    expect(parsed.error).toContain(message);
    return;
  }

  const validated = validateConfig(parsed.config, "/repo/.tagsmith.jsonc");

  expect(validated.ok).toBe(false);
  if (!validated.ok) {
    expect(validated.error).toContain(message);
  }
}

describe("config parsing and semantic validation", () => {
  test("accepts JSONC comments and trailing commas while preserving parsed config", () => {
    const parsed = parseConfigText(validConfig, "/repo/.tagsmith.jsonc");

    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) {
      return;
    }

    const validated = validateConfig(parsed.config, "/repo/.tagsmith.jsonc");

    expect(validated).toMatchObject({ ok: true });
    if (validated.ok) {
      expect(Object.keys(validated.config.targets)).toEqual(["api"]);
      expect(validated.config.targets.api?.channels.map((channel) => channel.name)).toEqual([
        "alpha",
        "rc",
        "prod",
      ]);
    }
  });

  test("rejects malformed JSONC and duplicate object keys", () => {
    expect(parseConfigText("{", "/repo/.tagsmith.jsonc")).toMatchObject({
      ok: false,
      error: expect.stringContaining("malformed JSONC"),
    });

    expect(
      parseConfigText('{ "configVersion": 1, "configVersion": 1 }', "/repo/.tagsmith.jsonc"),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("duplicate key configVersion"),
    });
  });

  test("rejects unknown keys and required top-level shape violations", () => {
    expectInvalid(validConfig.replace('"targets": {', '"extra": true, "targets": {'), "extra");
    expectInvalid(validConfig.replace('"configVersion": 1', '"configVersion": 2'), "configVersion");
    expectInvalid(
      validConfig.replace('"git": { "remote"', '"git": { "url": "x", "remote"'),
      "git.url",
    );
    expectInvalid(validConfig.replace('"api": {', '"Bad": {'), "targets.Bad");
  });

  test("enforces repo-wide git policy shape without target-level git config", () => {
    expectInvalid(
      validConfig.replace('"remote": "origin"', '"remote": "origin/main"'),
      "git.remote",
    );
    expectInvalid(
      validConfig.replace('"baseBranch": "main"', '"baseBranch": "origin/main"'),
      "git.baseBranch",
    );
    expectInvalid(
      validConfig.replace(
        '"path": "apps/api"',
        '"git": { "remote": "upstream" }, "path": "apps/api"',
      ),
      "git",
    );
  });

  test("validates channels, direct dependencies, stable-only targets, missing refs, self-dependencies, and cycles", () => {
    const stableOnly = validConfig.replace(
      `"channels": [
        { "name": "alpha", "strategy": "prerelease" },
        { "name": "rc", "strategy": "prerelease", "dependsOn": ["alpha"] },
        { "name": "prod", "strategy": "stable", "dependsOn": ["rc"] },
      ]`,
      `"channels": [{ "name": "prod", "strategy": "stable" }]`,
    );
    expect(validateConfig(parseOk(stableOnly), "/repo/.tagsmith.jsonc")).toMatchObject({
      ok: true,
    });

    expectInvalid(
      validConfig.replace('"prod", "strategy": "stable"', '"alpha", "strategy": "stable"'),
      "duplicate channel",
    );
    expectInvalid(
      validConfig.replace('"prod", "strategy": "stable"', '"prod", "strategy": "prerelease"'),
      "exactly one stable",
    );
    expectInvalid(validConfig.replace('["rc"]', '["missing"]'), "missing");
    expectInvalid(
      validConfig.replace(
        '{ "name": "alpha", "strategy": "prerelease" }',
        '{ "name": "alpha", "strategy": "prerelease", "dependsOn": ["prod"] }',
      ),
      "cycle",
    );
    expectInvalid(validConfig.replace('"dependsOn": ["alpha"]', '"dependsOn": ["rc"]'), "self");
  });

  test("validates tag patterns, messages, multi-target ambiguity, and warnings", () => {
    const ambiguousMultiTarget = validConfig
      .replace('"api": {', '"api": {')
      .replace(
        `    },
  },`,
        `    },
    "web": {
      "path": "apps/web",
      "channels": [{ "name": "prod", "strategy": "stable" }]
    },
  },`,
      )
      .replace("{target}@{version}", "v{version}");
    expectInvalid(ambiguousMultiTarget, "ambiguous");
    expectInvalid(
      validConfig.replace("{target}@{version}", "{target}@{version}-{version}"),
      "exactly one {version}",
    );
    expectInvalid(
      validConfig.replace("{target}@{version}", "{target}@{channel}"),
      "unsupported placeholder",
    );
    expectInvalid(validConfig.replace("{target}@{version}", "release/{version}"), "tagPattern");
    expectInvalid(
      validConfig.replace("Release {target} {version}", "Release {channel}"),
      "unsupported placeholder",
    );
    expectInvalid(
      validConfig.replace("Release {target} {version}", "Release\\n{version}"),
      "single-line",
    );

    const parsed = parseOk(validConfig.replace("{target}@{version}", "{target}{version}"));
    const validated = validateConfig(parsed, "/repo/.tagsmith.jsonc");

    expect(validated).toMatchObject({ ok: true });
    if (validated.ok) {
      expect(validated.warnings.join("\n")).toContain("touches");
    }
  });

  test("validates SemVer boundary policy for initialVersion", () => {
    for (const version of ["1.2.3+build.5", "v1.2.3", "01.2.3", "1.2.3-rc.0", "1.2.3-rc.1"]) {
      expectInvalid(
        validConfig.replace('"initialVersion": "0.0.0"', `"initialVersion": "${version}"`),
        "initialVersion",
      );
    }
  });
});

function parseOk(text: string) {
  const parsed = parseConfigText(text, "/repo/.tagsmith.jsonc");
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.config;
}
