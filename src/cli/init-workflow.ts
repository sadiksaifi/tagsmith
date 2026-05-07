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
): Promise<InitConfigDestinationInspectionResult> {
  return inspectInitConfigDestination(destination);
}

export async function writeInitWorkflowTemplate(options: {
  readonly destination: string;
  readonly force: boolean;
  readonly template: string;
}): Promise<WriteInitConfigResult> {
  return writeInitConfigFile(options);
}
