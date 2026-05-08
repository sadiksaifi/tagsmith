#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { runCli } from "@/cli/create-cli";

import packageJson from "../package.json" with { type: "json" };

export { runCli };

if (isMain(import.meta.url, process.argv[1])) {
  process.exitCode = await runCli({
    argv: process.argv.slice(2),
    ci: process.env.CI,
    packageVersion: packageJson.version,
    stderr: process.stderr,
    stderrIsTty: process.stderr.isTTY,
    stdinIsTty: process.stdin.isTTY,
    stdout: process.stdout,
    stdoutIsTty: process.stdout.isTTY,
  });
}

function isMain(moduleUrl: string, argvPath: string | undefined): boolean {
  return argvPath !== undefined && moduleUrl === pathToFileURL(realpathSync(argvPath)).href;
}
