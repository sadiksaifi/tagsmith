import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { runCli, type RunCliOptions } from "@/cli/create-cli";
import type {
  RenderValidateInput,
  RenderValidateWarningsInput,
  SelectValidateAssertionsInput,
  ValidateAssertionsDecision,
  PromptAdapter,
  PromptTextDecision,
} from "@/interactive/prompt-adapter";

import { git } from "../helpers/git";

class MemoryWriter {
  text = "";

  write(chunk: string): boolean {
    this.text += chunk;
    return true;
  }
}

class RecordingPromptAdapter implements PromptAdapter {
  assertionPrompts: SelectValidateAssertionsInput[] = [];
  cancellations: string[] = [];
  nextAssertions: ValidateAssertionsDecision = { type: "infer" };
  nextTag: PromptTextDecision = { type: "submit", value: "app@1.2.0" };
  rendered: RenderValidateInput[] = [];
  tagPrompts = 0;
  warnings: RenderValidateWarningsInput[] = [];

  async cancel(message: string): Promise<void> {
    this.cancellations.push(message);
  }

  async confirmInit(): Promise<"confirm"> {
    return "confirm";
  }

  async promptTagVersion(): Promise<{ readonly type: "cancel" }> {
    return { type: "cancel" };
  }

  async promptValidateTag(): Promise<PromptTextDecision> {
    this.tagPrompts += 1;
    return this.nextTag;
  }

  async renderTagDryRun(): Promise<void> {}

  async renderTagReview(): Promise<"cancel"> {
    return "cancel";
  }

  async renderTagWarnings(): Promise<void> {}

  async renderTargets(): Promise<void> {}

  async renderValidate(input: RenderValidateInput): Promise<void> {
    this.rendered.push(input);
  }

  async renderValidateWarnings(input: RenderValidateWarningsInput): Promise<void> {
    this.warnings.push(input);
  }

  async selectAction(): Promise<{ readonly type: "cancel" }> {
    return { type: "cancel" };
  }

  async selectTagBump(): Promise<{ readonly type: "cancel" }> {
    return { type: "cancel" };
  }

  async selectTagChannel(): Promise<{ readonly type: "cancel" }> {
    return { type: "cancel" };
  }

  async selectTagTarget(): Promise<{ readonly type: "cancel" }> {
    return { type: "cancel" };
  }

  async selectTagVersionIntent(): Promise<{ readonly type: "cancel" }> {
    return { type: "cancel" };
  }

  async selectValidateAssertions(
    input: SelectValidateAssertionsInput,
  ): Promise<ValidateAssertionsDecision> {
    this.assertionPrompts.push(input);
    return this.nextAssertions;
  }
}

async function run(
  argv: string[],
  cwd: string,
  color = false,
  overrides: Partial<RunCliOptions> = {},
) {
  const stdout = new MemoryWriter();
  const stderr = new MemoryWriter();
  const exitCode = await runCli({
    argv,
    color,
    cwd,
    packageVersion: "0.0.0",
    stderr,
    stdout,
    ...overrides,
  });

  return { exitCode, stderr: stderr.text, stdout: stdout.text };
}

