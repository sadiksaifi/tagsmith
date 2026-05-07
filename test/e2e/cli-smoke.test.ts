import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, test } from "vitest";

import packageJson from "../../package.json" with { type: "json" };
import { git, poisonedGitLocalEnv } from "../helpers/git";

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));

async function runBuiltCli(args: string[], cwd?: string, env?: NodeJS.ProcessEnv) {
  return runFile(process.execPath, [cliPath, ...args], cwd, env);
}

async function runFile(file: string, args: string[], cwd?: string, env?: NodeJS.ProcessEnv) {
  const result = await execFileAsync(file, args, { cwd, encoding: "utf8", env });

  return {
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

async function createRepo() {
  const root = await mkdtemp(join(tmpdir(), "tagsmith-e2e-"));
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
        { "name": "prod", "strategy": "stable" }
      ]
    }
  }
}`;
}

describe("built CLI smoke", () => {
  test("no-args help, global help, global version, and command help succeed", async () => {
    const helpResults = await Promise.all(
      [
        [],
        ["--help"],
        ["init", "--help"],
        ["tag", "--help"],
        ["validate", "--help"],
        ["targets", "--help"],
      ].map((args) => runBuiltCli(args)),
    );

    for (const result of helpResults) {
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("tagsmith");
    }

    const version = await runBuiltCli(["--version"]);

    expect(version.stderr).toBe("");
    expect(version.stdout).toBe(`${packageJson.version}\n`);
  });

  test("built CLI resolves the requested repo when Git hook context points elsewhere", async () => {
    const hook = await createRepo();
    const { repo, root } = await createRepo();

    try {
      const result = await runBuiltCli(["targets", "--json"], repo, poisonedGitLocalEnv(hook.repo));

      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        targets: { app: { path: "apps/app" } },
      });
    } finally {
      await rm(root, { force: true, recursive: true });
      await rm(hook.root, { force: true, recursive: true });
    }
  });

  test("built init, targets, tag, and validate command flows succeed", async () => {
    const { repo, root } = await createRepo();

    try {
      const head = await git(repo, ["rev-parse", "HEAD"]);

      const init = await runBuiltCli(["init", "--dry-run"], repo);
      expect(init.stderr).toBe("");
      expect(init.stdout).toContain('"configVersion": 1');
      expect(init.stdout).not.toContain(String.fromCodePoint(27));

      const targets = await runBuiltCli(["targets", "--json"], repo);
      expect(targets.stderr).toBe("");
      expect(JSON.parse(targets.stdout)).toMatchObject({
        targets: { app: { path: "apps/app" } },
      });
      expect(targets.stdout).not.toContain(String.fromCodePoint(27));

      const tag = await runBuiltCli(
        ["tag", "--channel", "prod", "--version", "1.0.0", "--dry-run", "--json"],
        repo,
      );
      expect(tag.stderr).toBe("");
      expect(JSON.parse(tag.stdout)).toMatchObject({
        commit: head,
        dryRun: true,
        tag: "app@1.0.0",
      });

      await git(repo, ["tag", "-a", "app@1.0.0", "-m", "Release app 1.0.0"]);
      await git(repo, ["push", "-q", "origin", "app@1.0.0"]);
      const validate = await runBuiltCli(["validate", "--tag", "app@1.0.0", "--json"], repo);
      expect(validate.stderr).toBe("");
      expect(JSON.parse(validate.stdout)).toMatchObject({
        commit: head,
        tag: "app@1.0.0",
        valid: true,
      });

      const githubOutputPath = join(root, "GITHUB_OUTPUT");
      const githubOutput = await runBuiltCli(
        ["validate", "--tag", "app@1.0.0", "--github-output"],
        repo,
        {
          ...process.env,
          GITHUB_OUTPUT: githubOutputPath,
        },
      );
      expect(githubOutput).toEqual({ stderr: "", stdout: "" });
      await expect(readFile(githubOutputPath, "utf8")).resolves.toContain("tag=app@1.0.0\n");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("package-bin symlink invocation runs the CLI", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "tagsmith-bin-"));
    const symlinkPath = join(tempDirectory, "tagsmith");

    try {
      await symlink(cliPath, symlinkPath);

      const result = await runFile(symlinkPath, ["--version"]);

      expect(result.stderr).toBe("");
      expect(result.stdout).toBe(`${packageJson.version}\n`);
    } finally {
      await rm(tempDirectory, { force: true, recursive: true });
    }
  });
});
