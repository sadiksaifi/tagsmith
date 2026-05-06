import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, test } from "vitest";

import { runCli } from "@/cli/create-cli";

const execFileAsync = promisify(execFile);

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

async function git(cwd: string, args: string[]) {
  const result = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return result.stdout.trim();
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