async function createRepo(configText = config()) {
  const root = await mkdtemp(join(tmpdir(), "tagsmith-validate-"));
  const remote = join(root, "remote.git");
  const repo = join(root, "repo");
  await git(root, ["init", "--bare", "-q", remote]);
  await git(root, ["clone", "-q", remote, repo]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Test User"]);
  await git(repo, ["switch", "-c", "main"]);
  await mkdir(join(repo, "apps/app"), { recursive: true });
  await mkdir(join(repo, "apps/api"), { recursive: true });
  await mkdir(join(repo, "apps/web"), { recursive: true });
  await writeFile(join(repo, "README.md"), "repo\n");
  await writeFile(join(repo, "apps/app/file.txt"), "app\n");
  await writeFile(join(repo, ".tagsmith.jsonc"), configText);
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-qm", "init"]);
  await git(repo, ["push", "-q", "-u", "origin", "main"]);
  return { remote, repo, root };
}

function config() {
  return `{
  "configVersion": 1,
  "git": { "remote": "origin", "baseBranch": "main" },
  "defaults": {
    "tagPattern": "{target}@{version}",
    "tagMessage": "Release {target} {version}",
    "initialVersion": "1.0.0"
  },
  "targets": {
    "app": {
      "path": "apps/app",
      "channels": [
        { "name": "rc", "strategy": "prerelease" },
        { "name": "prod", "strategy": "stable", "dependsOn": ["rc"] }
      ]
    }
  }
}`;
}

function targetlessConfig() {
  return config()
    .replace('"tagPattern": "{target}@{version}"', '"tagPattern": "v{version}"')
    .replace(', "dependsOn": ["rc"]', "");
}

function warningConfig() {
  return config()
    .replace('"tagPattern": "{target}@{version}"', '"tagPattern": "app{version}"')
    .replace(', "dependsOn": ["rc"]', "");
}

function multiTargetConfig() {
  return `{
  "configVersion": 1,
  "git": { "remote": "origin", "baseBranch": "main" },
  "defaults": {
    "tagPattern": "{target}@{version}",
    "tagMessage": "Release {target} {version}",
    "initialVersion": "1.0.0"
  },
  "targets": {
    "api": {
      "path": "apps/api",
      "channels": [
        { "name": "alpha", "strategy": "prerelease" },
        { "name": "prod", "strategy": "stable" }
      ]
    },
    "web": {
      "path": "apps/web",
      "channels": [
        { "name": "beta", "strategy": "prerelease" },
        { "name": "prod", "strategy": "stable" }
      ]
    }
  }
}`;
}

async function tagAndPush(repo: string, tag: string, message = `Release ${tag}`) {
  await git(repo, ["tag", "-a", tag, "-m", message]);
  await git(repo, ["push", "-q", "origin", tag]);
}

describe("validate command", () => {
  test("eligible TTY validate prompts for a missing tag, defaults assertions to inference, and renders facts interactively", async () => {
    const { repo, root } = await createRepo(warningConfig());
    const promptAdapter = new RecordingPromptAdapter();
    promptAdapter.nextTag = { type: "submit", value: "app1.2.0" };

    try {
      await tagAndPush(repo, "app1.2.0");

      const result = await run(["validate"], repo, false, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(result).toEqual({ exitCode: 0, stderr: "", stdout: "" });
      expect(promptAdapter.tagPrompts).toBe(1);
      expect(promptAdapter.warnings).toEqual([
        {
          warnings: [
            "defaults.tagPattern {version} touches an alphanumeric or underscore character",
          ],
        },
      ]);
      expect(promptAdapter.assertionPrompts).toHaveLength(1);
      expect(promptAdapter.rendered[0]?.facts).toContain(
        "Validated app1.2.0 (1.2.0) for target app channel prod.",
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("eligible TTY validate assertion choices preserve target and channel config order", async () => {
    const { repo, root } = await createRepo(multiTargetConfig());
    const promptAdapter = new RecordingPromptAdapter();
    promptAdapter.nextTag = { type: "submit", value: "web@1.0.0" };
    promptAdapter.nextAssertions = {
      channel: "prod",
      target: "web",
      type: "assert-target-channel",
    };

    try {
      await tagAndPush(repo, "web@1.0.0");

      const result = await run(["validate"], repo, false, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(result).toEqual({ exitCode: 0, stderr: "", stdout: "" });
      expect(promptAdapter.assertionPrompts).toEqual([
        {
          targets: [
            {
              channels: [
                { name: "alpha", strategy: "prerelease" },
                { name: "prod", strategy: "stable" },
              ],
              name: "api",
            },
            {
              channels: [
                { name: "beta", strategy: "prerelease" },
                { name: "prod", strategy: "stable" },
              ],
              name: "web",
            },
          ],
        },
      ]);
      expect(promptAdapter.rendered[0]?.facts).toContain(
        "Validated web@1.0.0 (1.0.0) for target web channel prod.",
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("TTY machine validate modes never prompt and preserve missing-input failures", async () => {
    const { repo, root } = await createRepo();
    const promptAdapter = new RecordingPromptAdapter();
    const outputPath = join(root, "GITHUB_OUTPUT");
    const previousOutput = process.env.GITHUB_OUTPUT;

    try {
      process.env.GITHUB_OUTPUT = outputPath;
      const json = await run(["validate", "--json"], repo, true, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });
      const github = await run(["validate", "--github-output"], repo, true, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(json).toMatchObject({ exitCode: 1, stdout: "" });
      expect(json.stderr).toContain("validate requires --tag");
      expect(github).toMatchObject({ exitCode: 1, stdout: "" });
      expect(github.stderr).toContain("validate requires --tag");
      expect(promptAdapter.tagPrompts).toBe(0);
      expect(promptAdapter.assertionPrompts).toHaveLength(0);
      expect(promptAdapter.rendered).toHaveLength(0);
    } finally {
      if (previousOutput === undefined) {
        delete process.env.GITHUB_OUTPUT;
      } else {
        process.env.GITHUB_OUTPUT = previousOutput;
      }
      await rm(root, { force: true, recursive: true });
    }
  });

  test("interactive validate keeps invalid explicit assertions as canonical validation errors", async () => {
    const { repo, root } = await createRepo();
    const promptAdapter = new RecordingPromptAdapter();

    try {
      await tagAndPush(repo, "app@1.2.0-rc.1");
      await tagAndPush(repo, "app@1.2.0");

      const result = await run(["validate", "--channel", "rc"], repo, false, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(result).toMatchObject({ exitCode: 1, stdout: "" });
      expect(result.stderr).toContain("--channel rc does not match inferred channel prod");
      expect(promptAdapter.tagPrompts).toBe(1);
      expect(promptAdapter.assertionPrompts).toHaveLength(0);
      expect(promptAdapter.rendered).toHaveLength(0);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("validates a fully strict tag and emits deterministic JSON facts", async () => {
    const { repo, root } = await createRepo();

    try {
      const head = await git(repo, ["rev-parse", "HEAD"]);
      await tagAndPush(repo, "app@1.2.0-rc.1");
      await tagAndPush(repo, "app@1.2.0");

      const result = await run(
        ["validate", "--tag", "app@1.2.0", "--target", "app", "--channel", "prod", "--json"],
        repo,
        true,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        target: "app",
        channel: "prod",
        strategy: "stable",
        version: "1.2.0",
        baseVersion: "1.2.0",
        tag: "app@1.2.0",
        tagMessage: "Release app 1.2.0",
        commit: head,
        remote: "origin",
        baseBranch: "main",
        valid: true,
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("validates requested tags without requiring unrelated remote history locally", async () => {
    const { repo, root } = await createRepo();

    try {
      await tagAndPush(repo, "app@1.1.0-rc.1");
      await git(repo, ["tag", "-d", "app@1.1.0-rc.1"]);
      await tagAndPush(repo, "app@1.2.0-rc.1");

      const result = await run(["validate", "--tag", "app@1.2.0-rc.1", "--json"], repo, true);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({ tag: "app@1.2.0-rc.1", valid: true });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("emits config warnings in human mode but suppresses them in machine modes", async () => {
    const { repo, root } = await createRepo(warningConfig());
    const outputPath = join(root, "GITHUB_OUTPUT");
    const previousOutput = process.env.GITHUB_OUTPUT;

    try {
      await tagAndPush(repo, "app1.0.0");
      process.env.GITHUB_OUTPUT = outputPath;

      const human = await run(["validate", "--tag", "app1.0.0"], repo);
      const json = await run(["validate", "--tag", "app1.0.0", "--json"], repo, true);
      const github = await run(["validate", "--tag", "app1.0.0", "--github-output"], repo, true);

      expect(human.exitCode).toBe(0);
      expect(human.stderr).toContain("warning: defaults.tagPattern {version} touches");
      expect(human.stdout).toContain("Validated app1.0.0");
      expect(json.exitCode).toBe(0);
      expect(json.stderr).toBe("");
      expect(json.stdout).not.toContain("warning");
      expect(JSON.parse(json.stdout)).toMatchObject({ tag: "app1.0.0", valid: true });
      expect(github).toEqual({ exitCode: 0, stderr: "", stdout: "" });
      await expect(readFile(outputPath, "utf8")).resolves.toContain("tag=app1.0.0\n");
    } finally {
      if (previousOutput === undefined) {
        delete process.env.GITHUB_OUTPUT;
      } else {
        process.env.GITHUB_OUTPUT = previousOutput;
      }
      await rm(root, { force: true, recursive: true });
    }
  });

  test("infers a single target for targetless patterns and writes GitHub output only after success", async () => {
    const { repo, root } = await createRepo(targetlessConfig());
    const outputPath = join(root, "GITHUB_OUTPUT");
    const previousOutput = process.env.GITHUB_OUTPUT;

    try {
      const head = await git(repo, ["rev-parse", "HEAD"]);
      await tagAndPush(repo, "v1.0.0");
      process.env.GITHUB_OUTPUT = outputPath;

      const result = await run(["validate", "--tag", "v1.0.0", "--github-output"], repo, true);

      expect(result).toEqual({ exitCode: 0, stderr: "", stdout: "" });
      await expect(readFile(outputPath, "utf8")).resolves.toBe(
        [
          "target=app",
          "channel=prod",
          "strategy=stable",
          "version=1.0.0",
          "baseVersion=1.0.0",
          "tag=v1.0.0",
          "tagMessage=Release app 1.0.0",
          `commit=${head}`,
          "remote=origin",
          "baseBranch=main",
          "valid=true",
          "",
        ].join("\n"),
      );

      const missingTag = await run(["validate", "--tag", "v1.0.1", "--github-output"], repo, true);
      expect(missingTag).toMatchObject({ exitCode: 1, stdout: "" });
      await expect(readFile(outputPath, "utf8")).resolves.not.toContain("v1.0.1");
    } finally {
      if (previousOutput === undefined) {
        delete process.env.GITHUB_OUTPUT;
      } else {
        process.env.GITHUB_OUTPUT = previousOutput;
      }
      await rm(root, { force: true, recursive: true });
    }
  });

  test("fails when configured remote tags cannot be read", async () => {
    const { repo, root } = await createRepo();

    try {
      await git(repo, ["remote", "remove", "origin"]);

      const result = await run(["validate", "--tag", "app@1.0.0", "--json"], repo, true);

      expect(result).toMatchObject({ exitCode: 1, stdout: "" });
      expect(result.stderr).toContain("failed to read remote tags from origin");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("reports GitHub output write failures without throwing", async () => {
    const { repo, root } = await createRepo(targetlessConfig());
    const previousOutput = process.env.GITHUB_OUTPUT;

    try {
      await tagAndPush(repo, "v1.0.0");
      process.env.GITHUB_OUTPUT = root;

      const result = await run(["validate", "--tag", "v1.0.0", "--github-output"], repo, true);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("failed to write GitHub output");
    } finally {
      if (previousOutput === undefined) {
        delete process.env.GITHUB_OUTPUT;
      } else {
        process.env.GITHUB_OUTPUT = previousOutput;
      }
      await rm(root, { force: true, recursive: true });
    }
  });

  test("keeps machine failures on stderr with no stdout and no partial GitHub output", async () => {
    const { repo, root } = await createRepo();
    const outputPath = join(root, "GITHUB_OUTPUT");
    const previousOutput = process.env.GITHUB_OUTPUT;

    try {
      await writeFile(outputPath, "existing=true\n");
      delete process.env.GITHUB_OUTPUT;
      const missingOutput = await run(
        ["validate", "--tag", "app@1.2.0", "--github-output"],
        repo,
        true,
      );
      const mutuallyExclusive = await run(
        ["validate", "--tag", "app@1.2.0", "--json", "--github-output"],
        repo,
        true,
      );
      process.env.GITHUB_OUTPUT = outputPath;
      const missingTag = await run(
        ["validate", "--tag", "app@1.2.0", "--github-output"],
        repo,
        true,
      );

      expect(missingOutput).toMatchObject({ exitCode: 1, stdout: "" });
      expect(missingOutput.stderr).toContain("GITHUB_OUTPUT");
      expect(mutuallyExclusive).toMatchObject({ exitCode: 1, stdout: "" });
      expect(mutuallyExclusive.stderr).toContain("incompatible");
      expect(missingTag).toMatchObject({ exitCode: 1, stdout: "" });
      await expect(readFile(outputPath, "utf8")).resolves.toBe("existing=true\n");
    } finally {
      if (previousOutput === undefined) {
        delete process.env.GITHUB_OUTPUT;
      } else {
        process.env.GITHUB_OUTPUT = previousOutput;
      }
      await rm(root, { force: true, recursive: true });
    }
  });

  test("fails when the latest same-base dependency tag exists only remotely", async () => {
    const { repo, root } = await createRepo();

    try {
      await tagAndPush(repo, "app@1.2.0-rc.1");
      await tagAndPush(repo, "app@1.2.0");
      await tagAndPush(repo, "app@1.2.0-rc.2");
      await git(repo, ["tag", "-d", "app@1.2.0-rc.2"]);

      const result = await run(["validate", "--tag", "app@1.2.0", "--json"], repo, true);

      expect(result).toMatchObject({ exitCode: 1, stdout: "" });
      expect(result.stderr).toContain("app@1.2.0-rc.2 must exist locally and remotely");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("fails on assertion mismatch, malformed managed tags, peeled mismatches, reachability, and dependencies", async () => {
    const { repo, root } = await createRepo();

    try {
      await tagAndPush(repo, "app@1.2.0-rc.1");
      await tagAndPush(repo, "app@1.2.0");
      const channelMismatch = await run(
        ["validate", "--tag", "app@1.2.0", "--channel", "rc", "--json"],
        repo,
        true,
      );
      await git(repo, ["tag", "-a", "app@bad", "-m", "bad"]);
      const malformed = await run(["validate", "--tag", "app@1.2.0", "--json"], repo, true);
      await git(repo, ["tag", "-d", "app@bad"]);
      await writeFile(join(repo, "README.md"), "repo changed\n");
      await git(repo, ["add", "."]);
      await git(repo, ["commit", "-qm", "ahead"]);
      await git(repo, ["tag", "-a", "app@2.0.0-rc.1", "-m", "unreachable"]);
      await git(repo, ["push", "-q", "origin", "app@2.0.0-rc.1"]);
      const reachability = await run(["validate", "--tag", "app@2.0.0-rc.1", "--json"], repo, true);
      await git(repo, ["tag", "-a", "app@1.2.0", "-m", "local replacement", "--force"]);
      const peeledMismatch = await run(["validate", "--tag", "app@1.2.0", "--json"], repo, true);

      await git(repo, ["fetch", "-q", "origin", "main"]);
      await git(repo, ["reset", "--hard", "origin/main"]);
      await git(repo, ["tag", "-a", "app@1.2.0", "origin/main", "-m", "restored", "--force"]);
      await tagAndPush(repo, "app@1.3.0");
      const dependency = await run(["validate", "--tag", "app@1.3.0", "--json"], repo, true);

      expect(channelMismatch).toMatchObject({ exitCode: 1, stdout: "" });
      expect(channelMismatch.stderr).toContain("does not match inferred channel prod");
      expect(malformed).toMatchObject({ exitCode: 1, stdout: "" });
      expect(malformed.stderr).toContain("malformed managed tag");
      expect(peeledMismatch).toMatchObject({ exitCode: 1, stdout: "" });
      expect(peeledMismatch.stderr).toContain("peeled commits differ");
      expect(reachability).toMatchObject({ exitCode: 1, stdout: "" });
      expect(reachability.stderr).toContain("cannot prove tag commit is reachable");
      expect(dependency).toMatchObject({ exitCode: 1, stdout: "" });
      expect(dependency.stderr).toContain("requires dependency tag");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
