import { readFile } from "node:fs/promises";

import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, test } from "vitest";

const schemaUrl =
  "https://raw.githubusercontent.com/sadiksaifi/tagsmith/refs/heads/main/schema/v1.json";

type Channel = {
  dependsOn?: string[];
  name: string;
  strategy: "prerelease" | "stable";
};

type Target = {
  channels: Channel[];
  initialVersion?: string;
  path: string;
  tagMessage?: string;
  tagPattern?: string;
};

type Config = {
  $schema: string;
  configVersion: 1;
  defaults: {
    initialVersion: string;
    tagMessage: string;
    tagPattern: string;
  };
  git: { baseBranch: string; remote: string };
  targets: Record<string, Target>;
};

type SingleTargetConfig = Config & { targets: { app: Target } };

function singleTargetConfig(): SingleTargetConfig {
  return {
    $schema: schemaUrl,
    configVersion: 1,
    git: { remote: "origin", baseBranch: "main" },
    defaults: {
      tagPattern: "v{version}",
      tagMessage: "Release {version}",
      initialVersion: "0.0.0",
    },
    targets: {
      app: {
        path: ".",
        channels: [{ name: "prod", strategy: "stable" }],
      },
    },
  };
}

function multiTargetConfig(): Config {
  return {
    $schema: schemaUrl,
    configVersion: 1,
    git: { remote: "origin", baseBranch: "release/1.x" },
    defaults: {
      tagPattern: "{target}@{version}",
      tagMessage: "Release {target} {version} ({tag})",
      initialVersion: "0.0.0",
    },
    targets: {
      api: {
        path: "apps/api",
        channels: [
          { name: "alpha", strategy: "prerelease" },
          { name: "prod", strategy: "stable", dependsOn: ["alpha"] },
        ],
      },
      web: {
        path: "apps/web",
        tagPattern: "web-v{version}",
        tagMessage: "Release web {version}",
        initialVersion: "1.0.0",
        channels: [{ name: "prod", strategy: "stable" }],
      },
    },
  };
}

async function loadValidator() {
  const schema = JSON.parse(
    await readFile(new URL("../../schema/v1.json", import.meta.url), "utf8"),
  );
  const ajv = new Ajv2020({ strict: true });
  return ajv.compile(schema);
}

describe("schema/v1.json", () => {
  test("accepts representative valid single-target and multi-target configs", async () => {
    const validate = await loadValidator();

    expect(validate(singleTargetConfig())).toBe(true);
    expect(validate(multiTargetConfig())).toBe(true);
  });

  test("rejects invalid initialVersion examples in defaults and target overrides", async () => {
    const validate = await loadValidator();

    for (const initialVersion of [
      "v1.2.3",
      "1.2.3-rc.1",
      "1.2.3+build.1",
      "01.2.3",
      "1.02.3",
      "1.2.03",
    ]) {
      const config = singleTargetConfig();
      config.defaults.initialVersion = initialVersion;
      expect(validate(config), initialVersion).toBe(false);
    }

    const targetOverride = singleTargetConfig();
    targetOverride.targets.app.initialVersion = "1.2.3-rc.1";
    expect(validate(targetOverride)).toBe(false);
  });

  test("rejects invalid tagPattern examples in defaults and target overrides", async () => {
    const validate = await loadValidator();

    for (const tagPattern of [
      "release",
      "{target}@{version}-{version}",
      "{target}-{target}@{version}",
      "{target}@{channel}-{version}",
      "release/{version}",
      "release {version}",
      "Release-{version}",
      "{target}@{version}+build",
    ]) {
      const config = singleTargetConfig();
      config.defaults.tagPattern = tagPattern;
      expect(validate(config), tagPattern).toBe(false);
    }

    const targetOverride = singleTargetConfig();
    targetOverride.targets.app.tagPattern = "app/{version}";
    expect(validate(targetOverride)).toBe(false);
  });

  test("rejects invalid tagMessage placeholders and control characters", async () => {
    const validate = await loadValidator();

    for (const tagMessage of [
      "Release {channel} {version}",
      "Release {version}\n",
      "Release {version}\u0007",
      "Release {version}\u0085",
    ]) {
      const config = singleTargetConfig();
      config.defaults.tagMessage = tagMessage;
      expect(validate(config), JSON.stringify(tagMessage)).toBe(false);
    }

    const targetOverride = singleTargetConfig();
    targetOverride.targets.app.tagMessage = "Release {sha}";
    expect(validate(targetOverride)).toBe(false);
  });

  test("constrains channel definitions to exactly one stable channel where statically expressible", async () => {
    const validate = await loadValidator();

    const noStable = singleTargetConfig();
    noStable.targets.app.channels = [{ name: "rc", strategy: "prerelease" }];
    expect(validate(noStable)).toBe(false);

    const multipleStable = singleTargetConfig();
    multipleStable.targets.app.channels = [
      { name: "prod", strategy: "stable" },
      { name: "latest", strategy: "stable" },
    ];
    expect(validate(multipleStable)).toBe(false);
  });

  test("documents important runtime-only v1 config constraints", async () => {
    const schema = JSON.parse(
      await readFile(new URL("../../schema/v1.json", import.meta.url), "utf8"),
    );

    expect(schema.$comment).toContain("Runtime-only");
    expect(schema.$comment).toContain("channel dependency");
    expect(schema.$comment).toContain("multi-target tag-pattern ambiguity");
  });
});
