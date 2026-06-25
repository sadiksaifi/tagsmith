import { z } from "zod";

import { loadConfigFile } from "@/adapters/fs/config-file";
import { validateTargetPaths } from "@/adapters/fs/target-paths";
import { readLocalTags, readRemoteTags } from "@/adapters/git/process-git";
import { resolveCommandContext } from "@/cli/command-context";
import type { CliOutput } from "@/cli/output/create-output";
import type { ProgressReporter } from "@/cli/output/progress";
import {
  listConfiguredTags,
  selectConfiguredListTargets,
  type ListedTag,
} from "@/core/release/release";

const listInputSchema = z
  .object({
    channel: z.string().optional(),
    configPath: z.string().optional(),
    cwd: z.string(),
    json: z.boolean(),
    local: z.boolean(),
    remote: z.boolean(),
    target: z.string().optional(),
  })
  .strict();

export interface ListCommandOptions {
  readonly configPath: string | undefined;
  readonly cwd: string;
  readonly flags: Readonly<Record<string, boolean | string>>;
  readonly output: CliOutput;
  readonly progress: ProgressReporter;
}

export async function runListCommand(options: ListCommandOptions): Promise<number> {
  const input = listInputSchema.safeParse({
    configPath: options.configPath,
    cwd: options.cwd,
    channel: stringFlag(options.flags["--channel"]),
    json: options.flags["--json"] === true,
    local: options.flags["--local"] === true,
    remote: options.flags["--remote"] === true,
    target: stringFlag(options.flags["--target"]),
  });

  if (!input.success) {
    options.output.error(input.error.issues[0]?.message ?? "invalid list command input");
    return 1;
  }

  const includeLocal = input.data.local || !input.data.remote;
  const includeRemote = input.data.remote || !input.data.local;

  const context = await options.progress.phase("Resolving Git repository", async (phase) => {
    const result = await resolveCommandContext({
      configPath: input.data.configPath,
      cwd: input.data.cwd,
      signal: phase.signal,
    });
    if (!result.ok) {
      phase.fail();
    }
    return result;
  });
  if (!context.ok) {
    options.output.error(context.error);
    return 1;
  }

  const loaded = await options.progress.phase("Loading config", async (phase) => {
    const result = await loadConfigFile(context.configPath, { signal: phase.signal });
    if (!result.ok) {
      phase.fail();
    }
    return result;
  });
  if (!loaded.ok) {
    options.output.error(loaded.error);
    return 1;
  }

  const filter = selectConfiguredListTargets({
    channelName: input.data.channel,
    targetName: input.data.target,
    targets: loaded.effectiveTargets,
  });
  if (!filter.ok) {
    options.output.error(filter.error);
    return 1;
  }

  const paths = await options.progress.phase("Validating target paths", async (phase) => {
    const result = await validateTargetPaths(context.repoRoot, filter.targets, {
      signal: phase.signal,
    });
    if (!result.ok) {
      phase.fail();
    }
    return result;
  });
  if (!paths.ok) {
    options.output.error(paths.error);
    return 1;
  }

  const localTags = includeLocal
    ? await options.progress.phase("Reading local tags", async (phase) => {
        const result = await readLocalTags(context.repoRoot, { signal: phase.signal });
        if (!result.ok) {
          phase.fail();
        }
        return result;
      })
    : ({ ok: true, tags: [] } as const);
  if (!localTags.ok) {
    options.output.error(localTags.error);
    return 1;
  }

  const remoteTags = includeRemote
    ? await options.progress.phase(
        `Reading tags from ${loaded.config.git.remote}`,
        async (phase) => {
          const result = await readRemoteTags(context.repoRoot, loaded.config.git.remote, {
            signal: phase.signal,
          });
          if (!result.ok) {
            phase.fail();
          }
          return result;
        },
      )
    : ({ ok: true, tags: [] } as const);
  if (!remoteTags.ok) {
    options.output.error(remoteTags.error);
    return 1;
  }

  const listed = listConfiguredTags({
    channelName: input.data.channel,
    localTags: localTags.tags,
    remoteTags: remoteTags.tags,
    targetName: input.data.target,
    targets: loaded.effectiveTargets,
  });
  if (!listed.ok) {
    options.output.error(listed.error);
    return 1;
  }

  if (input.data.json) {
    options.output.writeJson(listed.tags);
    return 0;
  }

  for (const warning of loaded.warnings) {
    options.output.warn(warning);
  }
  options.output.human(renderListedTags(listed.tags));
  return 0;
}

export function renderListedTags(tags: readonly ListedTag[]): string {
  const header = ["tag", "target", "channel", "version", "status"];
  const rows = [
    header,
    ...tags.map((tag) => [tag.tag, tag.target, tag.channel, tag.version, tag.status]),
  ];
  const widths = header.map((_, index) => Math.max(...rows.map((row) => row[index]?.length ?? 0)));

  return rows
    .map((row) =>
      row
        .map((cell, index) => cell.padEnd(widths[index] ?? cell.length))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

function stringFlag(value: boolean | string | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
