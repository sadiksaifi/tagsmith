import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { runCli } from "@/cli/create-cli";

import { git, withPoisonedGitLocalEnv } from "../helpers/git";

class MemoryWriter {
  text = "";

  write(chunk: string): boolean {
    this.text += chunk;
    return true;
  }
}

async function run(argv: string[], cwd: string, color = false) {
  const stdout = new MemoryWriter();
  const stderr = new MemoryWriter();
  const exitCode = await runCli({ argv, color, cwd, packageVersion: "0.0.0", stderr, stdout });

  return { exitCode, stderr: stderr.text, stdout: stdout.text };
}

async function createRepo() {
  const repo = await mkdtemp(join(tmpdir(), "tagsmith-repo-"));
  await git(repo, ["init", "-q"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Test User"]);
  await writeFile(join(repo, "README.md"), "repo\n");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-qm", "init"]);
  await git(repo, ["remote", "add", "origin", "https://example.com/tagsmith.git"]);
  return repo;
}

const config = `{
  "$schema": "https://raw.githubusercontent.com/sadiksaifi/tagsmith/refs/heads/main/schema/v1.json",
  "configVersion": 1,
  "git": { "remote": "origin", "baseBranch": "main" },
  "defaults": {
    "tagPattern": "{target}@{version}",
    "tagMessage": "Release {target} {version}",
    "initialVersion": "0.0.0"
  },
  "targets": {
    "api": {
      "path": "apps/api",
      "channels": [
        { "name": "rc", "strategy": "prerelease" },
        { "name": "prod", "strategy": "stable", "dependsOn": ["rc"] }
      ]
    },
    "web": {
      "path": "apps/web",
      "tagPattern": "web-{version}",
      "initialVersion": "1.0.0",
      "channels": [{ "name": "prod", "strategy": "stable" }]
    }
  }
}`;

describe("targets command", () => {
  test("discovers the git repo root from process cwd and resolves the default config path", async () => {
    const repo = await createRepo();

    try {
      await mkdir(join(repo, "apps/api"), { recursive: true });
      await mkdir(join(repo, "apps/web"), { recursive: true });
      await writeFile(join(repo, ".tagsmith.jsonc"), config);

      const result = await run(["targets"], join(repo, "apps/api"));

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("api");
      expect(result.stdout).toContain("apps/api");
      expect(result.stdout).toContain("rc (prerelease)");
      expect(result.stdout).toContain("prod (stable, dependsOn: rc)");
      expect(result.stdout).toContain("tagPattern: {target}@{version}");
      expect(result.stdout).toContain("initialVersion: 1.0.0");
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });

  test("resolves repo root from cwd when Git hook context points elsewhere", async () => {
    const hookRepo = await createRepo();
    const repo = await createRepo();

    try {
      await mkdir(join(repo, "apps/api"), { recursive: true });
      await mkdir(join(repo, "apps/web"), { recursive: true });
      await mkdir(join(hookRepo, "apps/api"), { recursive: true });
      await mkdir(join(hookRepo, "apps/web"), { recursive: true });
      await writeFile(join(repo, ".tagsmith.jsonc"), config);
      await writeFile(
        join(hookRepo, ".tagsmith.jsonc"),
        config.replace('"path": "apps/api"', '"path": "apps/hook-api"'),
      );

      await withPoisonedGitLocalEnv(hookRepo, async () => {
        const result = await run(["targets", "--json"], join(repo, "apps/api"), true);
        const output = JSON.parse(result.stdout);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe("");
        expect(output.targets.api.path).toBe("apps/api");
      });
    } finally {
      await rm(repo, { force: true, recursive: true });
      await rm(hookRepo, { force: true, recursive: true });
    }
  });

  test("resolves --config relative to the repo root and absolute paths as-is", async () => {
    const repo = await createRepo();
    const outside = await mkdtemp(join(tmpdir(), "tagsmith-config-"));

    try {
      await mkdir(join(repo, "apps/api"), { recursive: true });
      await mkdir(join(repo, "apps/web"), { recursive: true });
      await mkdir(join(repo, "configs"));
      await writeFile(join(repo, "configs/tagsmith.jsonc"), config);
      await writeFile(join(outside, "tagsmith.jsonc"), config);

      const relative = await run(
        ["--config", "configs/tagsmith.jsonc", "targets", "--json"],
        join(repo, "apps/api"),
      );
      const absolute = await run(
        ["--config", join(outside, "tagsmith.jsonc"), "targets", "--json"],
        join(repo, "apps/api"),
      );

      for (const result of [relative, absolute]) {
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe("");
        expect(JSON.parse(result.stdout)).toMatchObject({ configVersion: 1 });
      }
    } finally {
      await rm(repo, { force: true, recursive: true });
      await rm(outside, { force: true, recursive: true });
    }
  });

  test("targets --json suppresses config warnings on successful machine output", async () => {
    const repo = await createRepo();

    try {
      await mkdir(join(repo, "apps/api"), { recursive: true });
      await mkdir(join(repo, "apps/web"), { recursive: true });
      await writeFile(
        join(repo, ".tagsmith.jsonc"),
        config.replace('"tagPattern": "{target}@{version}"', '"tagPattern": "api{version}"'),
      );

      const result = await run(["targets", "--json"], repo, true);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).not.toContain("warning");
      expect(JSON.parse(result.stdout)).toMatchObject({ defaults: { tagPattern: "api{version}" } });
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });

  test("targets --json emits parsed config only in key order with no inherited target values or ANSI chatter", async () => {
    const repo = await createRepo();
    const shuffledConfig = `{
  "targets": {
    "api": {
      "channels": [
        { "strategy": "prerelease", "name": "rc" },
        { "dependsOn": ["rc"], "strategy": "stable", "name": "prod" }
      ],
      "path": "apps/api"
    },
    "web": {
      "channels": [{ "strategy": "stable", "name": "prod" }],
      "initialVersion": "1.0.0",
      "tagPattern": "web-{version}",
      "path": "apps/web"
    }
  },
  "defaults": {
    "initialVersion": "0.0.0",
    "tagMessage": "Release {target} {version}",
    "tagPattern": "{target}@{version}"
  },
  "git": { "baseBranch": "main", "remote": "origin" },
  "configVersion": 1,
  "$schema": "https://raw.githubusercontent.com/sadiksaifi/tagsmith/refs/heads/main/schema/v1.json"
}`;

    try {
      await mkdir(join(repo, "apps/api"), { recursive: true });
      await mkdir(join(repo, "apps/web"), { recursive: true });
      await writeFile(join(repo, ".tagsmith.jsonc"), shuffledConfig);

      const result = await run(["targets", "--json"], repo, true);
      const output = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).not.toContain(String.fromCodePoint(27));
      expect(result.stdout.endsWith("\n")).toBe(true);
      expect(Object.keys(output)).toEqual([
        "targets",
        "defaults",
        "git",
        "configVersion",
        "$schema",
      ]);
      expect(Object.keys(output.targets.api)).toEqual(["channels", "path"]);
      expect(Object.keys(output.targets.api.channels[0])).toEqual(["strategy", "name"]);
      expect(output.targets.api).not.toHaveProperty("tagPattern");
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });

  test("allows target names that overlap ordinary object property names", async () => {
    const repo = await createRepo();
    const configWithObjectPropertyTargets = `{
  "configVersion": 1,
  "git": { "remote": "origin", "baseBranch": "main" },
  "defaults": {
    "tagPattern": "{target}@{version}",
    "tagMessage": "Release {target} {version}",
    "initialVersion": "0.0.0"
  },
  "targets": {
    "constructor": {
      "path": "apps/constructor",
      "channels": [{ "name": "prod", "strategy": "stable" }]
    },
    "prototype": {
      "path": "apps/prototype",
      "channels": [{ "name": "prod", "strategy": "stable" }]
    }
  }
}`;

    try {
      await mkdir(join(repo, "apps/constructor"), { recursive: true });
      await mkdir(join(repo, "apps/prototype"), { recursive: true });
      await writeFile(join(repo, ".tagsmith.jsonc"), configWithObjectPropertyTargets);

      const result = await run(["targets", "--json"], repo, true);
      const output = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(Object.keys(output.targets)).toEqual(["constructor", "prototype"]);
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });

  test("rejects prototype-mutating config keys before targets --json output", async () => {
    const repo = await createRepo();
    const pollutedConfig = `{
  "configVersion": 1,
  "git": { "remote": "origin", "baseBranch": "main" },
  "defaults": {
    "tagPattern": "{target}@{version}",
    "tagMessage": "Release {target} {version}",
    "initialVersion": "0.0.0"
  },
  "targets": {
    "api": {
      "__proto__": {
        "path": "apps/api",
        "channels": [{ "name": "prod", "strategy": "stable" }]
      }
    }
  }
}`;

    try {
      await mkdir(join(repo, "apps/api"), { recursive: true });
      await writeFile(join(repo, ".tagsmith.jsonc"), pollutedConfig);

      const result = await run(["targets", "--json"], repo, true);

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("reserved key __proto__");
      expect(result.stderr).not.toContain(String.fromCodePoint(27));
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });

  test("does not require the configured git.remote to exist in the repository", async () => {
    const repo = await createRepo();

    try {
      await git(repo, ["remote", "remove", "origin"]);
      await mkdir(join(repo, "apps/api"), { recursive: true });
      await mkdir(join(repo, "apps/web"), { recursive: true });
      await writeFile(join(repo, ".tagsmith.jsonc"), config);

      const human = await run(["targets"], repo);
      const json = await run(["targets", "--json"], repo, true);

      expect(human.exitCode).toBe(0);
      expect(human.stderr).toBe("");
      expect(human.stdout).toContain("api");
      expect(human.stdout).toContain("web");
      expect(json.exitCode).toBe(0);
      expect(json.stderr).toBe("");
      expect(JSON.parse(json.stdout)).toMatchObject({
        configVersion: 1,
        git: { remote: "origin" },
      });
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });

  test("fails non-help commands outside a git repo and keeps machine failure stdout empty", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tagsmith-no-repo-"));

    try {
      const targets = await run(["targets", "--json"], directory, true);
      const init = await run(["init", "--dry-run"], directory, true);

      for (const result of [targets, init]) {
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain("tagsmith failed:");
        expect(result.stderr).toContain("Git repository");
        expect(result.stderr).not.toContain(String.fromCodePoint(27));
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("validates target realpaths inside the repo and rejects files, outside paths, and duplicate realpaths", async () => {
    const repo = await createRepo();
    const outside = await mkdtemp(join(tmpdir(), "tagsmith-outside-"));

    try {
      await mkdir(join(repo, "apps/api"), { recursive: true });
      await writeFile(join(repo, "not-a-directory"), "file\n");
      await writeFile(
        join(repo, ".tagsmith.jsonc"),
        config.replace('"path": "apps/web"', '"path": "apps/api"'),
      );
      expect(await run(["targets"], repo)).toMatchObject({ exitCode: 1, stdout: "" });

      await writeFile(
        join(repo, ".tagsmith.jsonc"),
        config.replace('"path": "apps/web"', '"path": "not-a-directory"'),
      );
      expect((await run(["targets"], repo)).stderr).toContain("must be a directory");

      await writeFile(
        join(repo, ".tagsmith.jsonc"),
        config.replace('"path": "apps/web"', `"path": "${outside}"`),
      );
      expect((await run(["targets"], repo)).stderr).toContain("inside the Git repository");
    } finally {
      await rm(repo, { force: true, recursive: true });
      await rm(outside, { force: true, recursive: true });
    }
  });

  test("schema/v1.json describes the published configVersion 1 shape", async () => {
    const schema = JSON.parse(
      await readFile(new URL("../../schema/v1.json", import.meta.url), "utf8"),
    );

    expect(schema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      additionalProperties: false,
      properties: { configVersion: { const: 1 } },
      required: ["configVersion", "git", "defaults", "targets"],
    });

    const remotePattern = new RegExp(schema.properties.git.properties.remote.pattern, "u");
    expect(remotePattern.test("origin")).toBe(true);
    for (const remote of ["origin/main", "-origin", ".foo", "foo.lock", "foo..bar"]) {
      expect(remotePattern.test(remote)).toBe(false);
    }

    const baseBranchPattern = new RegExp(schema.properties.git.properties.baseBranch.pattern, "u");
    expect(baseBranchPattern.test("release/1.x")).toBe(true);
    for (const branch of [
      "origin/main",
      "bad..branch",
      ".main",
      "main.lock",
      "main@{upstream}",
      "-main",
      "HEAD",
      "refs/heads/main",
    ]) {
      expect(baseBranchPattern.test(branch)).toBe(false);
    }
  });
});
