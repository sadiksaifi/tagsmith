import { describe, expect, test } from "vitest";

import { executeReleaseTag, type ReleasePlan } from "@/core/release/tag-execution";

const plan: ReleasePlan = {
  baseVersion: "1.0.0",
  channel: "stable",
  commit: "0123456789abcdef0123456789abcdef01234567",
  strategy: "stable",
  tag: "app@1.0.0",
  tagMessage: "Release app 1.0.0",
  target: "app",
  version: "1.0.0",
};

describe("release tag execution", () => {
  test("creates a local tag without pushing by default", async () => {
    const calls: string[] = [];

    const result = await executeReleaseTag(plan, {
      createAnnotatedTag: async (input) => {
        calls.push(`create ${input.tag} ${input.commit} ${input.message}`);
        return { ok: true };
      },
      push: false,
      pushTag: async () => {
        calls.push("push");
        return { ok: true };
      },
      readRemoteTags: async () => {
        calls.push("verify");
        return { ok: true, tags: [] };
      },
    });

    expect(result).toEqual({
      ok: true,
      result: {
        ...plan,
        created: true,
        dryRun: false,
        pushed: false,
      },
    });
    expect(calls).toEqual([
      "create app@1.0.0 0123456789abcdef0123456789abcdef01234567 Release app 1.0.0",
    ]);
  });

  test("pushes a created tag only after local creation and verifies the peeled remote commit", async () => {
    const calls: string[] = [];

    const result = await executeReleaseTag(plan, {
      createAnnotatedTag: async () => {
        calls.push("create");
        return { ok: true };
      },
      push: true,
      pushTag: async (input) => {
        calls.push(`push ${input.tag}`);
        return { ok: true };
      },
      readRemoteTags: async () => {
        calls.push("verify");
        return {
          ok: true,
          tags: [{ annotated: true, name: plan.tag, peeledCommit: plan.commit }],
        };
      },
    });

    expect(result).toEqual({
      ok: true,
      result: {
        ...plan,
        created: true,
        dryRun: false,
        pushed: true,
      },
    });
    expect(calls).toEqual(["create", "push app@1.0.0", "verify"]);
  });

  test("keeps the local tag state explicit when push or verification fails", async () => {
    await expect(
      executeReleaseTag(plan, {
        createAnnotatedTag: async () => ({ ok: true }),
        push: true,
        pushTag: async () => ({ error: "rejected", ok: false }),
        readRemoteTags: async () => ({ ok: true, tags: [] }),
      }),
    ).resolves.toEqual({
      error: "local tag app@1.0.0 exists but was not pushed: rejected",
      ok: false,
    });

    await expect(
      executeReleaseTag(plan, {
        createAnnotatedTag: async () => ({ ok: true }),
        push: true,
        pushTag: async () => ({ ok: true }),
        readRemoteTags: async () => ({ ok: true, tags: [] }),
      }),
    ).resolves.toEqual({
      error:
        "push verification failed for app@1.0.0: remote tag does not peel to 0123456789abcdef0123456789abcdef01234567. Local tag remains.",
      ok: false,
    });
  });
});
