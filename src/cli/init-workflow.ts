import {
  inspectInitConfigDestination,
  writeInitConfigFile,
  type InitConfigDestinationInspectionResult,
  type WriteInitConfigResult,
} from "@/adapters/fs/init-config-file";
import { resolveCommandContext } from "@/cli/command-context";
import { initConfigTemplate } from "@/core/init/init-template";

export type InitWorkflowContextResult =
  | {
      readonly configPath: string;
      readonly ok: true;
      readonly repoRoot: string;
      readonly template: string;
    }
  | { readonly error: string; readonly ok: false };

export async function resolveInitWorkflowContext(options: {
  readonly configPath: string | undefined;
  readonly cwd: string;
  readonly signal?: AbortSignal | undefined;
}): Promise<InitWorkflowContextResult> {
  const context = await resolveCommandContext(options);
  if (!context.ok) {
    return context;
  }

  return {
    configPath: context.configPath,
    ok: true,
    repoRoot: context.repoRoot,
    template: initConfigTemplate,
  };
}

export async function inspectInitWorkflowDestination(
  destination: string,
  options: { readonly signal?: AbortSignal | undefined } = {},
): Promise<InitConfigDestinationInspectionResult> {
  return inspectInitConfigDestination(destination, options);
}

export async function writeInitWorkflowTemplate(options: {
  readonly destination: string;
  readonly force: boolean;
  readonly signal?: AbortSignal | undefined;
  readonly template: string;
}): Promise<WriteInitConfigResult> {
  return writeInitConfigFile(options);
}
