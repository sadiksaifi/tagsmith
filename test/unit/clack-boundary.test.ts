import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { describe, expect, test } from "vitest";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return sourceFiles(path);
      }
      return entry.isFile() && path.endsWith(".ts") ? [path] : [];
    }),
  );

  return files.flat();
}

describe("Clack import boundary", () => {
  test("only src/interactive imports @clack/prompts", async () => {
    const root = new URL("../../src", import.meta.url).pathname;
    const files = await sourceFiles(root);
    const offenders: string[] = [];

    const checkedFiles = await Promise.all(
      files.map(async (file) => ({ file, text: await readFile(file, "utf8") })),
    );

    for (const { file, text } of checkedFiles) {
      if (!text.includes("@clack/prompts")) {
        continue;
      }

      const relativePath = relative(root, file);
      if (!relativePath.startsWith(`interactive${sep}`)) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });
});
