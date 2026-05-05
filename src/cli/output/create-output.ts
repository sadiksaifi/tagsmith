import { appendFileSync } from "node:fs";

import pc from "picocolors";

export type OutputMode = "human" | "json" | "github" | "raw";

export interface OutputWriter {
  write(chunk: string): unknown;
}

export interface CreateOutputOptions {
  readonly mode: OutputMode;
  readonly stderr: OutputWriter;
  readonly stdout: OutputWriter;
  readonly color?: boolean;
  readonly verbose?: boolean;
}

export interface CliOutput {
  error(message: string): void;
  human(message: string): void;
  verbose(message: string): void;
  warn(message: string): void;
  writeJson(value: unknown): void;
  writeRaw(value: string): void;
}

export function createOutput(options: CreateOutputOptions): CliOutput {
  const color = options.color === true;
  const verboseEnabled = options.verbose === true && options.mode === "human";

  return {
    error(message) {
      const prefix = color ? pc.red("tagsmith failed:") : "tagsmith failed:";
      options.stderr.write(`${prefix} ${message}\n`);
    },
    human(message) {
      if (options.mode === "human") {
        options.stdout.write(message.endsWith("\n") ? message : `${message}\n`);
      }
    },
    verbose(message) {
      if (verboseEnabled) {
        options.stderr.write(`tagsmith verbose: ${message}\n`);
      }
    },
    warn(message) {
      if (options.mode === "human") {
        const prefix = color ? pc.yellow("warning:") : "warning:";
        options.stderr.write(`${prefix} ${message}\n`);
      }
    },
    writeJson(value) {
      options.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    },
    writeRaw(value) {
      options.stdout.write(value);
    },
  };
}

export type GitHubOutputValue = boolean | number | string;

export function formatGitHubOutput(values: Readonly<Record<string, GitHubOutputValue>>): string {
  let output = "";

  for (const [key, value] of Object.entries(values)) {
    const rendered = String(value);
    if (/[^\x20-\x7E]/u.test(rendered)) {
      throw new Error(`GitHub output value for ${key} must be single-line printable text.`);
    }
    output += `${key}=${rendered}\n`;
  }

  return output;
}

export function writeGitHubOutputFile(
  filePath: string,
  values: Readonly<Record<string, GitHubOutputValue>>,
): void {
  appendFileSync(filePath, formatGitHubOutput(values), { encoding: "utf8" });
}
