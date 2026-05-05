import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { writeGitHubOutputFile } from "@/cli/output/create-output";

describe("GitHub output file adapter", () => {
  test("appends deterministic records to the GitHub Actions output file", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "tagsmith-github-output-"));
    const outputPath = join(tempDirectory, "GITHUB_OUTPUT");

    try {
      writeGitHubOutputFile(outputPath, { target: "signal", valid: true });
      writeGitHubOutputFile(outputPath, { tagMessage: "Release signal 1.2.3" });

      await expect(readFile(outputPath, "utf8")).resolves.toBe(
        "target=signal\nvalid=true\ntagMessage=Release signal 1.2.3\n",
      );
    } finally {
      await rm(tempDirectory, { force: true, recursive: true });
    }
  });
});
