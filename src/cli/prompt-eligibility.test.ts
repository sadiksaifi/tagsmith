import { describe, expect, test } from "vitest";

import { isPromptEligible } from "@/cli/prompt-eligibility";

describe("prompt eligibility", () => {
  const eligible = {
    ci: false,
    help: false,
    machineMode: undefined,
    rawMode: false,
    stdinIsTty: true,
    stdoutIsTty: true,
    version: false,
  } as const;

  test("allows prompts only for human TTY command paths", () => {
    expect(isPromptEligible(eligible)).toBe(true);
  });

  test("disables prompts for automation, machine, raw, help, and version paths", () => {
    const cases = [
      { stdinIsTty: false },
      { stdoutIsTty: false },
      { ci: true },
      { ci: "true" },
      { ci: "1" },
      { machineMode: "--json" as const },
      { machineMode: "--github-output" as const },
      { rawMode: true },
      { help: true },
      { version: true },
    ];

    for (const override of cases) {
      expect(isPromptEligible({ ...eligible, ...override })).toBe(false);
    }
  });

  test("treats empty and false-like CI values as not truthy", () => {
    for (const ci of [undefined, false, "", "false", "0"] as const) {
      expect(isPromptEligible({ ...eligible, ci })).toBe(true);
    }
  });
});
