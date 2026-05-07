import type { CommandName } from "@/cli/cli-contract";

export interface EquivalentCommandInput {
  readonly command: CommandName;
  readonly configPath?: string | undefined;
  readonly flags?: Readonly<{
    readonly bump?: string | undefined;
    readonly channel?: string | undefined;
    readonly dryRun?: boolean | undefined;
    readonly force?: boolean | undefined;
    readonly githubOutput?: boolean | undefined;
    readonly json?: boolean | undefined;
    readonly push?: boolean | undefined;
    readonly tag?: string | undefined;
    readonly target?: string | undefined;
    readonly version?: string | undefined;
  }>;
}

export function renderEquivalentCommand(input: EquivalentCommandInput): string {
  const parts = ["tagsmith"];

  if (input.configPath !== undefined) {
    parts.push("--config", shellEscape(input.configPath));
  }

  parts.push(input.command);

  const flags = input.flags ?? {};
  switch (input.command) {
    case "init":
      if (flags.dryRun === true) {
        parts.push("--dry-run");
      }
      if (flags.force === true) {
        parts.push("--force");
      }
      break;
    case "tag":
      pushValueFlag(parts, "--bump", flags.bump);
      pushValueFlag(parts, "--channel", flags.channel);
      pushBooleanFlag(parts, "--dry-run", flags.dryRun);
      pushBooleanFlag(parts, "--json", flags.json);
      pushBooleanFlag(parts, "--push", flags.push);
      pushValueFlag(parts, "--target", flags.target);
      pushValueFlag(parts, "--version", flags.version);
      break;
    case "validate":
      pushValueFlag(parts, "--channel", flags.channel);
      pushBooleanFlag(parts, "--github-output", flags.githubOutput);
      pushBooleanFlag(parts, "--json", flags.json);
      pushValueFlag(parts, "--tag", flags.tag);
      pushValueFlag(parts, "--target", flags.target);
      break;
    case "targets":
      pushBooleanFlag(parts, "--json", flags.json);
      break;
  }

  return parts.join(" ");
}

function pushBooleanFlag(parts: string[], name: string, value: boolean | undefined): void {
  if (value === true) {
    parts.push(name);
  }
}

function pushValueFlag(parts: string[], name: string, value: string | undefined): void {
  if (value !== undefined) {
    parts.push(name, shellEscape(value));
  }
}

function shellEscape(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/u.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}
