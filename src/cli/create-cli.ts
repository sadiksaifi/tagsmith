import { cac, type CAC } from "cac";

import { discoverGitRoot } from "@/adapters/git/process-git";
import {
  allCommandFlags,
  cliCommands,
  getCommandDefinition,
  getCommandFlag,
  getGlobalFlag,
  isCommandName,
  type CommandName,
  type FlagDefinition,
} from "@/cli/cli-contract";
import { runInitCommand } from "@/cli/commands/init-command";
import { runTagCommand } from "@/cli/commands/tag-command";
import { runTargetsCommand } from "@/cli/commands/targets-command";
import { runValidateCommand } from "@/cli/commands/validate-command";
import { createOutput, type OutputMode, type OutputWriter } from "@/cli/output/create-output";
import { isPromptEligible } from "@/cli/prompt-eligibility";
import { runInteractiveInit } from "@/interactive/init-flow";
import type { PromptAdapter } from "@/interactive/prompt-adapter";
import { runInteractiveTag } from "@/interactive/tag-flow";
import { runInteractiveTargets } from "@/interactive/targets-flow";
import { runInteractiveValidate } from "@/interactive/validate-flow";

export interface RunCliOptions {
  readonly argv: readonly string[];
  readonly color?: boolean;
  readonly packageVersion: string;
  readonly stderr: OutputWriter;
  readonly stdout: OutputWriter;
  readonly ci?: boolean | string | undefined;
  readonly cwd?: string;
  readonly promptAdapter?: PromptAdapter | undefined;
  readonly stdinIsTty?: boolean | undefined;
  readonly stdoutIsTty?: boolean | undefined;
}

export async function runCli(options: RunCliOptions): Promise<number> {
  const cli = createCli();
  const parsed = parseArgv(options.argv, cli);
  const output = createOutput({
    color: options.color === true,
    mode: parsed.ok
      ? outputModeFor(
          parsed.machineMode,
          parsed.command === "init" && parsed.flags["--dry-run"] === true,
        )
      : outputModeFor(inferMachineMode(options.argv), isInitDryRun(options.argv)),
    stderr: options.stderr,
    stdout: options.stdout,
    verbose: parsed.ok && parsed.verbose,
  });

  if (!parsed.ok) {
    output.error(parsed.error);
    return 1;
  }

  if (parsed.version) {
    output.writeRaw(`${options.packageVersion}\n`);
    return 0;
  }

  if (parsed.help || options.argv.length === 0) {
    output.writeRaw(renderHelp(parsed.command));
    return 0;
  }

  if (parsed.verbose && parsed.machineMode !== undefined) {
    output.error(`--verbose is incompatible with ${parsed.machineMode}`);
    return 1;
  }

  const cwd = options.cwd ?? process.cwd();
  const rawMode = parsed.command === "init" && parsed.flags["--dry-run"] === true;
  const promptEligible = isPromptEligible({
    ci: options.ci,
    help: parsed.help,
    machineMode: parsed.machineMode,
    rawMode,
    stdinIsTty: options.stdinIsTty === true,
    stdoutIsTty: options.stdoutIsTty === true,
    version: parsed.version,
  });

  if (promptEligible && parsed.command === "init") {
    return runInteractiveInit({
      configPath: parsed.configPath,
      cwd,
      force: parsed.flags["--force"] === true,
      output,
      promptAdapter: await resolvePromptAdapter(options.promptAdapter),
    });
  }

  if (promptEligible && parsed.command === "targets") {
    return runInteractiveTargets({
      configPath: parsed.configPath,
      cwd,
      output,
      promptAdapter: await resolvePromptAdapter(options.promptAdapter),
    });
  }

  if (promptEligible && parsed.command === "validate") {
    return runInteractiveValidate({
      configPath: parsed.configPath,
      cwd,
      flags: parsed.flags,
      output,
      promptAdapter: await resolvePromptAdapter(options.promptAdapter),
    });
  }

  if (promptEligible && parsed.command === "tag") {
    return runInteractiveTag({
      configPath: parsed.configPath,
      cwd,
      flags: parsed.flags,
      output,
      promptAdapter: await resolvePromptAdapter(options.promptAdapter),
    });
  }

  if (parsed.command === "init") {
    return runInitCommand({
      configPath: parsed.configPath,
      cwd,
      flags: parsed.flags,
      output,
    });
  }

  if (parsed.command === "targets") {
    return runTargetsCommand({
      configPath: parsed.configPath,
      cwd,
      flags: parsed.flags,
      output,
    });
  }

  if (parsed.command === "tag") {
    return runTagCommand({
      configPath: parsed.configPath,
      cwd,
      flags: parsed.flags,
      output,
    });
  }

  if (parsed.command === "validate") {
    return runValidateCommand({
      configPath: parsed.configPath,
      cwd,
      flags: parsed.flags,
      output,
    });
  }

  const gitRoot = await discoverGitRoot(cwd);
  if (!gitRoot.ok) {
    output.error(gitRoot.error);
    return 1;
  }

  output.error(`command not implemented yet: ${parsed.command}`);
  return 1;
}

