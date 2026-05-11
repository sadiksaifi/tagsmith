import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { cliCommands, type CommandName } from "@/cli/cli-contract";
import { runCli, type RunCliOptions } from "@/cli/create-cli";
import type {
  ConfirmInitInput,
  PromptAdapter,
  PromptSelectDecision,
  RenderTargetsInput,
} from "@/interactive/prompt-adapter";

import { git } from "../helpers/git";

class MemoryWriter {
  text = "";

  write(chunk: string): boolean {
    this.text += chunk;
    return true;
  }
}

interface ActionMenuInput {
  readonly commands: readonly { readonly description: string; readonly name: CommandName }[];
}

class RecordingPromptAdapter implements PromptAdapter {
  readonly actionSelections: CommandName[];
  actionMenus: ActionMenuInput[] = [];
  initPrompts: ConfirmInitInput[] = [];
  targetsRenders: RenderTargetsInput[] = [];

  constructor(actionSelections: CommandName[] = ["init"]) {
    this.actionSelections = [...actionSelections];
  }

  async cancel(): Promise<void> {}

  async confirmInit(input: ConfirmInitInput): Promise<"confirm"> {
    this.initPrompts.push(input);
    return "confirm";
  }

  async promptTagVersion(): Promise<{ readonly type: "cancel" }> {
    return { type: "cancel" };
  }

  async promptValidateTag(): Promise<{ readonly type: "cancel" }> {
    return { type: "cancel" };
  }

  async renderTagDryRun(): Promise<void> {}

  async renderTagReview(): Promise<"cancel"> {
    return "cancel";
  }

  async renderTagWarnings(): Promise<void> {}

  async renderTargets(input: RenderTargetsInput): Promise<void> {
    this.targetsRenders.push(input);
  }

  async renderValidate(): Promise<void> {}

  async renderValidateWarnings(): Promise<void> {}

  async selectAction(input: ActionMenuInput): Promise<PromptSelectDecision<CommandName>> {
    this.actionMenus.push(input);
    const selected = this.actionSelections.shift();
    return selected === undefined ? { type: "cancel" } : { type: "select", value: selected };
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

  async selectValidateAssertions(): Promise<{ readonly type: "infer" }> {
    return { type: "infer" };
  }
}

async function run(
  argv: string[],
  cwd: string,
  overrides: Partial<RunCliOptions> = {},
): Promise<{ readonly exitCode: number; readonly stderr: string; readonly stdout: string }> {
  const stdout = new MemoryWriter();
  const stderr = new MemoryWriter();
  const exitCode = await runCli({
    argv,
    cwd,
    packageVersion: "0.0.0",
    stderr,
    stdout,
    ...overrides,
  });

  return { exitCode, stderr: stderr.text, stdout: stdout.text };
}

async function createRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "tagsmith-menu-repo-"));
  await git(repo, ["init", "-q"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Test User"]);
  await writeFile(join(repo, "README.md"), "repo\n");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-qm", "init"]);
  return repo;
}

function config(): string {
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
      "path": ".",
      "channels": [{ "name": "stable", "strategy": "stable" }]
    }
  }
}`;
}

describe("bare action menu", () => {
  test("eligible TTY bare tagsmith requires Git context before showing action menu", async () => {
    const notRepo = await mkdtemp(join(tmpdir(), "tagsmith-menu-not-repo-"));
    const promptAdapter = new RecordingPromptAdapter();

    try {
      const result = await run([], notRepo, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("tagsmith failed:");
      expect(promptAdapter.actionMenus).toHaveLength(0);
    } finally {
      await rm(notRepo, { force: true, recursive: true });
    }
  });

  test("eligible TTY bare tagsmith opens the shared action menu before config is required", async () => {
    const repo = await createRepo();
    const promptAdapter = new RecordingPromptAdapter(["init"]);

    try {
      const result = await run([], repo, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(result).toMatchObject({ exitCode: 0, stderr: "", stdout: "" });
      expect(promptAdapter.actionMenus).toEqual([
        {
          commands: cliCommands.map(({ description, name }) => ({ description, name })),
        },
      ]);
      expect(promptAdapter.initPrompts).toHaveLength(1);
      await expect(readFile(join(repo, ".tagsmith.jsonc"), "utf8")).resolves.toContain(
        '"configVersion": 1',
      );
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });

  test("global flags before bare interactive mode carry into the selected command", async () => {
    const repo = await createRepo();
    const promptAdapter = new RecordingPromptAdapter(["init"]);
    const customConfig = "release config/tagsmith.jsonc";
    await mkdir(join(repo, "release config"));

    try {
      const result = await run(["--config", customConfig, "--verbose"], repo, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(result).toMatchObject({ exitCode: 0, stderr: "", stdout: "" });
      expect(promptAdapter.actionMenus).toHaveLength(1);
      expect(promptAdapter.initPrompts[0]?.equivalentCommand).toBe(
        "tagsmith --config 'release config/tagsmith.jsonc' init",
      );
      await expect(readFile(join(repo, customConfig), "utf8")).resolves.toContain(
        '"configVersion": 1',
      );
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });

  test("selecting a config-required command does not auto-pivot to init", async () => {
    const repo = await createRepo();
    const promptAdapter = new RecordingPromptAdapter(["tag"]);

    try {
      const result = await run([], repo, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(".tagsmith.jsonc");
      expect(promptAdapter.actionMenus).toHaveLength(1);
      expect(promptAdapter.initPrompts).toHaveLength(0);
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });

  test("selected command exits after completion without looping back to the menu", async () => {
    const repo = await createRepo();
    const promptAdapter = new RecordingPromptAdapter(["targets", "init"]);

    try {
      await writeFile(join(repo, ".tagsmith.jsonc"), config());

      const result = await run([], repo, {
        promptAdapter,
        stdinIsTty: true,
        stdoutIsTty: true,
      });

      expect(result).toMatchObject({ exitCode: 0, stderr: "", stdout: "" });
      expect(promptAdapter.actionMenus).toHaveLength(1);
      expect(promptAdapter.targetsRenders).toHaveLength(1);
      expect(promptAdapter.initPrompts).toHaveLength(0);
    } finally {
      await rm(repo, { force: true, recursive: true });
    }
  });
});
