import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { runCli } from "@/cli/create-cli";
import type {
  PromptAdapter,
  PromptSelectDecision,
  PromptTextDecision,
  RenderTagPlanInput,
  RenderTagReviewInput,
  RenderTagWarningsInput,
  TagReviewDecision,
  SelectTagBumpInput,
  SelectTagChannelInput,
  SelectTagTargetInput,
} from "@/interactive/prompt-adapter";

import { git, withPoisonedGitLocalEnv } from "../helpers/git";

class MemoryWriter {
  text = "";

  write(chunk: string): boolean {
    this.text += chunk;
    return true;
  }
}

class RecordingPromptAdapter implements PromptAdapter {
  bumpPrompts: SelectTagBumpInput[] = [];
  cancellations: string[] = [];
  channelPrompts: SelectTagChannelInput[] = [];
  dryRuns: RenderTagPlanInput[] = [];
  nextBump: PromptSelectDecision<"major" | "minor" | "patch" | "prerelease"> = {
    type: "select",
    value: "patch",
  };
  nextChannel: PromptSelectDecision<string> = { type: "select", value: "stable" };
  nextReview: TagReviewDecision = "cancel";
  nextTarget: PromptSelectDecision<string> = { type: "select", value: "app" };
  nextVersion: PromptTextDecision = { type: "submit", value: "1.0.0" };
  nextVersionIntent: PromptSelectDecision<"bump" | "version"> = { type: "select", value: "bump" };
  reviews: RenderTagReviewInput[] = [];
  targetPrompts: SelectTagTargetInput[] = [];
  warnings: RenderTagWarningsInput[] = [];

  async cancel(message: string): Promise<void> {
    this.cancellations.push(message);
  }

  async confirmInit(): Promise<"confirm"> {
    return "confirm";
  }

  async promptTagVersion(): Promise<PromptTextDecision> {
    return this.nextVersion;
  }

  async promptValidateTag(): Promise<{ readonly type: "cancel" }> {
    return { type: "cancel" };
  }

  async renderTagDryRun(input: RenderTagPlanInput): Promise<void> {
    this.dryRuns.push(input);
  }

  async renderTagReview(input: RenderTagReviewInput): Promise<TagReviewDecision> {
    this.reviews.push(input);
    return this.nextReview;
  }

  async renderTagWarnings(input: RenderTagWarningsInput): Promise<void> {
    this.warnings.push(input);
  }

  async renderTargets(): Promise<void> {}

  async renderValidate(): Promise<void> {}

  async renderValidateWarnings(): Promise<void> {}

  async selectAction(): Promise<{ readonly type: "cancel" }> {
    return { type: "cancel" };
  }

  async selectTagBump(
    input: SelectTagBumpInput,
  ): Promise<PromptSelectDecision<"major" | "minor" | "patch" | "prerelease">> {
    this.bumpPrompts.push(input);
    return this.nextBump;
  }

  async selectTagChannel(input: SelectTagChannelInput): Promise<PromptSelectDecision<string>> {
    this.channelPrompts.push(input);
    return this.nextChannel;
  }

  async selectTagTarget(input: SelectTagTargetInput): Promise<PromptSelectDecision<string>> {
    this.targetPrompts.push(input);
    return this.nextTarget;
  }

  async selectTagVersionIntent(): Promise<PromptSelectDecision<"bump" | "version">> {
    return this.nextVersionIntent;
  }

  async selectValidateAssertions(): Promise<{ readonly type: "infer" }> {
    return { type: "infer" };
  }
}

