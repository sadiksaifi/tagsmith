export type CommandName = "init" | "tag" | "validate" | "targets";

export interface FlagDefinition {
  readonly description: string;
  readonly name: string;
  readonly valueName?: string;
}

export interface CommandDefinition {
  readonly description: string;
  readonly flags: readonly FlagDefinition[];
  readonly name: CommandName;
}

export const cliGlobalFlags = [
  {
    description: "Config file path. Default: <repo-root>/.tagsmith.jsonc",
    name: "--config",
    valueName: "path",
  },
  { description: "Show help", name: "--help" },
  { description: "Debug logging for human mode only", name: "--verbose" },
  { description: "Show Tagsmith version", name: "--version" },
] as const satisfies readonly FlagDefinition[];

export const cliCommands = [
  {
    description: "Create a Tagsmith config file.",
    flags: [
      { description: "Print the exact config template that would be written", name: "--dry-run" },
      { description: "Overwrite existing config", name: "--force" },
    ],
    name: "init",
  },
  {
    description: "Resolve, create, and optionally push a release tag.",
    flags: [
      { description: "major | minor | patch | prerelease", name: "--bump", valueName: "type" },
      { description: "Release channel name", name: "--channel", valueName: "name" },
      { description: "Resolve and validate, but do not create or push", name: "--dry-run" },
      { description: "Machine-readable output", name: "--json" },
      { description: "Push created tag to configured git.remote", name: "--push" },
      { description: "Target name", name: "--target", valueName: "name" },
      { description: "Explicit SemVer version", name: "--version", valueName: "semver" },
    ],
    name: "tag",
  },
  {
    description: "Validate a release tag and emit CI-safe facts.",
    flags: [
      { description: "Assert channel name", name: "--channel", valueName: "name" },
      { description: "Write validation facts to $GITHUB_OUTPUT", name: "--github-output" },
      { description: "Machine-readable output", name: "--json" },
      { description: "Git tag to validate", name: "--tag", valueName: "tag" },
      { description: "Assert target name", name: "--target", valueName: "name" },
    ],
    name: "validate",
  },
  {
    description: "List configured release targets.",
    flags: [{ description: "Machine-readable output", name: "--json" }],
    name: "targets",
  },
] as const satisfies readonly CommandDefinition[];

export function isCommandName(value: string): value is CommandName {
  return cliCommands.some((command) => command.name === value);
}

export function getCommandDefinition(commandName: CommandName): CommandDefinition {
  const command = cliCommands.find((definition) => definition.name === commandName);
  if (command === undefined) {
    throw new Error(`Missing command definition: ${commandName}`);
  }
  return command;
}

export function getGlobalFlag(name: string): FlagDefinition | undefined {
  return cliGlobalFlags.find((flag) => flag.name === name);
}

export function getCommandFlag(
  commandName: CommandName,
  flagName: string,
): FlagDefinition | undefined {
  return getCommandDefinition(commandName).flags.find((flag) => flag.name === flagName);
}

export function allCommandFlags(flagName: string): readonly FlagDefinition[] {
  return cliCommands.flatMap((command) => command.flags.filter((flag) => flag.name === flagName));
}
