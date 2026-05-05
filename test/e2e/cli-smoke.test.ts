import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, test } from "vitest";

import packageJson from "../../package.json" with { type: "json" };

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));

async function runBuiltCli(args: string[]) {
  return runFile(process.execPath, [cliPath, ...args]);
}

async function runFile(file: string, args: string[]) {
  const result = await execFileAsync(file, args, { encoding: "utf8" });

  return {
    stderr: result.stderr,
    stdout: result.stdout,
  };
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