async function run(
  argv: string[],
  cwd: string,
  color = false,
  overrides: Partial<Parameters<typeof runCli>[0]> = {},
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
  const root = await mkdtemp(join(tmpdir(), "tagsmith-tag-"));
  const remote = join(root, "remote.git");
  const repo = join(root, "repo");
  await git(root, ["init", "--bare", "-q", remote]);
  await git(root, ["clone", "-q", remote, repo]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Test User"]);
  await git(repo, ["switch", "-c", "main"]);
  await mkdir(join(repo, "apps/app"), { recursive: true });
  await mkdir(join(repo, "apps/api"), { recursive: true });
  await writeFile(join(repo, "README.md"), "repo\n");
  await writeFile(join(repo, "apps/app/file.txt"), "app\n");
  await writeFile(join(repo, "apps/api/file.txt"), "api\n");
  await writeFile(join(repo, ".tagsmith.jsonc"), configText);
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-qm", "init"]);
  await git(repo, ["push", "-q", "-u", "origin", "main"]);
  return { remote, repo, root };
}

async function installHook(remote: string, name: string, body: string) {
  const hook = join(remote, "hooks", name);
  await writeFile(hook, `#!/bin/sh\n${body}\n`);
  await chmod(hook, 0o755);
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
        { "name": "stable", "strategy": "stable" }
      ]
    }
  }
}`;
}

function warningConfig() {
  return config().replace('"tagPattern": "{target}@{version}"', '"tagPattern": "app{version}"');
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
    "app": {
      "path": "apps/app",
      "channels": [
        { "name": "beta", "strategy": "prerelease" },
        { "name": "stable", "strategy": "stable" }
      ]
    },
    "api": {
      "path": "apps/api",
      "channels": [
        { "name": "rc", "strategy": "prerelease" },
        { "name": "stable", "strategy": "stable" }
      ]
    }
  }
}`;
}

function singleChannelConfig() {
  return config().replace(
    `
        { "name": "rc", "strategy": "prerelease" },`,
    "",
  );
}

function invalidSecondTargetPathConfig() {
  return multiTargetConfig().replace('"path": "apps/api"', '"path": "apps/missing"');
}

