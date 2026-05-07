export interface PromptEligibilityInput {
  readonly ci?: boolean | string | undefined;
  readonly help: boolean;
  readonly machineMode: "--github-output" | "--json" | undefined;
  readonly rawMode: boolean;
  readonly stdinIsTty: boolean;
  readonly stdoutIsTty: boolean;
  readonly version: boolean;
}

export function isPromptEligible(input: PromptEligibilityInput): boolean {
  return (
    input.stdinIsTty &&
    input.stdoutIsTty &&
    !isTruthyCi(input.ci) &&
    !input.help &&
    !input.version &&
    input.machineMode === undefined &&
    !input.rawMode
  );
}

function isTruthyCi(value: boolean | string | undefined): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === undefined) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false";
}
