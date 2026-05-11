import { describe, expect, test } from "vitest";

import { parseConfigText, schemaUrl, validateConfig } from "@/core/config/config";
import { initConfigTemplate } from "@/core/init/init-template";

const expectedTemplate = `{
  "$schema": "https://tagsmith.sadiksaifi.dev/schema/v1.json",
  "configVersion": 1,

  // Repository-wide Git policy.
  // Tagsmith uses this remote to read/push tags and this branch to verify
  // release tags are on the expected release line.
  "git": {
    "remote": "origin",
    "baseBranch": "main",
  },

  // Values inherited by every target unless that target overrides them.
  "defaults": {
    // Tag pattern for generated release tags.
    // Available placeholders: {target}, {version}
    // Prerelease channel names are encoded into {version}.
    // Example: api@1.2.3-rc.1
    "tagPattern": "{target}@{version}",

    // Message used when creating annotated git tags.
    // Available placeholders: {target}, {version}, {tag}
    "tagMessage": "Release {target} {version}",

    // Declared minimum managed baseline and bump baseline.
    "initialVersion": "0.0.0",
  },

  // Releasable units in this repository.
  // Edit target names and paths to match your project.
  "targets": {
    "web": {
      "path": "apps/web",
      "channels": [
        { "name": "alpha", "strategy": "prerelease" },
        { "name": "beta", "strategy": "prerelease", "dependsOn": ["alpha"] },
        { "name": "rc", "strategy": "prerelease", "dependsOn": ["beta"] },
        { "name": "stable", "strategy": "stable", "dependsOn": ["rc"] },
      ],
    },

    "api": {
      "path": "apps/api",
      "channels": [
        { "name": "alpha", "strategy": "prerelease" },
        { "name": "beta", "strategy": "prerelease", "dependsOn": ["alpha"] },
        { "name": "rc", "strategy": "prerelease", "dependsOn": ["beta"] },
        { "name": "stable", "strategy": "stable", "dependsOn": ["rc"] },
      ],
    },

    "auth": {
      "path": "packages/auth",

      // Optional target-specific overrides:
      // "tagPattern": "pkg-auth@{version}",
      // "tagMessage": "Release auth package {version}",
      // "initialVersion": "1.0.0",

      "channels": [
        { "name": "alpha", "strategy": "prerelease" },
        { "name": "beta", "strategy": "prerelease", "dependsOn": ["alpha"] },
        { "name": "rc", "strategy": "prerelease", "dependsOn": ["beta"] },
        { "name": "stable", "strategy": "stable", "dependsOn": ["rc"] },
      ],
    },
  },
}
`;

describe("init config template", () => {
  test("emits the deterministic documented template bytes", () => {
    expect(initConfigTemplate).toBe(expectedTemplate);
    expect(initConfigTemplate.endsWith("\n")).toBe(true);
  });

  test("is valid JSONC config without requiring example target paths to exist", () => {
    const parsed = parseConfigText(initConfigTemplate, ".tagsmith.jsonc");

    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }

    const validated = validateConfig(parsed.config, ".tagsmith.jsonc");
    expect(validated).toMatchObject({ ok: true });
    if (!validated.ok) {
      throw new Error(validated.error);
    }

    expect(parsed.config.$schema).toBe(schemaUrl);
    expect(parsed.config.configVersion).toBe(1);
    expect(parsed.config.git).toEqual({ remote: "origin", baseBranch: "main" });
    expect(parsed.config.defaults).toEqual({
      tagPattern: "{target}@{version}",
      tagMessage: "Release {target} {version}",
      initialVersion: "0.0.0",
    });
    expect(Object.keys(parsed.config.targets)).toEqual(["web", "api", "auth"]);
    expect(parsed.config.targets.web?.path).toBe("apps/web");
    expect(parsed.config.targets.api?.path).toBe("apps/api");
    expect(parsed.config.targets.auth?.path).toBe("packages/auth");
  });
});