describe("interactive tag command", () => {
  test("eligible TTY tag prompts in target, channel, and version order before dry-run facts", async () => {
    const { repo, root } = await createRepo(multiTargetConfig());
    const promptAdapter = new RecordingPromptAdapter();
    promptAdapter.nextTarget = { type: "select", value: "api" };
    promptAdapter.nextChannel = { type: "select", value: "rc" };
    promptAdapter.nextBump = { type: "select", value: "patch" };

    try {
      const head = await git(repo, ["rev-parse", "HEAD"]);
      const result = await run(["tag", "--dry-run"], repo, false, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(result).toEqual({ exitCode: 0, stderr: "", stdout: "" });
      expect(promptAdapter.targetPrompts).toEqual([
        { targets: [{ name: "app" }, { name: "api" }] },
      ]);
      expect(promptAdapter.channelPrompts).toEqual([
        {
          channels: [
            { name: "rc", strategy: "prerelease" },
            { name: "stable", strategy: "stable" },
          ],
        },
      ]);
      expect(promptAdapter.bumpPrompts).toEqual([
        { bumps: ["major", "minor", "patch", "prerelease"] },
      ]);
      expect(promptAdapter.dryRuns[0]?.facts).toContain("Target: api");
      expect(promptAdapter.dryRuns[0]?.facts).toContain("Channel: rc");
      expect(promptAdapter.dryRuns[0]?.facts).toContain("Strategy: prerelease");
      expect(promptAdapter.dryRuns[0]?.facts).toContain("Version intent: bump patch");
      expect(promptAdapter.dryRuns[0]?.facts).toContain(`Commit: ${head}`);
      expect(promptAdapter.dryRuns[0]?.equivalentCommand).toBe(
        "tagsmith tag --target api --channel rc --bump patch --dry-run",
      );
      expect(await git(repo, ["tag", "--list"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("eligible TTY tag filters stable channel bump choices", async () => {
    const { repo, root } = await createRepo(multiTargetConfig());
    const promptAdapter = new RecordingPromptAdapter();
    promptAdapter.nextTarget = { type: "select", value: "app" };
    promptAdapter.nextChannel = { type: "select", value: "stable" };

    try {
      const result = await run(["tag", "--dry-run"], repo, false, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(result).toEqual({ exitCode: 0, stderr: "", stdout: "" });
      expect(promptAdapter.bumpPrompts).toEqual([{ bumps: ["major", "minor", "patch"] }]);
      expect(promptAdapter.dryRuns[0]?.facts).toContain("Strategy: stable");
      expect(promptAdapter.dryRuns[0]?.facts).toContain("Version intent: bump patch");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("eligible TTY tag requires review before mutating even when all required flags were supplied", async () => {
    const { repo, root } = await createRepo(singleChannelConfig());
    const promptAdapter = new RecordingPromptAdapter();

    try {
      const result = await run(["tag", "--channel", "stable", "--version", "1.0.0"], repo, false, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(result).toEqual({ exitCode: 1, stderr: "", stdout: "" });
      expect(promptAdapter.reviews).toHaveLength(1);
      expect(promptAdapter.reviews[0]).toMatchObject({
        defaultAction: "create-local",
        pushExplicit: false,
      });
      expect(promptAdapter.reviews[0]?.equivalentCommand).toBe(
        "tagsmith tag --target app --channel stable --version 1.0.0",
      );
      expect(promptAdapter.cancellations).toEqual(["tagsmith cancelled."]);
      expect(await git(repo, ["tag", "--list"])).toBe("");
      expect(await git(repo, ["ls-remote", "--tags", "origin"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("eligible TTY tag creates a local tag by default after review", async () => {
    const { repo, root } = await createRepo(singleChannelConfig());
    const promptAdapter = new RecordingPromptAdapter();
    promptAdapter.nextReview = "create-local";

    try {
      const head = await git(repo, ["rev-parse", "HEAD"]);
      const result = await run(["tag", "--channel", "stable", "--version", "1.0.0"], repo, false, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(promptAdapter.reviews[0]).toMatchObject({
        defaultAction: "create-local",
        pushExplicit: false,
      });
      expect(result.stdout).toContain("Tagged app@1.0.0");
      expect(result.stdout).toContain("Pushed: no");
      expect(result.stdout).toContain(
        "Equivalent command: tagsmith tag --target app --channel stable --version 1.0.0",
      );
      expect(await git(repo, ["rev-parse", "app@1.0.0^{}"])).toBe(head);
      expect(await git(repo, ["ls-remote", "--tags", "origin"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("eligible TTY tag can create and push after review when --push was omitted", async () => {
    const { repo, root } = await createRepo(singleChannelConfig());
    const promptAdapter = new RecordingPromptAdapter();
    promptAdapter.nextReview = "create-and-push";

    try {
      const head = await git(repo, ["rev-parse", "HEAD"]);
      const result = await run(["tag", "--channel", "stable", "--version", "1.0.0"], repo, false, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(promptAdapter.reviews[0]).toMatchObject({
        defaultAction: "create-local",
        pushExplicit: false,
      });
      expect(result.stdout).toContain("Pushed: yes");
      expect(result.stdout).toContain(
        "Equivalent command: tagsmith tag --target app --channel stable --version 1.0.0 --push",
      );
      expect(await git(repo, ["rev-parse", "app@1.0.0^{}"])).toBe(head);
      expect(
        await git(repo, ["ls-remote", "--tags", "origin", "refs/tags/app@1.0.0^{}"]),
      ).toContain(head);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("eligible TTY tag with explicit --push defaults to the safe negative action", async () => {
    const { repo, root } = await createRepo(singleChannelConfig());
    const promptAdapter = new RecordingPromptAdapter();

    try {
      const result = await run(
        ["tag", "--channel", "stable", "--version", "1.0.0", "--push"],
        repo,
        false,
        {
          promptAdapter,
          stdinIsTty: true,
          stdoutIsTty: true,
        },
      );

      expect(result).toEqual({ exitCode: 1, stderr: "", stdout: "" });
      expect(promptAdapter.reviews[0]).toMatchObject({
        defaultAction: "cancel",
        pushExplicit: true,
      });
      expect(promptAdapter.reviews[0]?.equivalentCommand).toBe(
        "tagsmith tag --target app --channel stable --version 1.0.0 --push",
      );
      expect(await git(repo, ["tag", "--list"])).toBe("");
      expect(await git(repo, ["ls-remote", "--tags", "origin"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("eligible TTY tag with explicit --push creates and pushes after review", async () => {
    const { repo, root } = await createRepo(singleChannelConfig());
    const promptAdapter = new RecordingPromptAdapter();
    promptAdapter.nextReview = "create-and-push";

    try {
      const head = await git(repo, ["rev-parse", "HEAD"]);
      const result = await run(
        ["tag", "--channel", "stable", "--version", "1.0.0", "--push"],
        repo,
        false,
        {
          promptAdapter,
          stdinIsTty: true,
          stdoutIsTty: true,
        },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(promptAdapter.reviews[0]).toMatchObject({
        defaultAction: "cancel",
        pushExplicit: true,
      });
      expect(result.stdout).toContain("Pushed: yes");
      expect(result.stdout).toContain(
        "Equivalent command: tagsmith tag --target app --channel stable --version 1.0.0 --push",
      );
      expect(await git(repo, ["rev-parse", "app@1.0.0^{}"])).toBe(head);
      expect(
        await git(repo, ["ls-remote", "--tags", "origin", "refs/tags/app@1.0.0^{}"]),
      ).toContain(head);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("eligible TTY tag preserves local tag when selected push fails", async () => {
    const { remote, repo, root } = await createRepo(singleChannelConfig());
    const promptAdapter = new RecordingPromptAdapter();
    promptAdapter.nextReview = "create-and-push";

    try {
      await installHook(remote, "pre-receive", "echo rejected >&2\nexit 1");
      const head = await git(repo, ["rev-parse", "HEAD"]);
      const result = await run(
        ["tag", "--channel", "stable", "--version", "1.0.0", "--push"],
        repo,
        false,
        {
          promptAdapter,
          stdinIsTty: true,
          stdoutIsTty: true,
        },
      );

      expect(result).toMatchObject({ exitCode: 1, stdout: "" });
      expect(result.stderr).toContain("local tag app@1.0.0 exists but was not pushed");
      expect(await git(repo, ["rev-parse", "app@1.0.0^{}"])).toBe(head);
      expect(await git(repo, ["ls-remote", "--tags", "origin", "refs/tags/app@1.0.0"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("eligible TTY tag preserves local tag when selected push verification fails", async () => {
    const { remote, repo, root } = await createRepo(singleChannelConfig());
    const promptAdapter = new RecordingPromptAdapter();
    promptAdapter.nextReview = "create-and-push";

    try {
      await installHook(
        remote,
        "post-receive",
        'while read old new ref; do\n  case "$ref" in refs/tags/*) git update-ref -d "$ref" ;; esac\ndone',
      );
      const head = await git(repo, ["rev-parse", "HEAD"]);
      const result = await run(
        ["tag", "--channel", "stable", "--version", "1.0.0", "--push"],
        repo,
        false,
        {
          promptAdapter,
          stdinIsTty: true,
          stdoutIsTty: true,
        },
      );

      expect(result).toMatchObject({ exitCode: 1, stdout: "" });
      expect(result.stderr).toContain("push verification failed for app@1.0.0");
      expect(result.stderr).toContain("Local tag remains");
      expect(await git(repo, ["rev-parse", "app@1.0.0^{}"])).toBe(head);
      expect(await git(repo, ["ls-remote", "--tags", "origin", "refs/tags/app@1.0.0"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("eligible TTY tag auto-selects a single target and single channel for review", async () => {
    const { repo, root } = await createRepo(singleChannelConfig());
    const promptAdapter = new RecordingPromptAdapter();
    promptAdapter.nextVersionIntent = { type: "select", value: "version" };
    promptAdapter.nextVersion = { type: "submit", value: "1.0.0" };

    try {
      const result = await run(["tag"], repo, false, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(result).toEqual({ exitCode: 1, stderr: "", stdout: "" });
      expect(promptAdapter.targetPrompts).toEqual([]);
      expect(promptAdapter.channelPrompts).toEqual([]);
      expect(promptAdapter.warnings).toEqual([{ warnings: [] }]);
      expect(promptAdapter.reviews[0]?.facts).toContain("Target: app");
      expect(promptAdapter.reviews[0]?.facts).toContain("Channel: stable");
      expect(promptAdapter.reviews[0]?.facts).toContain("Version intent: explicit version 1.0.0");
      expect(promptAdapter.reviews[0]?.equivalentCommand).toBe(
        "tagsmith tag --target app --channel stable --version 1.0.0",
      );
      expect(promptAdapter.cancellations).toEqual(["tagsmith cancelled."]);
      expect(await git(repo, ["tag", "--list"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("eligible TTY tag stops before review or mutation when preflight fails", async () => {
    const { repo, root } = await createRepo(singleChannelConfig());
    const promptAdapter = new RecordingPromptAdapter();

    try {
      await writeFile(join(repo, "dirty.txt"), "dirty\n");
      const result = await run(["tag", "--bump", "patch"], repo, false, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(result).toMatchObject({ exitCode: 1, stdout: "" });
      expect(result.stderr).toContain("working tree must be clean");
      expect(promptAdapter.reviews).toEqual([]);
      expect(promptAdapter.dryRuns).toEqual([]);
      expect(await git(repo, ["tag", "--list"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("tag creation command", () => {
  test("creates one annotated local tag at HEAD without pushing by default", async () => {
    const { repo, root } = await createRepo();

    try {
      const head = await git(repo, ["rev-parse", "HEAD"]);
      const result = await run(["tag", "--channel", "stable", "--version", "1.0.0"], repo);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("app@1.0.0");
      expect(result.stdout).toContain("target app");
      expect(result.stdout).toContain("channel stable");
      expect(result.stdout).toContain(head.slice(0, 12));
      expect(result.stdout).toContain("Created: yes");
      expect(result.stdout).toContain("Pushed: no");
      expect(await git(repo, ["rev-parse", "app@1.0.0^{}"])).toBe(head);
      expect(await git(repo, ["cat-file", "-t", "app@1.0.0"])).toBe("tag");
      expect(await git(repo, ["for-each-ref", "refs/tags/app@1.0.0", "--format=%(contents)"])).toBe(
        "Release app 1.0.0",
      );
      expect(await git(repo, ["ls-remote", "--tags", "origin"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("creates the tag in the requested repo when Git hook context points elsewhere", async () => {
    const hook = await createRepo();
    const { repo, root } = await createRepo();

    try {
      const head = await git(repo, ["rev-parse", "HEAD"]);

      await withPoisonedGitLocalEnv(hook.repo, async () => {
        const result = await run(["tag", "--channel", "stable", "--version", "1.0.0"], repo);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.stdout).toContain("app@1.0.0");
      });

      expect(await git(repo, ["rev-parse", "app@1.0.0^{}"])).toBe(head);
      expect(await git(hook.repo, ["tag", "--list", "app@1.0.0"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
      await rm(hook.root, { force: true, recursive: true });
    }
  });

  test("pushes a created tag, verifies the remote peeled commit, and emits JSON facts", async () => {
    const { repo, root } = await createRepo();

    try {
      const head = await git(repo, ["rev-parse", "HEAD"]);
      const result = await run(
        ["tag", "--channel", "stable", "--bump", "patch", "--push", "--json"],
        repo,
        true,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        target: "app",
        channel: "stable",
        strategy: "stable",
        version: "1.0.1",
        baseVersion: "1.0.1",
        tag: "app@1.0.1",
        tagMessage: "Release app 1.0.1",
        commit: head,
        created: true,
        pushed: true,
        dryRun: false,
      });
      expect(await git(repo, ["rev-parse", "app@1.0.1^{}"])).toBe(head);
      expect(
        await git(repo, ["ls-remote", "--tags", "origin", "refs/tags/app@1.0.1^{}"]),
      ).toContain(head);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("exits before push when annotated local tag creation fails", async () => {
    const { repo, root } = await createRepo();

    try {
      await mkdir(join(repo, ".git/refs/tags"), { recursive: true });
      await writeFile(join(repo, ".git/refs/tags/app@1.0.0.lock"), "stale lock\n");
      const result = await run(
        ["tag", "--channel", "stable", "--version", "1.0.0", "--push"],
        repo,
      );

      expect(result).toMatchObject({ exitCode: 1, stdout: "" });
      expect(result.stderr).toContain("failed to create annotated local tag app@1.0.0");
      expect(await git(repo, ["tag", "--list"])).toBe("");
      expect(await git(repo, ["ls-remote", "--tags", "origin", "refs/tags/app@1.0.0"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("keeps the local tag and reports no rollback when push fails", async () => {
    const { remote, repo, root } = await createRepo();

    try {
      await installHook(remote, "pre-receive", "echo rejected >&2\nexit 1");
      const head = await git(repo, ["rev-parse", "HEAD"]);
      const result = await run(
        ["tag", "--channel", "stable", "--version", "1.0.0", "--push"],
        repo,
      );

      expect(result).toMatchObject({ exitCode: 1, stdout: "" });
      expect(result.stderr).toContain("local tag app@1.0.0 exists but was not pushed");
      expect(await git(repo, ["rev-parse", "app@1.0.0^{}"])).toBe(head);
      expect(await git(repo, ["ls-remote", "--tags", "origin", "refs/tags/app@1.0.0"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("keeps the local tag and reports no rollback when post-push verification fails", async () => {
    const { remote, repo, root } = await createRepo();

    try {
      await installHook(
        remote,
        "post-receive",
        'while read old new ref; do\n  case "$ref" in refs/tags/*) git update-ref -d "$ref" ;; esac\ndone',
      );
      const head = await git(repo, ["rev-parse", "HEAD"]);
      const result = await run(
        ["tag", "--channel", "stable", "--version", "1.0.0", "--push"],
        repo,
      );

      expect(result).toMatchObject({ exitCode: 1, stdout: "" });
      expect(result.stderr).toContain("push verification failed for app@1.0.0");
      expect(await git(repo, ["rev-parse", "app@1.0.0^{}"])).toBe(head);
      expect(await git(repo, ["ls-remote", "--tags", "origin", "refs/tags/app@1.0.0"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("fails when configured remote tags cannot be read", async () => {
    const { repo, root } = await createRepo();

    try {
      await git(repo, ["remote", "remove", "origin"]);

      const result = await run(["tag", "--channel", "stable", "--version", "1.0.0"], repo, true);

      expect(result).toMatchObject({ exitCode: 1, stdout: "" });
      expect(result.stderr).toContain("failed to read remote tags from origin");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("rejects removed approval flags before tag preflight", async () => {
    const { repo, root } = await createRepo();

    try {
      const longFlag = await run(
        ["tag", "--channel", "stable", "--version", "1.0.0", "--yes"],
        repo,
      );
      const shorthand = await run(["tag", "-y", "--channel", "stable", "--version", "1.0.0"], repo);

      for (const result of [longFlag, shorthand]) {
        expect(result).toMatchObject({ exitCode: 1, stdout: "" });
        expect(result.stderr).toContain("unknown option");
        expect(result.stderr).not.toContain("tag requires exactly one of --bump or --version");
      }
      expect(longFlag.stderr).toContain("unknown option --yes");
      // `-y` was never accepted; this guards against introducing an approval shorthand later.
      expect(shorthand.stderr).toContain("unknown option -y");
      expect(await git(repo, ["tag", "--list"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("performs inherited duplicate protection before mutation", async () => {
    const { repo, root } = await createRepo();

    try {
      await git(repo, ["tag", "-a", "app@1.0.0", "-m", "existing"]);
      await git(repo, ["push", "-q", "origin", "app@1.0.0"]);
      await git(repo, ["tag", "-d", "app@1.0.0"]);
      const result = await run(["tag", "--channel", "stable", "--version", "1.0.0"], repo);

      expect(result).toMatchObject({ exitCode: 1, stdout: "" });
      expect(result.stderr).toContain("tag app@1.0.0 already exists locally or remotely");
      expect(await git(repo, ["tag", "--list"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("tag dry-run command", () => {
  test("reports an explicit unknown target before validating unrelated target paths", async () => {
    const { repo, root } = await createRepo(invalidSecondTargetPathConfig());

    try {
      const result = await run(
        ["tag", "--target", "typo", "--channel", "stable", "--version", "1.0.0", "--dry-run"],
        repo,
      );

      expect(result).toMatchObject({ exitCode: 1, stdout: "" });
      expect(result.stderr).toContain("unknown target typo");
      expect(result.stderr).not.toContain("targets.api.path");
      expect(await git(repo, ["tag", "--list"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("reports a missing target selection before validating unrelated target paths", async () => {
    const { repo, root } = await createRepo(invalidSecondTargetPathConfig());

    try {
      const result = await run(
        ["tag", "--channel", "stable", "--version", "1.0.0", "--dry-run"],
        repo,
      );

      expect(result).toMatchObject({ exitCode: 1, stdout: "" });
      expect(result.stderr).toContain("tag requires --target when config has multiple targets");
      expect(result.stderr).not.toContain("targets.api.path");
      expect(await git(repo, ["tag", "--list"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("performs full preflight, emits deterministic JSON, and does not create or push tags", async () => {
    const { repo, root } = await createRepo();

    try {
      const head = await git(repo, ["rev-parse", "HEAD"]);
      const result = await run(
        ["tag", "--channel", "stable", "--bump", "patch", "--dry-run", "--push", "--json"],
        repo,
        true,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        target: "app",
        channel: "stable",
        strategy: "stable",
        version: "1.0.1",
        baseVersion: "1.0.1",
        tag: "app@1.0.1",
        tagMessage: "Release app 1.0.1",
        commit: head,
        created: false,
        pushed: false,
        dryRun: true,
      });
      expect(await git(repo, ["tag", "--list"])).toBe("");
      expect(await git(repo, ["ls-remote", "--tags", "origin"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("uses local-only prior managed tags for later tag resolution", async () => {
    const { repo, root } = await createRepo();

    try {
      const created = await run(["tag", "--channel", "stable", "--version", "1.0.0"], repo);
      const dryRun = await run(
        ["tag", "--channel", "stable", "--bump", "patch", "--dry-run", "--json"],
        repo,
        true,
      );

      expect(created.exitCode).toBe(0);
      expect(dryRun.exitCode).toBe(0);
      expect(dryRun.stderr).toBe("");
      expect(JSON.parse(dryRun.stdout)).toMatchObject({ version: "1.0.1", tag: "app@1.0.1" });
      expect(await git(repo, ["ls-remote", "--tags", "origin"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("uses remote-only prior managed tags for later tag resolution", async () => {
    const { repo, root } = await createRepo();

    try {
      await git(repo, ["tag", "-a", "app@1.0.0", "-m", "existing"]);
      await git(repo, ["push", "-q", "origin", "app@1.0.0"]);
      await git(repo, ["tag", "-d", "app@1.0.0"]);

      const dryRun = await run(
        ["tag", "--channel", "stable", "--bump", "patch", "--dry-run", "--json"],
        repo,
        true,
      );

      expect(dryRun.exitCode).toBe(0);
      expect(dryRun.stderr).toBe("");
      expect(JSON.parse(dryRun.stdout)).toMatchObject({ version: "1.0.1", tag: "app@1.0.1" });
      expect(await git(repo, ["tag", "--list"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("human dry-run states no tag was created and whether push would happen", async () => {
    const { repo, root } = await createRepo();

    try {
      const result = await run(
        ["tag", "--channel", "stable", "--version", "1.0.0", "--dry-run", "--push"],
        repo,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("app@1.0.0");
      expect(result.stdout).toContain("No tag was created");
      expect(result.stdout).toContain("would have pushed");
      expect(await git(repo, ["tag", "--list"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("emits config warnings in human mode but suppresses them in JSON mode", async () => {
    const { repo, root } = await createRepo();

    try {
      await writeFile(join(repo, ".tagsmith.jsonc"), warningConfig());
      await git(repo, ["add", ".tagsmith.jsonc"]);
      await git(repo, ["commit", "-qm", "warning config"]);
      await git(repo, ["push", "-q", "origin", "main"]);
      const human = await run(
        ["tag", "--channel", "stable", "--version", "1.0.0", "--dry-run"],
        repo,
      );
      const json = await run(
        ["tag", "--channel", "stable", "--version", "1.0.0", "--dry-run", "--json"],
        repo,
        true,
      );

      expect(human.exitCode).toBe(0);
      expect(human.stderr).toContain("warning: defaults.tagPattern {version} touches");
      expect(human.stdout).toContain("app1.0.0");
      expect(json.exitCode).toBe(0);
      expect(json.stderr).toBe("");
      expect(json.stdout).not.toContain("warning");
      expect(JSON.parse(json.stdout)).toMatchObject({ tag: "app1.0.0" });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("validates flags, clean tree, remote base tip, and malformed managed tags before dry-run success", async () => {
    const { repo, root } = await createRepo();

    try {
      const missingMode = await run(["tag", "--channel", "stable", "--dry-run"], repo, true);
      const bothModes = await run(
        ["tag", "--channel", "stable", "--bump", "patch", "--version", "1.2.3", "--dry-run"],
        repo,
        true,
      );
      const invalidBump = await run(
        ["tag", "--channel", "stable", "--bump", "prerelease", "--dry-run"],
        repo,
        true,
      );
      await writeFile(join(repo, "dirty.txt"), "dirty\n");
      const dirty = await run(
        ["tag", "--channel", "stable", "--bump", "patch", "--dry-run"],
        repo,
        true,
      );
      await rm(join(repo, "dirty.txt"));
      await git(repo, ["tag", "app@bad"]);
      const malformed = await run(
        ["tag", "--channel", "stable", "--bump", "patch", "--dry-run"],
        repo,
        true,
      );
      await git(repo, ["tag", "-d", "app@bad"]);
      await writeFile(join(repo, "README.md"), "repo changed\n");
      await git(repo, ["add", "."]);
      await git(repo, ["commit", "-qm", "ahead"]);
      const ahead = await run(
        ["tag", "--channel", "stable", "--bump", "patch", "--dry-run"],
        repo,
        true,
      );

      expect(missingMode).toMatchObject({ exitCode: 1, stdout: "" });
      expect(missingMode.stderr).toContain("exactly one of --bump or --version");
      expect(bothModes).toMatchObject({ exitCode: 1, stdout: "" });
      expect(bothModes.stderr).toContain("exactly one of --bump or --version");
      expect(invalidBump).toMatchObject({ exitCode: 1, stdout: "" });
      expect(invalidBump.stderr).toContain("rejects --bump prerelease");
      expect(dirty).toMatchObject({ exitCode: 1, stdout: "" });
      expect(dirty.stderr).toContain("working tree must be clean");
      expect(malformed).toMatchObject({ exitCode: 1, stdout: "" });
      expect(malformed.stderr).toContain("malformed managed tag");
      expect(ahead).toMatchObject({ exitCode: 1, stdout: "" });
      expect(ahead.stderr).toContain("HEAD must equal origin/main");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
