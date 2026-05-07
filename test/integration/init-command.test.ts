import { lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { runCli } from "@/cli/create-cli";
import { initConfigTemplate } from "@/core/init/init-template";

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
  const repo = await mkdtemp(join(tmpdir(), "tagsmith-init-repo-"));
  await git(repo, ["init", "-q"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Test User"]);
  await writeFile(join(repo, "README.md"), "repo\n");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-qm", "init"]);
  return repo;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("init command", () => {
  test("discovers the repo root from nested cwd and writes the default config template", async () => {
    const repo = await createRepo();

    try {
      await mkdir(join(repo, "apps/api"), { recursive: true });

      const result = await run(["init"], join(repo, "apps/api"));

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain(".tagsmith.jsonc");
      expect(result.stdout).toContain(repo);
      expect(await readFile(join(repo, ".tagsmith.jsonc"), "utf8")).toBe(initConfigTemplate);
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });

  test("ignores inherited Git hook repository context when discovering the repo root", async () => {
    const hookRepo = await createRepo();
    const repo = await createRepo();
    try {
      await mkdir(join(repo, "apps/api"), { recursive: true });
      const repoRoot = await git(repo, ["rev-parse", "--show-toplevel"]);
      const hookRepoRoot = await git(hookRepo, ["rev-parse", "--show-toplevel"]);

      await withPoisonedGitLocalEnv(hookRepo, async () => {
        const result = await run(["init"], join(repo, "apps/api"));

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.stdout).toContain(repoRoot);
        expect(result.stdout).not.toContain(hookRepoRoot);
      });
      expect(await readFile(join(repo, ".tagsmith.jsonc"), "utf8")).toBe(initConfigTemplate);
      expect(await pathExists(join(hookRepo, ".tagsmith.jsonc"))).toBe(false);
    } finally {
      await rm(repo, { force: true, recursive: true });
      await rm(hookRepo, { force: true, recursive: true });
    }
  });

  test("resolves --config relative to repo root and absolute destinations as-is", async () => {
    const repo = await createRepo();
    const outside = await mkdtemp(join(tmpdir(), "tagsmith-init-config-"));

    try {
      await mkdir(join(repo, "configs"));

      const relative = await run(["--config", "configs/tagsmith.jsonc", "init"], repo);
      const absolute = await run(["--config", join(outside, "tagsmith.jsonc"), "init"], repo);

      expect(relative).toMatchObject({ exitCode: 0, stderr: "" });
      expect(absolute).toMatchObject({ exitCode: 0, stderr: "" });
      expect(await readFile(join(repo, "configs/tagsmith.jsonc"), "utf8")).toBe(initConfigTemplate);
      expect(await readFile(join(outside, "tagsmith.jsonc"), "utf8")).toBe(initConfigTemplate);
    } finally {
      await rm(repo, { force: true, recursive: true });
      await rm(outside, { force: true, recursive: true });
    }
  });

  test("refuses existing destinations unless --force is provided", async () => {
    const repo = await createRepo();
    const destination = join(repo, ".tagsmith.jsonc");

    try {
      await writeFile(destination, "existing\n");

      const refused = await run(["init"], repo);
      const forced = await run(["init", "--force"], repo);

      expect(refused.exitCode).toBe(1);
      expect(refused.stdout).toBe("");
      expect(refused.stderr).toContain("already exists");
      expect(forced).toMatchObject({ exitCode: 0, stderr: "" });
      expect(await readFile(destination, "utf8")).toBe(initConfigTemplate);
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });

  test("refuses dangling symlink destinations without --force", async () => {
    const repo = await createRepo();
    const destination = join(repo, ".tagsmith.jsonc");
    const symlinkTarget = "missing-target.jsonc";

    try {
      await symlink(symlinkTarget, destination);

      const result = await run(["init"], repo);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("already exists");
      expect((await lstat(destination)).isSymbolicLink()).toBe(true);
      expect(await pathExists(join(repo, symlinkTarget))).toBe(false);
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });

  test("fails when the destination parent directory does not exist", async () => {
    const repo = await createRepo();
    const destination = join(repo, "missing", ".tagsmith.jsonc");

    try {
      const result = await run(["--config", destination, "init"], repo);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("parent directory");
      expect(result.stderr).toContain(join(repo, "missing"));
      expect(await pathExists(destination)).toBe(false);
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });

  test("dry-run prints exact raw template bytes, writes nothing, and skips destination checks", async () => {
    const repo = await createRepo();
    const destination = join(repo, "missing", ".tagsmith.jsonc");

    try {
      const result = await run(
        ["--config", destination, "init", "--dry-run", "--force"],
        repo,
        true,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe(initConfigTemplate);
      expect(result.stdout).not.toContain(String.fromCodePoint(27));
      expect(await pathExists(destination)).toBe(false);
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });

  test("rejects init --json without loading config or writing output", async () => {
    const repo = await createRepo();

    try {
      const result = await run(["init", "--json"], repo, true);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("unknown option --json");
      expect(await pathExists(join(repo, ".tagsmith.jsonc"))).toBe(false);
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });
});
