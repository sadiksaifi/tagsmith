import { beforeEach, describe, expect, test, vi } from "vitest";

const clack = vi.hoisted(() => {
  const cancelled = Symbol("cancelled");
  return {
    cancel: vi.fn(),
    cancelled,
    confirm: vi.fn(),
    intro: vi.fn(),
    isCancel: vi.fn((value: unknown) => value === cancelled),
    log: { warn: vi.fn() },
    note: vi.fn(),
    outro: vi.fn(),
    select: vi.fn(),
    text: vi.fn(),
  };
});

vi.mock("@clack/prompts", () => ({
  cancel: clack.cancel,
  confirm: clack.confirm,
  intro: clack.intro,
  isCancel: clack.isCancel,
  log: clack.log,
  note: clack.note,
  outro: clack.outro,
  select: clack.select,
  text: clack.text,
}));

import { createClackPromptAdapter } from "@/interactive/clack-prompt-adapter";

describe("Clack prompt adapter", () => {
  beforeEach(() => {
    clack.cancel.mockReset();
    clack.confirm.mockReset();
    clack.intro.mockReset();
    clack.isCancel.mockClear();
    clack.log.warn.mockReset();
    clack.note.mockReset();
    clack.outro.mockReset();
    clack.select.mockReset();
    clack.text.mockReset();
  });

  test("renders action menu with shared command order and descriptions", async () => {
    clack.select.mockResolvedValue("validate");
    const adapter = createClackPromptAdapter();

    const decision = await adapter.selectAction({
      commands: [
        { description: "Create a Tagsmith config file.", name: "init" },
        { description: "Resolve, create, and optionally push a release tag.", name: "tag" },
        { description: "Validate a release tag and emit CI-safe facts.", name: "validate" },
        { description: "List configured release targets.", name: "targets" },
      ],
    });

    expect(decision).toEqual({ type: "select", value: "validate" });
    expect(clack.intro).toHaveBeenCalledWith("tagsmith");
    expect(clack.select).toHaveBeenCalledWith({
      initialValue: "tag",
      message: "What would you like to do?",
      options: [
        { label: "init     Create a Tagsmith config file.", value: "init" },
        {
          label: "tag      Resolve, create, and optionally push a release tag.",
          value: "tag",
        },
        { label: "validate Validate a release tag and emit CI-safe facts.", value: "validate" },
        { label: "targets  List configured release targets.", value: "targets" },
      ],
    });
  });

  test("renders omitted-push review actions with local create as the default", async () => {
    clack.select.mockResolvedValue("create-local");
    const adapter = createClackPromptAdapter();

    const decision = await adapter.renderTagReview({
      defaultAction: "create-local",
      equivalentCommand: "tagsmith tag --target app --channel prod --version 1.0.0",
      facts: "Tag: app@1.0.0",
      pushExplicit: false,
    });

    expect(decision).toBe("create-local");
    expect(clack.intro).toHaveBeenCalledWith("tagsmith tag");
    expect(clack.note).toHaveBeenCalledWith(
      "Tag: app@1.0.0\n\nEquivalent command:\ntagsmith tag --target app --channel prod --version 1.0.0",
      "Review",
    );
    expect(clack.select).toHaveBeenCalledWith({
      initialValue: "create-local",
      message: "What should Tagsmith do?",
      options: [
        { label: "Create annotated local tag", value: "create-local" },
        {
          label: "Create annotated local tag and push",
          value: "create-and-push",
        },
        { label: "No, do not create a tag", value: "cancel" },
      ],
    });
  });

  test("renders explicit-push review actions with cancel as the default", async () => {
    clack.select.mockResolvedValue("create-and-push");
    const adapter = createClackPromptAdapter();

    const decision = await adapter.renderTagReview({
      defaultAction: "cancel",
      equivalentCommand: "tagsmith tag --target app --channel prod --version 1.0.0 --push",
      facts: "Tag: app@1.0.0",
      pushExplicit: true,
    });

    expect(decision).toBe("create-and-push");
    expect(clack.select).toHaveBeenCalledWith({
      initialValue: "cancel",
      message: "Create and push this tag?",
      options: [
        {
          label: "Yes, create annotated local tag and push",
          value: "create-and-push",
        },
        { label: "No, do not create or push a tag", value: "cancel" },
      ],
    });
  });

  test("normalizes Clack cancellation to safe cancel", async () => {
    clack.select.mockResolvedValue(clack.cancelled);
    const adapter = createClackPromptAdapter();

    await expect(
      adapter.renderTagReview({
        defaultAction: "create-local",
        equivalentCommand: "tagsmith tag --target app --channel prod --version 1.0.0",
        facts: "Tag: app@1.0.0",
        pushExplicit: false,
      }),
    ).resolves.toBe("cancel");
  });

  test("normalizes unexpected review selections to safe cancel", async () => {
    clack.select.mockResolvedValue("unexpected");
    const adapter = createClackPromptAdapter();

    await expect(
      adapter.renderTagReview({
        defaultAction: "cancel",
        equivalentCommand: "tagsmith tag --target app --channel prod --version 1.0.0 --push",
        facts: "Tag: app@1.0.0",
        pushExplicit: true,
      }),
    ).resolves.toBe("cancel");
  });
});