async function resolvePromptAdapter(
  promptAdapter: PromptAdapter | undefined,
): Promise<PromptAdapter> {
  if (promptAdapter !== undefined) {
    return promptAdapter;
  }

  const { createClackPromptAdapter } = await import("@/interactive/clack-prompt-adapter");
  return createClackPromptAdapter();
}

function createCli(): CAC {
  const cli = cac("tagsmith")
    .usage("[command] [flags]")
    .option("--config <path>", requireGlobalFlag("--config").description)
    .option("--verbose", requireGlobalFlag("--verbose").description)
    .option("-h, --help", requireGlobalFlag("--help").description)
    .option("-v", requireGlobalFlag("--version").description);

  for (const definition of cliCommands) {
    const command = cli.command(definition.name, definition.description);
    for (const flag of definition.flags) {
      command.option(renderFlagUsage(flag.name, flag), flag.description);
    }
  }

  return cli;
}

type ParseResult =
  | {
      readonly command: CommandName | undefined;
      readonly configPath: string | undefined;
      readonly flags: Readonly<Record<string, boolean | string>>;
      readonly help: boolean;
      readonly machineMode: "--github-output" | "--json" | undefined;
      readonly ok: true;
      readonly verbose: boolean;
      readonly version: boolean;
    }
  | { readonly error: string; readonly ok: false };

function parseArgv(argv: readonly string[], cli: CAC): ParseResult {
  let command: CommandName | undefined;
  let help = false;
  let version = false;
  let verbose = false;
  let machineMode: "--github-output" | "--json" | undefined;
  let configPath: string | undefined;
  const flags: Record<string, boolean | string> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) {
      continue;
    }

    if (isCommandName(token)) {
      if (command !== undefined) {
        return { error: `unexpected argument ${token}`, ok: false };
      }
      command = token;
      continue;
    }

    if (token === "-h") {
      help = true;
      continue;
    }

    if (token === "-v") {
      version = true;
      continue;
    }

    if (token.startsWith("-") && !token.startsWith("--")) {
      return { error: `unknown option ${token}`, ok: false };
    }

    if (token.startsWith("--")) {
      if (token.includes("=")) {
        const flagName = token.slice(0, token.indexOf("="));
        return {
          error: `option ${flagName} does not support attached values. Use ${attachedValueGuidance(flagName)}.`,
          ok: false,
        };
      }

      if (token === "--cwd") {
        return { error: "unknown option --cwd", ok: false };
      }

      const flag = lookupFlag(command, token);
      if (flag === undefined) {
        return { error: `unknown option ${token}`, ok: false };
      }

      const isCommandScopedFlag =
        command !== undefined && getCommandFlag(command, token) !== undefined;

      let flagValue: boolean | string = true;
      if (flag.valueName !== undefined) {
        const value = argv[index + 1];
        if (value === undefined || value.startsWith("-")) {
          return { error: `option ${token} requires a value`, ok: false };
        }
        flagValue = value;
        index += 1;
      }

      flags[token] = flagValue;

      if (token === "--help") {
        help = true;
      } else if (token === "--version" && !isCommandScopedFlag) {
        version = true;
      } else if (token === "--verbose") {
        verbose = true;
      } else if (token === "--config" && typeof flagValue === "string") {
        configPath = flagValue;
      } else if (token === "--json" || token === "--github-output") {
        if (machineMode !== undefined && machineMode !== token) {
          return { error: `${machineMode} is incompatible with ${token}`, ok: false };
        }
        machineMode = token;
      }
      continue;
    }

    return {
      error: command === undefined ? `unknown command ${token}` : `unexpected argument ${token}`,
      ok: false,
    };
  }

  if (!help && !version && command !== undefined) {
    const parserResult = parseWithCac(cli, argv);
    if (!parserResult.ok) {
      return parserResult;
    }
  }

  return { command, configPath, flags, help, machineMode, ok: true, verbose, version };
}

