import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  const root = await mkdtemp(join(tmpdir(), "tagsmith-tag-"));
  const remote = join(root, "remote.git");
  const repo = join(root, "repo");
  await git(root, ["init", "--bare", "-q", remote]);
  await git(root, ["clone", "-q", remote, repo]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Test User"]);
  await git(repo, ["switch", "-c", "main"]);
  await mkdir(join(repo, "apps/app"), { recursive: true });
  await writeFile(join(repo, "README.md"), "repo\n");
  await writeFile(join(repo, "apps/app/file.txt"), "app\n");
  await writeFile(join(repo, ".tagsmith.jsonc"), config());
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
        { "name": "prod", "strategy": "stable" }
      ]
    }
  }
}`;
}

function warningConfig() {
  return config().replace('"tagPattern": "{target}@{version}"', '"tagPattern": "app{version}"');
}

describe("tag creation command", () => {
  test("creates one annotated local tag at HEAD without pushing by default", async () => {
    const { repo, root } = await createRepo();

    try {
      const head = await git(repo, ["rev-parse", "HEAD"]);
      const result = await run(["tag", "--channel", "prod", "--version", "1.0.0"], repo);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("app@1.0.0");
      expect(result.stdout).toContain("target app");
      expect(result.stdout).toContain("channel prod");
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
        const result = await run(["tag", "--channel", "prod", "--version", "1.0.0"], repo);

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
        ["tag", "--channel", "prod", "--bump", "patch", "--push", "--json"],
        repo,
        true,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        target: "app",
        channel: "prod",
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
      const result = await run(["tag", "--channel", "prod", "--version", "1.0.0", "--push"], repo);

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
      const result = await run(["tag", "--channel", "prod", "--version", "1.0.0", "--push"], repo);

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
      const result = await run(["tag", "--channel", "prod", "--version", "1.0.0", "--push"], repo);

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

      const result = await run(["tag", "--channel", "prod", "--version", "1.0.0"], repo, true);

      expect(result).toMatchObject({ exitCode: 1, stdout: "" });
      expect(result.stderr).toContain("failed to read remote tags from origin");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("rejects removed approval flags before tag preflight", async () => {
    const { repo, root } = await createRepo();

    try {
      const longFlag = await run(["tag", "--channel", "prod", "--version", "1.0.0", "--yes"], repo);
      const shorthand = await run(["tag", "-y", "--channel", "prod", "--version", "1.0.0"], repo);

      for (const result of [longFlag, shorthand]) {
        expect(result).toMatchObject({ exitCode: 1, stdout: "" });
        expect(result.stderr).toContain("unknown option");
        expect(result.stderr).not.toContain("tag requires exactly one of --bump or --version");
      }
      expect(longFlag.stderr).toContain("unknown option --yes");
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
      const result = await run(["tag", "--channel", "prod", "--version", "1.0.0"], repo);

      expect(result).toMatchObject({ exitCode: 1, stdout: "" });
      expect(result.stderr).toContain("tag app@1.0.0 already exists locally or remotely");
      expect(await git(repo, ["tag", "--list"])).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("tag dry-run command", () => {
  test("performs full preflight, emits deterministic JSON, and does not create or push tags", async () => {
    const { repo, root } = await createRepo();

    try {
      const head = await git(repo, ["rev-parse", "HEAD"]);
      const result = await run(
        ["tag", "--channel", "prod", "--bump", "patch", "--dry-run", "--push", "--json"],
        repo,
        true,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        target: "app",
        channel: "prod",
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
      const created = await run(["tag", "--channel", "prod", "--version", "1.0.0"], repo);
      const dryRun = await run(
        ["tag", "--channel", "prod", "--bump", "patch", "--dry-run", "--json"],
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
        ["tag", "--channel", "prod", "--bump", "patch", "--dry-run", "--json"],
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
        ["tag", "--channel", "prod", "--version", "1.0.0", "--dry-run", "--push"],
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
        ["tag", "--channel", "prod", "--version", "1.0.0", "--dry-run"],
        repo,
      );
      const json = await run(
        ["tag", "--channel", "prod", "--version", "1.0.0", "--dry-run", "--json"],
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
      const missingMode = await run(["tag", "--channel", "prod", "--dry-run"], repo, true);
      const bothModes = await run(
        ["tag", "--channel", "prod", "--bump", "patch", "--version", "1.2.3", "--dry-run"],
        repo,
        true,
      );
      const invalidBump = await run(
        ["tag", "--channel", "prod", "--bump", "prerelease", "--dry-run"],
        repo,
        true,
      );
      await writeFile(join(repo, "dirty.txt"), "dirty\n");
      const dirty = await run(
        ["tag", "--channel", "prod", "--bump", "patch", "--dry-run"],
        repo,
        true,
      );
      await rm(join(repo, "dirty.txt"));
      await git(repo, ["tag", "app@bad"]);
      const malformed = await run(
        ["tag", "--channel", "prod", "--bump", "patch", "--dry-run"],
        repo,
        true,
      );
      await git(repo, ["tag", "-d", "app@bad"]);
      await writeFile(join(repo, "README.md"), "repo changed\n");
      await git(repo, ["add", "."]);
      await git(repo, ["commit", "-qm", "ahead"]);
      const ahead = await run(
        ["tag", "--channel", "prod", "--bump", "patch", "--dry-run"],
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
