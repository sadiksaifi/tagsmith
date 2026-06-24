import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { runCli } from "@/cli/create-cli";

import { git } from "../helpers/git";

class MemoryWriter {
  text = "";

  write(chunk: string): boolean {
    this.text += chunk;
    return true;
  }
}

async function run(argv: string[], cwd: string) {
  const stdout = new MemoryWriter();
  const stderr = new MemoryWriter();
  const exitCode = await runCli({
    argv,
    cwd,
    packageVersion: "0.0.0",
    stderr,
    stdout,
  });

  return { exitCode, stderr: stderr.text, stdout: stdout.text };
}

async function createRepo() {
  const root = await mkdtemp(join(tmpdir(), "tagsmith-list-"));
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
  return { repo, root };
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

async function tagAndPush(repo: string, tag: string) {
  await git(repo, ["tag", "-a", tag, "-m", `Release ${tag}`]);
  await git(repo, ["push", "-q", "origin", tag]);
}

describe("list command", () => {
  test("json output defaults to local and remote matching tags with source status", async () => {
    const { repo, root } = await createRepo();

    try {
      await tagAndPush(repo, "app@1.1.0");
      await git(repo, ["tag", "-a", "app@1.2.0", "-m", "Release app@1.2.0"]);
      await tagAndPush(repo, "app@1.3.0");
      await git(repo, ["tag", "-d", "app@1.3.0"]);

      const result = await run(["list", "--json"], repo);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject([
        { local: false, remote: true, status: "remote-only", tag: "app@1.3.0" },
        { local: true, remote: false, status: "local-only", tag: "app@1.2.0" },
        { local: true, remote: true, status: "local+remote", tag: "app@1.1.0" },
      ]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("local and remote flags restrict listed sources", async () => {
    const { repo, root } = await createRepo();

    try {
      await tagAndPush(repo, "app@1.1.0");
      await git(repo, ["tag", "-a", "app@1.2.0", "-m", "Release app@1.2.0"]);
      await tagAndPush(repo, "app@1.3.0");
      await git(repo, ["tag", "-d", "app@1.3.0"]);

      const local = await run(["list", "--local", "--json"], repo);
      const remote = await run(["list", "--remote", "--json"], repo);

      expect(local.exitCode).toBe(0);
      expect(JSON.parse(local.stdout).map((tag: { tag: string }) => tag.tag)).toEqual([
        "app@1.2.0",
        "app@1.1.0",
      ]);
      expect(remote.exitCode).toBe(0);
      expect(JSON.parse(remote.stdout).map((tag: { tag: string }) => tag.tag)).toEqual([
        "app@1.3.0",
        "app@1.1.0",
      ]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("channel flag restricts listed tags to a configured channel", async () => {
    const { repo, root } = await createRepo();

    try {
      await tagAndPush(repo, "app@1.1.0");
      await tagAndPush(repo, "app@1.2.0-rc.1");

      const listed = await run(["list", "--channel", "rc", "--json"], repo);
      const unknown = await run(["list", "--channel", "missing", "--json"], repo);

      expect(listed.exitCode).toBe(0);
      expect(listed.stderr).toBe("");
      expect(JSON.parse(listed.stdout).map((tag: { tag: string }) => tag.tag)).toEqual([
        "app@1.2.0-rc.1",
      ]);

      expect(unknown.exitCode).toBe(1);
      expect(unknown.stdout).toBe("");
      expect(unknown.stderr).toContain("unknown channel missing");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("human output shows legacy status, ignores unrelated tags, and reports unknown targets", async () => {
    const { repo, root } = await createRepo();

    try {
      await tagAndPush(repo, "app@1.1.0");
      await git(repo, ["tag", "app@1.0.0"]);
      await git(repo, ["push", "-q", "origin", "app@1.0.0"]);
      await git(repo, ["tag", "-a", "other@9.9.9", "-m", "unrelated"]);

      const listed = await run(["list", "--target", "app"], repo);
      const unknown = await run(["list", "--target", "missing"], repo);

      expect(listed.exitCode).toBe(0);
      expect(listed.stderr).toBe("");
      expect(listed.stdout).toContain("tag");
      expect(listed.stdout).toContain("target");
      expect(listed.stdout).toContain("channel");
      expect(listed.stdout).toContain("version");
      expect(listed.stdout).toContain("status");
      expect(listed.stdout).toContain("app@1.1.0");
      expect(listed.stdout).toContain("local+remote");
      expect(listed.stdout).toContain("app@1.0.0");
      expect(listed.stdout).toContain("legacy local+remote");
      expect(listed.stdout).not.toContain("other@9.9.9");

      expect(unknown.exitCode).toBe(1);
      expect(unknown.stdout).toBe("");
      expect(unknown.stderr).toContain("unknown target missing");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
