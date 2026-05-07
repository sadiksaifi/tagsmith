import { describe, expect, test } from "vitest";

import { renderEquivalentCommand } from "@/cli/equivalent-command";

describe("equivalent command rendering", () => {
  test("renders init with canonical binary, global config, command flag order, and shell escaping", () => {
    expect(
      renderEquivalentCommand({
        command: "init",
        configPath: "./release config/tagsmith's.jsonc",
        flags: { force: true },
      }),
    ).toBe("tagsmith --config './release config/tagsmith'\\''s.jsonc' init --force");
  });

  test("omits init flags that are not part of the reproducible workflow", () => {
    expect(renderEquivalentCommand({ command: "init", flags: {} })).toBe("tagsmith init");
  });

  test("renders tag flags in canonical review order with shell escaping", () => {
    expect(
      renderEquivalentCommand({
        command: "tag",
        configPath: "./release config/tagsmith.jsonc",
        flags: {
          bump: "patch",
          channel: "release channel",
          dryRun: true,
          target: "api service",
        },
      }),
    ).toBe(
      "tagsmith --config './release config/tagsmith.jsonc' tag --target 'api service' --channel 'release channel' --bump patch --dry-run",
    );
  });
});
