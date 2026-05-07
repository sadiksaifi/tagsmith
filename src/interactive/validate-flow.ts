import {
  buildValidateCommandInput,
  prepareValidateWorkflow,
  renderHumanValidated,
  validatePreparedRelease,
  type ResolvedValidateCommandInput,
  type ValidateCommandInput,
} from "@/cli/commands/validate-command";
import type { CliOutput } from "@/cli/output/create-output";
import type { PromptAdapter, ValidateAssertionsDecision } from "@/interactive/prompt-adapter";

export interface InteractiveValidateOptions {
  readonly configPath: string | undefined;
  readonly cwd: string;
  readonly flags: Readonly<Record<string, boolean | string>>;
  readonly output: CliOutput;
  readonly promptAdapter: PromptAdapter;
}

export async function runInteractiveValidate(options: InteractiveValidateOptions): Promise<number> {
  const built = buildValidateCommandInput(options);
  if (!built.ok) {
    options.output.error(built.error);
    return 1;
  }

  let input: ValidateCommandInput = built.input;
  const collectingInputs = input.tag === undefined;

  if (input.tag === undefined) {
    const tag = await options.promptAdapter.promptValidateTag();
    if (tag.type === "cancel") {
      await options.promptAdapter.cancel("tagsmith cancelled.");
      return 1;
    }
    input = { ...input, tag: tag.value };
  }

  const prepared = await prepareValidateWorkflow(input);
  if (!prepared.ok) {
    options.output.error(prepared.error);
    return 1;
  }

  await options.promptAdapter.renderValidateWarnings({ warnings: prepared.warnings });

  if (collectingInputs && input.target === undefined && input.channel === undefined) {
    const assertions = await options.promptAdapter.selectValidateAssertions({
      targets: prepared.effectiveTargets.map((target) => ({
        channels: target.channels.map((channel) => ({
          name: channel.name,
          strategy: channel.strategy,
        })),
        name: target.name,
      })),
    });
    if (assertions.type === "cancel") {
      await options.promptAdapter.cancel("tagsmith cancelled.");
      return 1;
    }
    input = applyValidateAssertions(input, assertions);
  }

  if (input.tag === undefined) {
    options.output.error("validate requires --tag");
    return 1;
  }

  const resolvedInput: ResolvedValidateCommandInput = { ...input, tag: input.tag };
  const validated = await validatePreparedRelease(resolvedInput, prepared);
  if (!validated.ok) {
    options.output.error(validated.error);
    return 1;
  }

  await options.promptAdapter.renderValidate({ facts: renderHumanValidated(validated.result) });
  return 0;
}

function applyValidateAssertions(
  input: ValidateCommandInput,
  assertions: Exclude<ValidateAssertionsDecision, { readonly type: "cancel" }>,
): ValidateCommandInput {
  switch (assertions.type) {
    case "infer":
      return input;
    case "assert-target":
      return { ...input, target: assertions.target };
    case "assert-target-channel":
      return { ...input, channel: assertions.channel, target: assertions.target };
  }

  return input;
}
