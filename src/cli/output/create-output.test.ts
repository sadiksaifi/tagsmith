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
  test("human mode routes stdout, errors, warnings, and verbose chatter", () => {
    const stdout = new MemoryWriter();
    const stderr = new MemoryWriter();
    const output = createOutput({ mode: "human", stderr, stdout, verbose: true });

    output.human("release ready");
    output.human("already terminated\n");
    output.warn("check tagPattern namespace");
    output.verbose("loaded config from .tagsmith.jsonc");
    output.error("invalid release request");

    expect(stdout.text).toBe("release ready\nalready terminated\n");
    expect(stderr.text).toContain("warning: check tagPattern namespace\n");
    expect(stderr.text).toContain("tagsmith verbose: loaded config from .tagsmith.jsonc\n");
    expect(stderr.text).toContain("tagsmith failed: invalid release request\n");
  });

  test("human color mode keeps output on the human stderr boundary", () => {
    const stdout = new MemoryWriter();
    const stderr = new MemoryWriter();
    const output = createOutput({ color: true, mode: "human", stderr, stdout });

    output.warn("color-capable warning");
    output.error("color-capable error");

    expect(stdout.text).toBe("");
    expect(stderr.text).toContain("warning:");
    expect(stderr.text).toContain("color-capable warning");
    expect(stderr.text).toContain("tagsmith failed:");
    expect(stderr.text).toContain("color-capable error");
  });

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

  test("machine-mode errors stay color-free even when color is requested", () => {
    const stdout = new MemoryWriter();
    const stderr = new MemoryWriter();
    const output = createOutput({ color: true, mode: "json", stderr, stdout });

    output.error("bad machine request");

    expect(stdout.text).toBe("");
    expect(stderr.text).toBe("tagsmith failed: bad machine request\n");
    expect(stderr.text).not.toContain(`${String.fromCodePoint(27)}[`);
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

  test("GitHub output accepts printable Unicode values", () => {
    expect(formatGitHubOutput({ tagMessage: "Release café 1.2.3" })).toBe(
      "tagMessage=Release café 1.2.3\n",
    );
  });

  test("GitHub output rejects control characters in values", () => {
    expect(() => formatGitHubOutput({ tag: "signal@1.2.3\nother=value" })).toThrow(
      "must be single-line printable text",
    );
    expect(() => formatGitHubOutput({ tag: "signal@1.2.3\u0001" })).toThrow(
      "must be single-line printable text",
    );
  });

  test("GitHub output rejects unsafe keys", () => {
    expect(() => formatGitHubOutput({ "tag\nother": "signal@1.2.3" })).toThrow(
      "GitHub output key must be an identifier",
    );
  });
});
