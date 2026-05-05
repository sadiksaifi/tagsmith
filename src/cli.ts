#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runCli } from "@/cli/create-cli";

import packageJson from "../package.json" with { type: "json" };

export { runCli };

if (isMain(import.meta.url, process.argv[1])) {
  process.exitCode = await runCli({
    argv: process.argv.slice(2),
    packageVersion: packageJson.version,
    stderr: process.stderr,
    stdout: process.stdout,
  });
}

function isMain(moduleUrl: string, argvPath: string | undefined): boolean {
  return argvPath !== undefined && moduleUrl === pathToFileURL(resolve(argvPath)).href;
}
