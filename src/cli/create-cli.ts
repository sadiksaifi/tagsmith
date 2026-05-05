import { cac, type CAC } from "cac";

import { createOutput, type OutputMode, type OutputWriter } from "@/cli/output/create-output";

type CommandName = "init" | "tag" | "targets" | "validate";

type FlagDefinition = {
  readonly description: string;
  readonly valueName?: string;
};

type CommandDefinition = {
  readonly description: string;
  readonly flags: Readonly<Record<string, FlagDefinition>>;
};

export interface RunCliOptions {
  readonly argv: readonly string[];
  readonly color?: boolean;
  readonly packageVersion: string;
  readonly stderr: OutputWriter;
  readonly stdout: OutputWriter;
}

const globalFlags: Readonly<Record<string, FlagDefinition>> = {
  "--config": {
    description: "Config file path. Default: <repo-root>/.tagsmith.jsonc",
    valueName: "path",
  },
  "--help": { description: "Show help" },
  "--verbose": { description: "Debug logging for human mode only" },
  "--version": { description: "Show Tagsmith version" },
};

const commands: Readonly<Record<CommandName, CommandDefinition>> = {
  init: {
    description: "Create a Tagsmith config file.",
    flags: {
      "--dry-run": { description: "Print the exact config template that would be written" },
      "--force": { description: "Overwrite existing config" },
    },
  },
  tag: {
    description: "Resolve, create, and optionally push a release tag.",
    flags: {
      "--bump": { description: "major | minor | patch | prerelease", valueName: "type" },
      "--channel": { description: "Release channel name", valueName: "name" },
      "--dry-run": { description: "Resolve and validate, but do not create or push" },
      "--json": { description: "Machine-readable output" },
      "--push": { description: "Push created tag to configured git.remote" },
      "--target": { description: "Target name", valueName: "name" },
      "--version": { description: "Explicit SemVer version", valueName: "semver" },
      "--yes": { description: "Accepted no-op forward-compatibility flag" },
    },
  },
  validate: {
    description: "Validate a release tag and emit CI-safe facts.",
    flags: {
      "--channel": { description: "Assert channel name", valueName: "name" },
      "--github-output": { description: "Write validation facts to $GITHUB_OUTPUT" },
      "--json": { description: "Machine-readable output" },
      "--tag": { description: "Git tag to validate", valueName: "tag" },
      "--target": { description: "Assert target name", valueName: "name" },
    },
  },
  targets: {
    description: "List configured release targets.",
    flags: {
      "--json": { description: "Machine-readable output" },
    },
  },
};

export async function runCli(options: RunCliOptions): Promise<number> {
  const cli = createCli();
  const parsed = parseArgv(options.argv, cli);
  const output = createOutput({
    color: options.color === true,
    mode: parsed.ok
      ? outputModeFor(parsed.machineMode)
      : outputModeFor(inferMachineMode(options.argv)),
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

  output.error(`command not implemented yet: ${parsed.command}`);
  return 1;
}

function createCli(): CAC {
  const cli = cac("tagsmith")
    .usage("[command] [flags]")
    .option("--config <path>", requireGlobalFlag("--config").description)
    .option("--verbose", requireGlobalFlag("--verbose").description)
    .option("-h, --help", requireGlobalFlag("--help").description)
    .option("-v", requireGlobalFlag("--version").description);

  for (const [name, definition] of Object.entries(commands)) {
    const command = cli.command(name, definition.description);
    for (const [flagName, flag] of Object.entries(definition.flags)) {
      command.option(renderFlagUsage(flagName, flag), flag.description);
    }
  }

  return cli;
}

type ParseResult =
  | {
      readonly command: CommandName | undefined;
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
        command !== undefined && commands[command].flags[token] !== undefined;

      if (token === "--help") {
        help = true;
      } else if (token === "--version" && !isCommandScopedFlag) {
        version = true;
      } else if (token === "--verbose") {
        verbose = true;
      } else if (token === "--json" || token === "--github-output") {
        if (machineMode !== undefined && machineMode !== token) {
          return { error: `${machineMode} is incompatible with ${token}`, ok: false };
        }
        machineMode = token;
      }

      if (flag.valueName !== undefined) {
        const value = argv[index + 1];
        if (value === undefined || value.startsWith("-")) {
          return { error: `option ${token} requires a value`, ok: false };
        }
        index += 1;
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

  return { command, help, machineMode, ok: true, verbose, version };
}

function outputModeFor(machineMode: "--github-output" | "--json" | undefined): OutputMode {
  if (machineMode === "--github-output") {
    return "github";
  }

  if (machineMode === "--json") {
    return "json";
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
    const commandFlag = commands[command].flags[token];
    if (commandFlag !== undefined) {
      return commandFlag;
    }
  }

  return globalFlags[token];
}

function requireGlobalFlag(name: string): FlagDefinition {
  const flag = globalFlags[name];
  if (flag === undefined) {
    throw new Error(`Missing global flag definition: ${name}`);
  }
  return flag;
}

function isCommandName(value: string): value is CommandName {
  return value === "init" || value === "tag" || value === "targets" || value === "validate";
}

function attachedValueGuidance(flagName: string): string {
  const valueName =
    globalFlags[flagName]?.valueName ??
    commands.init.flags[flagName]?.valueName ??
    commands.tag.flags[flagName]?.valueName ??
    commands.validate.flags[flagName]?.valueName ??
    commands.targets.flags[flagName]?.valueName ??
    "value";

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
    ...Object.entries(commands).map(
      ([name, definition]) => `  tagsmith ${name.padEnd(8)} ${definition.description}`,
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
  const definition = commands[command];
  return [
    "Usage:",
    `  tagsmith ${command} [flags]`,
    "",
    definition.description,
    "",
    "Flags:",
    ...Object.entries(definition.flags).map(([name, flag]) => renderFlag(name, flag)),
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
