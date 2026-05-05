import { describe, expect, test } from "vitest";

import { createOutput, formatGitHubOutput } from "@/cli/output/create-output";

class MemoryWriter {
  text = "";

  write(chunk: string): boolean {
    this.text += chunk;
    return true;
  }
}

describe("output adapter", () => {
  test("machine JSON writes deterministic color-free stdout without stderr chatter", () => {
    const stdout = new MemoryWriter();
    const stderr = new MemoryWriter();
    const output = createOutput({ mode: "json", stderr, stdout, verbose: true });

    output.warn("human warning");
    output.verbose("debug details");
    output.writeJson({ target: "signal", valid: true });

    expect(stdout.text).toBe('{\n  "target": "signal",\n  "valid": true\n}\n');
    expect(stderr.text).toBe("");
    expect(stdout.text).not.toContain(`${String.fromCodePoint(27)}[`);
  });

  test("machine/raw output suppresses human warnings and verbose chatter", () => {
    const stdout = new MemoryWriter();
    const stderr = new MemoryWriter();
    const output = createOutput({ mode: "raw", stderr, stdout, verbose: true });

    output.warn("human warning");
    output.verbose("debug details");
    output.writeRaw("template bytes\n");

    expect(stdout.text).toBe("template bytes\n");
    expect(stderr.text).toBe("");
  });

  test("GitHub output uses single-line deterministic key-value records", () => {
    expect(
      formatGitHubOutput({
        target: "signal",
        tagMessage: "Release signal 1.2.3",
        valid: true,
      }),
    ).toBe("target=signal\ntagMessage=Release signal 1.2.3\nvalid=true\n");
  });

  test("GitHub output rejects control characters", () => {
    expect(() => formatGitHubOutput({ tag: "signal@1.2.3\nother=value" })).toThrow(
      "must be single-line printable text",
    );
  });
});
