import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { runCli, type RunCliOptions } from "@/cli/create-cli";
import { initConfigTemplate } from "@/core/init/init-template";
import type { ConfirmInitInput, PromptAdapter } from "@/interactive/prompt-adapter";

import { git, withPoisonedGitLocalEnv } from "../helpers/git";

class MemoryWriter {
  text = "";

  write(chunk: string): boolean {
    this.text += chunk;
    return true;
  }
}

class RecordingPromptAdapter implements PromptAdapter {
  readonly decisions: Array<"cancel" | "confirm">;
  cancellations: string[] = [];
  initPrompts: ConfirmInitInput[] = [];
  onConfirmInit?: (input: ConfirmInitInput) => Promise<void> | void;

  constructor(decisions: Array<"cancel" | "confirm"> = ["confirm"]) {
    this.decisions = decisions;
  }

  async cancel(message: string): Promise<void> {
    this.cancellations.push(message);
  }

  async confirmInit(input: ConfirmInitInput): Promise<"cancel" | "confirm"> {
    this.initPrompts.push(input);
    await this.onConfirmInit?.(input);
    return this.decisions.shift() ?? "cancel";
  }

  async promptValidateTag(): Promise<{ readonly type: "cancel" }> {
    return { type: "cancel" };
  }

  async renderTargets(): Promise<void> {}

  async renderValidate(): Promise<void> {}

  async renderValidateWarnings(): Promise<void> {}

  async selectValidateAssertions(): Promise<{ readonly type: "infer" }> {
    return { type: "infer" };
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
  test("eligible TTY first-time init reviews destination and writes only after confirmation", async () => {
    const repo = await createRepo();
    const promptAdapter = new RecordingPromptAdapter(["confirm"]);
    const destination = join(repo, ".tagsmith.jsonc");
    const resolvedDestination = join(await realpath(repo), ".tagsmith.jsonc");

    try {
      promptAdapter.onConfirmInit = async (input) => {
        expect(input).toMatchObject({
          defaultAction: "confirm",
          destination: resolvedDestination,
          equivalentCommand: "tagsmith init",
          existingConfig: false,
        });
        expect(await pathExists(destination)).toBe(false);
      };

      const result = await run(["init"], repo, false, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(result).toMatchObject({ exitCode: 0, stderr: "", stdout: "" });
      expect(promptAdapter.initPrompts).toHaveLength(1);
      expect(await readFile(destination, "utf8")).toBe(initConfigTemplate);
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });

  test("eligible TTY existing-config init defaults safe negative and cancels without mutation", async () => {
    const repo = await createRepo();
    const promptAdapter = new RecordingPromptAdapter(["cancel"]);
    const destination = join(repo, ".tagsmith.jsonc");
    const resolvedDestination = join(await realpath(repo), ".tagsmith.jsonc");

    try {
      await writeFile(destination, "existing\n");

      const result = await run(["init"], repo, false, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(result).toMatchObject({ exitCode: 1, stderr: "", stdout: "" });
      expect(promptAdapter.initPrompts).toEqual([
        {
          defaultAction: "cancel",
          destination: resolvedDestination,
          equivalentCommand: "tagsmith init --force",
          existingConfig: true,
        },
      ]);
      expect(promptAdapter.cancellations).toEqual(["tagsmith cancelled."]);
      expect(await readFile(destination, "utf8")).toBe("existing\n");
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });

  test("eligible TTY --force still requires overwrite confirmation before mutation", async () => {
    const repo = await createRepo();
    const promptAdapter = new RecordingPromptAdapter(["confirm"]);
    const destination = join(repo, ".tagsmith.jsonc");

    try {
      await writeFile(destination, "existing\n");
      promptAdapter.onConfirmInit = async (input) => {
        expect(input).toMatchObject({
          defaultAction: "cancel",
          equivalentCommand: "tagsmith init --force",
          existingConfig: true,
        });
        expect(await readFile(destination, "utf8")).toBe("existing\n");
      };

      const result = await run(["init", "--force"], repo, false, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(result).toMatchObject({ exitCode: 0, stderr: "", stdout: "" });
      expect(promptAdapter.initPrompts).toHaveLength(1);
      expect(await readFile(destination, "utf8")).toBe(initConfigTemplate);
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });

  test("eligible TTY init equivalent command includes supplied config with shell escaping", async () => {
    const repo = await createRepo();
    const promptAdapter = new RecordingPromptAdapter(["cancel"]);
    const configPath = "release config/tagsmith's.jsonc";

    try {
      await mkdir(join(repo, "release config"));

      const result = await run(["--config", configPath, "init"], repo, false, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(result.exitCode).toBe(1);
      expect(promptAdapter.initPrompts[0]?.equivalentCommand).toBe(
        "tagsmith --config 'release config/tagsmith'\\''s.jsonc' init",
      );
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });

  test("TTY init dry-run stays raw and never prompts", async () => {
    const repo = await createRepo();
    const promptAdapter = new RecordingPromptAdapter(["confirm"]);
    const destination = join(repo, "missing", ".tagsmith.jsonc");

    try {
      const result = await run(
        ["--config", destination, "init", "--dry-run", "--force"],
        repo,
        true,
        {
          promptAdapter,
          stdinIsTty: true,
          stdoutIsTty: true,
        },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe(initConfigTemplate);
      expect(promptAdapter.initPrompts).toHaveLength(0);
      expect(await pathExists(destination)).toBe(false);
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });

  test("CI disables init prompts even when TTY flags are true", async () => {
    const repo = await createRepo();
    const promptAdapter = new RecordingPromptAdapter(["confirm"]);
    const destination = join(repo, ".tagsmith.jsonc");

    try {
      await writeFile(destination, "existing\n");

      const result = await run(["init"], repo, false, {
        ci: true,
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("already exists");
      expect(promptAdapter.initPrompts).toHaveLength(0);
      expect(await readFile(destination, "utf8")).toBe("existing\n");
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });

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
