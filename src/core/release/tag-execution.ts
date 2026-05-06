import type { GitTagRef, ReleasePlan } from "@/core/release/release";

export type { ReleasePlan } from "@/core/release/release";

export type ExecutedTagResult = ReleasePlan & {
  readonly created: true;
  readonly dryRun: false;
  readonly pushed: boolean;
};

export type GitMutationResult =
  | { readonly ok: true }
  | { readonly error: string; readonly ok: false };

export type GitTagReadResult =
  | { readonly ok: true; readonly tags: readonly GitTagRef[] }
  | { readonly error: string; readonly ok: false };

export interface ReleaseTagExecutionPorts {
  readonly createAnnotatedTag: (input: {
    readonly commit: string;
    readonly message: string;
    readonly tag: string;
  }) => Promise<GitMutationResult>;
  readonly push: boolean;
  readonly pushTag: (input: { readonly tag: string }) => Promise<GitMutationResult>;
  readonly readRemoteTags: () => Promise<GitTagReadResult>;
}

export type ReleaseTagExecutionResult =
  | { readonly ok: true; readonly result: ExecutedTagResult }
  | { readonly error: string; readonly ok: false };

export async function executeReleaseTag(
  plan: ReleasePlan,
  ports: ReleaseTagExecutionPorts,
): Promise<ReleaseTagExecutionResult> {
  const created = await ports.createAnnotatedTag({
    commit: plan.commit,
    message: plan.tagMessage,
    tag: plan.tag,
  });
  if (!created.ok) {
    return created;
  }

  if (!ports.push) {
    return { ok: true, result: executedTagResult(plan, false) };
  }

  const pushed = await ports.pushTag({ tag: plan.tag });
  if (!pushed.ok) {
    return {
      error: `local tag ${plan.tag} exists but was not pushed: ${pushed.error}`,
      ok: false,
    };
  }

  const verifiedRemoteTags = await ports.readRemoteTags();
  if (!verifiedRemoteTags.ok) {
    return {
      error: `push verification failed for ${plan.tag}: ${verifiedRemoteTags.error}. Local tag remains.`,
      ok: false,
    };
  }

  const verified = verifiedRemoteTags.tags.find((tag) => tag.name === plan.tag);
  if (verified?.annotated !== true || verified.peeledCommit !== plan.commit) {
    return {
      error: `push verification failed for ${plan.tag}: remote tag does not peel to ${plan.commit}. Local tag remains.`,
      ok: false,
    };
  }

  return { ok: true, result: executedTagResult(plan, true) };
}

function executedTagResult(plan: ReleasePlan, pushed: boolean): ExecutedTagResult {
  return {
    baseVersion: plan.baseVersion,
    channel: plan.channel,
    commit: plan.commit,
    created: true,
    dryRun: false,
    pushed,
    strategy: plan.strategy,
    tag: plan.tag,
    tagMessage: plan.tagMessage,
    target: plan.target,
    version: plan.version,
  };
}
