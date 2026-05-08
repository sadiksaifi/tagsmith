import {
  cliCommands,
  cliGlobalFlags,
  type CommandDefinition,
  type FlagDefinition,
} from "@/cli/cli-contract";

export const completionShells = ["bash", "zsh", "fish"] as const;

export type CompletionShell = (typeof completionShells)[number];

export function isCompletionShell(value: string): value is CompletionShell {
  return completionShells.some((shell) => shell === value);
}

export function renderShellCompletion(shell: CompletionShell): string {
  switch (shell) {
    case "bash":
      return renderBashCompletion();
    case "zsh":
      return renderZshCompletion();
    case "fish":
      return renderFishCompletion();
    default: {
      const exhaustive: never = shell;
      return exhaustive;
    }
  }
}

function renderBashCompletion(): string {
  const commands = cliCommands.map((command) => command.name).join(" ");
  const globalFlags = renderBashWords(globalFlagNames());
  const commandCases = cliCommands
    .map(
      (command) =>
        `    ${command.name}) COMPREPLY=( $(compgen -W "${renderBashWords([
          ...command.flags.map((flag) => flag.name),
          ...globalFlagNames(),
        ])}" -- "$cur") ) ;;`,
    )
    .join("\n");

  return [
    "# tagsmith bash completion",
    "_tagsmith_completion() {",
    "  local cur prev command",
    "  COMPREPLY=()",
    '  cur="${COMP_WORDS[COMP_CWORD]}"',
    '  prev="${COMP_WORDS[COMP_CWORD-1]}"',
    "",
    '  case "$prev" in',
    "    --config)",
    '      COMPREPLY=( $(compgen -f -- "$cur") )',
    "      return 0",
    "      ;;",
    "    --bump)",
    '      COMPREPLY=( $(compgen -W "major minor patch prerelease" -- "$cur") )',
    "      return 0",
    "      ;;",
    "    --shell)",
    `      COMPREPLY=( $(compgen -W "${completionShells.join(" ")}" -- "$cur") )`,
    "      return 0",
    "      ;;",
    "    --target|--channel|--version|--tag)",
    "      return 0",
    "      ;;",
    "  esac",
    "",
    "  command=",
    '  for word in "${COMP_WORDS[@]:1:COMP_CWORD-1}"; do',
    '    case "$word" in',
    `      ${commands.replaceAll(" ", "|")}) command="$word"; break ;;`,
    "    esac",
    "  done",
    "",
    "  if [[ $COMP_CWORD -eq 1 || -z $command ]]; then",
    `    COMPREPLY=( $(compgen -W "${commands} ${globalFlags}" -- "$cur") )`,
    "    return 0",
    "  fi",
    "",
    '  if [[ "$command" == "completion" && "$cur" != -* ]]; then',
    `    COMPREPLY=( $(compgen -W "${completionShells.join(" ")}" -- "$cur") )`,
    "    return 0",
    "  fi",
    "",
    '  case "$command" in',
    commandCases,
    "  esac",
    "}",
    "complete -F _tagsmith_completion tagsmith",
    "",
  ].join("\n");
}

function renderZshCompletion(): string {
  const commandDescriptions = cliCommands
    .map((command) => `    '${command.name}:${escapeZsh(command.description)}'`)
    .join("\n");
  const commandCases = cliCommands
    .map(
      (command) =>
        `      ${command.name}) _arguments ${renderZshArguments([
          ...command.flags,
          ...cliGlobalFlags,
        ])} ;;`,
    )
    .join("\n");

  return [
    "#compdef tagsmith",
    "# tagsmith zsh completion",
    "_tagsmith() {",
    "  local -a commands",
    "  commands=(",
    commandDescriptions,
    "  )",
    "",
    "  _arguments -C \\",
    "    '1:command:->command' \\",
    "    '*::arg:->args'",
    "",
    "  case $state in",
    "    command)",
    "      _describe 'tagsmith command' commands",
    "      ;;",
    "    args)",
    "      case $words[1] in",
    "      completion)",
    `        _arguments '--shell[Shell to generate completion for]:shell:(${completionShells.join(" ")})' '1:shell:(${completionShells.join(" ")})' ${renderZshArguments(cliGlobalFlags)}`,
    "        ;;",
    commandCases,
    "      esac",
    "      ;;",
    "  esac",
    "}",
    '_tagsmith "$@"',
    "",
  ].join("\n");
}

function renderFishCompletion(): string {
  const lines = [
    "# tagsmith fish completion",
    "complete -c tagsmith -f",
    ...cliCommands.map(
      (command) =>
        `complete -c tagsmith -n '__fish_use_subcommand' -a '${command.name}' -d '${escapeFish(command.description)}'`,
    ),
    ...cliGlobalFlags.map((flag) => renderFishFlag(flag)),
  ];

  for (const command of cliCommands) {
    for (const flag of command.flags) {
      lines.push(renderFishFlag(flag, command));
    }
  }

  lines.push(
    `complete -c tagsmith -n '__fish_seen_subcommand_from completion' -a '${completionShells.join(" ")}'`,
  );

  return `${lines.join("\n")}\n`;
}

function globalFlagNames(): string[] {
  return ["--config", "--verbose", "--help", "--version", "-h", "-v"];
}

function renderBashWords(words: readonly string[]): string {
  return Array.from(new Set(words)).join(" ");
}

function renderZshArguments(flags: readonly FlagDefinition[]): string {
  return flags.map((flag) => renderZshFlag(flag)).join(" ");
}

function renderZshFlag(flag: FlagDefinition): string {
  const description = escapeZsh(flag.description);
  if (flag.valueName === undefined) {
    return `'${flag.name}[${description}]'`;
  }

  if (flag.name === "--config") {
    return `'${flag.name}[${description}]:${flag.valueName}:_files'`;
  }

  if (flag.name === "--bump") {
    return `'${flag.name}[${description}]:${flag.valueName}:(major minor patch prerelease)'`;
  }

  if (flag.name === "--shell") {
    return `'${flag.name}[${description}]:${flag.valueName}:(${completionShells.join(" ")})'`;
  }

  return `'${flag.name}[${description}]:${flag.valueName}:'`;
}

function renderFishFlag(flag: FlagDefinition, command?: CommandDefinition): string {
  const condition =
    command === undefined
      ? "not __fish_seen_subcommand_from " +
        cliCommands.map((definition) => definition.name).join(" ")
      : `__fish_seen_subcommand_from ${command.name}`;
  const parts = [
    "complete -c tagsmith",
    `-n '${condition}'`,
    `-l '${flag.name.slice(2)}'`,
    `-d '${escapeFish(flag.description)}'`,
  ];

  if (flag.valueName !== undefined) {
    parts.push("-r");
  }

  if (flag.name === "--config") {
    parts.push("-F");
  } else if (flag.name === "--bump") {
    parts.push("-a 'major minor patch prerelease'");
  } else if (flag.name === "--shell") {
    parts.push(`-a '${completionShells.join(" ")}'`);
  }

  return parts.join(" ");
}

function escapeZsh(value: string): string {
  return value.replaceAll("'", "'\\''").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function escapeFish(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}
