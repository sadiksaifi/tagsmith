import { describe, expect, test } from "vitest";

import { runCli } from "@/cli/create-cli";

class MemoryWriter {
  text = "";

  write(chunk: string): boolean {
    this.text += chunk;
    return true;
  }
}

async function run(argv: string[], packageVersion = "9.8.7", color = false) {
  const stdout = new MemoryWriter();
  const stderr = new MemoryWriter();
  const exitCode = await runCli({ argv, color, packageVersion, stderr, stdout });

  return { exitCode, stderr: stderr.text, stdout: stdout.text };
}

describe("CLI contract", () => {
  test("no arguments and global help print command surfaces without errors", async () => {
    const results = await Promise.all([[], ["--help"], ["-h"]].map((argv) => run(argv)));

    for (const result of results) {
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toContain("tagsmith init");
      expect(result.stdout).toContain("tagsmith tag");
      expect(result.stdout).toContain("tagsmith validate");
      expect(result.stdout).toContain("tagsmith targets");
    }
  });

  test("global version reports the Tagsmith package version", async () => {
    const results = await Promise.all(
      [["--version"], ["-v"]].map((argv) => run(argv, "1.2.3-test.4")),
    );

    for (const result of results) {
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("1.2.3-test.4\n");
    }
  });

  test("command help exposes durable long-form command flags", async () => {
    const cases = [
      { argv: ["init", "--help"], flags: ["--force", "--dry-run"] },
      {
        argv: ["tag", "-h"],
        flags: [
          "--target <name>",
          "--channel <name>",
          "--bump <type>",
          "--version <semver>",
          "--push",
          "--dry-run",
          "--json",
        ],
        absentFlags: ["--yes"],
      },
      {
        argv: ["validate", "--help"],
        flags: ["--tag <tag>", "--target <name>", "--channel <name>", "--json", "--github-output"],
      },
      { argv: ["targets", "-h"], flags: ["--json"] },
    ];

    const results = await Promise.all(
      cases.map(async ({ absentFlags = [], argv, flags }) => ({
        absentFlags,
        flags,
        result: await run(argv),
      })),
    );

    for (const { absentFlags, flags, result } of results) {
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      for (const flag of flags) {
        expect(result.stdout).toContain(flag);
      }
      for (const flag of absentFlags) {
        expect(result.stdout).not.toContain(flag);
      }
    }
  });

  test("unknown shorthand, attached values, --cwd, and unknown flags fail on stderr", async () => {
    const cases = [
      { argv: ["tag", "-t", "signal"], stderr: "unknown option -t" },
      {
        argv: ["tag", "--target=signal"],
        stderr: "option --target does not support attached values. Use --target signal.",
      },
      {
        argv: ["--config=.tagsmith.jsonc"],
        stderr:
          "option --config does not support attached values. Use --config path/to/.tagsmith.jsonc.",
      },
      {
        argv: ["tag", "--version=1.2.3"],
        stderr: "option --version does not support attached values. Use --version 1.2.3.",
      },
      {
        argv: ["validate", "--tag=signal@1.2.3"],
        stderr: "option --tag does not support attached values. Use --tag signal@1.2.3.",
      },
      {
        argv: ["tag", "--bump=patch"],
        stderr: "option --bump does not support attached values. Use --bump patch.",
      },
      { argv: ["--cwd", "/tmp", "targets"], stderr: "unknown option --cwd" },
      { argv: ["tag", "--unknown"], stderr: "unknown option --unknown" },
      {
        argv: ["tag", "--channel", "prod", "--version", "1.0.0", "--yes"],
        stderr: "unknown option --yes",
      },
      { argv: ["tag", "-y", "--channel", "prod"], stderr: "unknown option -y" },
    ];

    const results = await Promise.all(
      cases.map(async ({ argv, stderr }) => ({ result: await run(argv), stderr })),
    );

    for (const { result, stderr } of results) {
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("tagsmith failed:");
      expect(result.stderr).toContain(stderr);
    }
  });

  test("missing flag values fail before command dispatch", async () => {
    const results = await Promise.all(
      [["--config"], ["tag", "--target"], ["validate", "--tag", "--json"]].map((argv) => run(argv)),
    );

    for (const result of results) {
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("tagsmith failed:");
      expect(result.stderr).toContain("requires a value");
      expect(result.stderr).not.toContain("command not implemented yet");
    }
  });

  test("unknown commands and unexpected positional arguments fail before dispatch", async () => {
    const cases = [
      { argv: ["release"], stderr: "unknown command release" },
      { argv: ["tag", "targets"], stderr: "unexpected argument targets" },
      {
        argv: ["tag", "--target", "signal", "extra"],
        stderr: "unexpected argument extra",
      },
    ];

    const results = await Promise.all(
      cases.map(async ({ argv, stderr }) => ({ result: await run(argv), stderr })),
    );

    for (const { result, stderr } of results) {
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("tagsmith failed:");
      expect(result.stderr).toContain(stderr);
      expect(result.stderr).not.toContain("command not implemented yet");
    }
  });

  test("space-separated command flag values are accepted by the parser", async () => {
    const results = await Promise.all(
      [
        ["tag", "--target", "signal", "--channel", "rc", "--bump", "patch"],
        ["tag", "--target", "signal", "--channel", "prod", "--version", "1.2.3"],
        ["validate", "--tag", "signal@1.2.3"],
      ].map((argv) => run(argv)),
    );

    for (const result of results) {
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("tagsmith failed:");
      expect(result.stderr).not.toContain("unknown option");
      expect(result.stderr).not.toContain("unexpected argument");
    }
  });

  test("json and GitHub-output machine modes are mutually exclusive", async () => {
    const result = await run(["validate", "--tag", "signal@1.2.3", "--json", "--github-output"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("tagsmith failed:");
    expect(result.stderr).toContain("--json is incompatible with --github-output");
    expect(result.stderr).not.toContain("command not implemented yet");
  });

  test("machine flags select non-human output boundaries", async () => {
    const escape = `${String.fromCodePoint(27)}[`;
    const results = await Promise.all([
      run(
        ["tag", "--target", "signal", "--channel", "rc", "--bump", "patch", "--json"],
        "9.8.7",
        true,
      ),
      run(["validate", "--tag", "signal@1.2.3", "--github-output"], "9.8.7", true),
      run(["tag", "--target=signal", "--json"], "9.8.7", true),
      run(["validate", "--tag", "signal@1.2.3", "--github-output", "--unknown"], "9.8.7", true),
    ]);

    for (const result of results) {
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("tagsmith failed:");
      expect(result.stderr).not.toContain(escape);
    }
  });

  test("verbose is accepted only for human mode", async () => {
    const results = await Promise.all([
      run(["tag", "--verbose", "--json"]),
      run(["validate", "--verbose", "--github-output"]),
    ]);

    for (const result of results) {
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("--verbose is incompatible with");
    }
  });
});