function outputModeFor(
  machineMode: "--github-output" | "--json" | undefined,
  rawMode = false,
): OutputMode {
  if (machineMode === "--github-output") {
    return "github";
  }

  if (machineMode === "--json") {
    return "json";
  }

  if (rawMode) {
    return "raw";
  }

  return "human";
}

function inferMachineMode(argv: readonly string[]): "--github-output" | "--json" | undefined {
  if (argv.includes("--github-output")) {
    return "--github-output";
  }

  if (argv.includes("--json")) {
    return "--json";
  }

  return undefined;
}

function isInitDryRun(argv: readonly string[]): boolean {
  return argv.includes("init") && argv.includes("--dry-run");
}

function parseWithCac(
  cli: CAC,
  argv: readonly string[],
): { readonly error: string; readonly ok: false } | { readonly ok: true } {
  try {
    cli.parse(["node", "tagsmith", ...argv], { run: false });
    return { ok: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message.replaceAll("`", "")
          : "failed to parse CLI arguments",
      ok: false,
    };
  }
}

function lookupFlag(command: CommandName | undefined, token: string): FlagDefinition | undefined {
  if (command !== undefined) {
    const commandFlag = getCommandFlag(command, token);
    if (commandFlag !== undefined) {
      return commandFlag;
    }
  }

  return getGlobalFlag(token);
}

function requireGlobalFlag(name: string): FlagDefinition {
  const flag = getGlobalFlag(name);
  if (flag === undefined) {
    throw new Error(`Missing global flag definition: ${name}`);
  }
  return flag;
}

function attachedValueGuidance(flagName: string): string {
  const valueName =
    getGlobalFlag(flagName)?.valueName ?? allCommandFlags(flagName)[0]?.valueName ?? "value";

  return `${flagName} ${exampleValue(valueName)}`;
}

function exampleValue(valueName: string): string {
  switch (valueName) {
    case "name":
      return "signal";
    case "path":
      return "path/to/.tagsmith.jsonc";
    case "semver":
      return "1.2.3";
    case "tag":
      return "signal@1.2.3";
    case "type":
      return "patch";
    default:
      return valueName;
  }
}

function renderHelp(command: CommandName | undefined): string {
  if (command === undefined) {
    return renderGlobalHelp();
  }

  return renderCommandHelp(command);
}

function renderGlobalHelp(): string {
  return [
    "Usage:",
    "  tagsmith [command] [flags]",
    "",
    "Commands:",
    ...cliCommands.map(
      (definition) => `  tagsmith ${definition.name.padEnd(8)} ${definition.description}`,
    ),
    "",
    "Global flags:",
    renderFlag("--config", requireGlobalFlag("--config")),
    "  --verbose        Debug logging for human mode only",
    "  --help, -h       Show help",
    "  --version, -v    Show Tagsmith version",
    "",
  ].join("\n");
}

function renderCommandHelp(command: CommandName): string {
  const definition = getCommandDefinition(command);
  return [
    "Usage:",
    `  tagsmith ${command} [flags]`,
    "",
    definition.description,
    "",
    "Flags:",
    ...definition.flags.map((flag) => renderFlag(flag.name, flag)),
    "",
    "Global flags:",
    renderFlag("--config", requireGlobalFlag("--config")),
    "  --verbose        Debug logging for human mode only",
    "  --help, -h       Show help",
    "  --version, -v    Show Tagsmith version",
    "",
  ].join("\n");
}

function renderFlag(name: string, definition: FlagDefinition): string {
  const usage = renderFlagUsage(name, definition);
  return `  ${usage.padEnd(18)} ${definition.description}`;
}

function renderFlagUsage(name: string, definition: FlagDefinition): string {
  return definition.valueName === undefined ? name : `${name} <${definition.valueName}>`;
}
