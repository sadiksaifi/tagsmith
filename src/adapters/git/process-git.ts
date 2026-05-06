import { execFile, type ExecFileOptionsWithStringEncoding } from "node:child_process";
import { promisify } from "node:util";

import type { GitTagRef } from "@/core/release/release";

const execFileAsync = promisify(execFile);

// Git hooks export repository-local variables that override cwd and git -C.
// Strip Git's local env set before every child Git process.
const gitLocalEnvNames = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CONFIG",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_GRAFT_FILE",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_REPLACE_REF_BASE",
  "GIT_PREFIX",
  "GIT_SHALLOW_FILE",
  "GIT_COMMON_DIR",
  "GIT_NAMESPACE",
  "GIT_INTERNAL_SUPER_PREFIX",
  "GIT_SUPER_PREFIX",
] as const;

type GitExecOptions = Omit<ExecFileOptionsWithStringEncoding, "env">;

async function execGit(args: readonly string[], options: GitExecOptions) {
  return execFileAsync("git", [...args], {
    ...options,
    env: withoutGitLocalEnv(process.env),
  });
}

function withoutGitLocalEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const sanitized: NodeJS.ProcessEnv = { ...env };

  for (const name of gitLocalEnvNames) {
    delete sanitized[name];
  }
  for (const name of Object.keys(sanitized)) {
    if (/^GIT_CONFIG_(?:KEY|VALUE)_\d+$/u.test(name)) {
      delete sanitized[name];
    }
  }

  return sanitized;
}

export type DiscoverGitRootResult =
  | { readonly ok: true; readonly repoRoot: string }
  | { readonly error: string; readonly ok: false };

export type VerifyGitRemoteResult =
  | { readonly ok: true }
  | { readonly error: string; readonly ok: false };

export type GitTagReadResult =
  | { readonly ok: true; readonly tags: readonly GitTagRef[] }
  | { readonly error: string; readonly ok: false };

export type GitCommitReadResult =
  | { readonly commit: string; readonly ok: true }
  | { readonly error: string; readonly ok: false };

export type GitMutationResult =
  | { readonly ok: true }
  | { readonly error: string; readonly ok: false };

export type GitReachabilityResult =
  | { readonly ok: true }
  | { readonly error: string; readonly ok: false };

export async function discoverGitRoot(cwd: string): Promise<DiscoverGitRootResult> {
  try {
    const result = await execGit(["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
    });
    return { ok: true, repoRoot: result.stdout.trim() };
  } catch {
    return { error: `Git repository not found from ${cwd}`, ok: false };
  }
}

export async function verifyGitRemote(
  repoRoot: string,
  remoteName: string,
): Promise<VerifyGitRemoteResult> {
  try {
    await execGit(["-C", repoRoot, "remote", "get-url", remoteName], {
      encoding: "utf8",
    });
    return { ok: true };
  } catch {
    return { error: `git.remote ${remoteName} is not configured in ${repoRoot}`, ok: false };
  }
}

export async function isWorkingTreeClean(
  repoRoot: string,
): Promise<{ readonly ok: true } | { readonly error: string; readonly ok: false }> {
  try {
    const result = await execGit(
      ["-C", repoRoot, "status", "--porcelain", "--untracked-files=all"],
      { encoding: "utf8" },
    );
    return result.stdout.trim().length === 0
      ? { ok: true }
      : { error: "working tree must be clean before tagging", ok: false };
  } catch {
    return { error: "failed to inspect working tree state", ok: false };
  }
}

export async function getCurrentHead(repoRoot: string): Promise<GitCommitReadResult> {
  try {
    const result = await execGit(["-C", repoRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
    });
    return { commit: result.stdout.trim(), ok: true };
  } catch {
    return { error: "failed to read current HEAD", ok: false };
  }
}

export async function getRemoteBranchTip(
  repoRoot: string,
  remoteName: string,
  baseBranch: string,
): Promise<GitCommitReadResult> {
  try {
    const result = await execGit(
      ["-C", repoRoot, "ls-remote", remoteName, `refs/heads/${baseBranch}`],
      { encoding: "utf8" },
    );
    const line = result.stdout.trim().split("\n").find(Boolean);
    const [commit] = line?.split(/\s+/u) ?? [];
    if (commit === undefined || !/^[0-9a-f]{40}$/u.test(commit)) {
      return { error: `failed to read remote base branch ${remoteName}/${baseBranch}`, ok: false };
    }
    return { commit, ok: true };
  } catch {
    return { error: `failed to read remote base branch ${remoteName}/${baseBranch}`, ok: false };
  }
}

export async function readLocalTags(repoRoot: string): Promise<GitTagReadResult> {
  try {
    const result = await execGit(
      [
        "-C",
        repoRoot,
        "for-each-ref",
        "refs/tags",
        "--format=%(refname:strip=2)%00%(objecttype)%00%(*objecttype)%00%(objectname)%00%(*objectname)",
      ],
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    );
    return { ok: true, tags: parseLocalTags(result.stdout) };
  } catch {
    return { error: "failed to read local tags", ok: false };
  }
}

export async function readRemoteTags(
  repoRoot: string,
  remoteName: string,
): Promise<GitTagReadResult> {
  try {
    const result = await execGit(["-C", repoRoot, "ls-remote", "--tags", remoteName], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return { ok: true, tags: parseRemoteTags(result.stdout) };
  } catch {
    return { error: `failed to read remote tags from ${remoteName}`, ok: false };
  }
}

export async function isCommitReachableFrom(
  repoRoot: string,
  commit: string,
  ancestorTip: string,
  remoteName: string,
  baseBranch: string,
): Promise<GitReachabilityResult> {
  try {
    await execGit(["-C", repoRoot, "merge-base", "--is-ancestor", commit, ancestorTip], {
      encoding: "utf8",
    });
    return { ok: true };
  } catch {
    return {
      error: `cannot prove tag commit is reachable from ${remoteName}/${baseBranch} with local history.\n\nFetch enough history and retry:\n  git fetch ${remoteName} ${baseBranch} --tags`,
      ok: false,
    };
  }
}

export async function createAnnotatedTag(
  repoRoot: string,
  tagName: string,
  commit: string,
  message: string,
): Promise<GitMutationResult> {
  try {
    await execGit(["-C", repoRoot, "tag", "-a", tagName, commit, "-m", message], {
      encoding: "utf8",
    });
    return { ok: true };
  } catch {
    return { error: `failed to create annotated local tag ${tagName}`, ok: false };
  }
}

export async function pushTag(
  repoRoot: string,
  remoteName: string,
  tagName: string,
): Promise<GitMutationResult> {
  try {
    await execGit(["-C", repoRoot, "push", remoteName, `refs/tags/${tagName}`], {
      encoding: "utf8",
    });
    return { ok: true };
  } catch {
    return { error: `failed to push tag ${tagName} to ${remoteName}`, ok: false };
  }
}

function parseLocalTags(output: string): readonly GitTagRef[] {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name = "", objectType = "", peeledType = "", objectName = "", peeledName = ""] =
        line.split("\0");
      const annotated = objectType === "tag";
      return {
        annotated,
        name,
        peeledCommit: annotated ? (peeledType === "commit" ? peeledName : undefined) : objectName,
      };
    });
}

function parseRemoteTags(output: string): readonly GitTagRef[] {
  const byName = new Map<string, { base?: string; peeled?: string }>();
  for (const line of output.split("\n").filter(Boolean)) {
    const [sha, ref] = line.split(/\s+/u);
    if (sha === undefined || ref === undefined || !ref.startsWith("refs/tags/")) {
      continue;
    }
    const peeled = ref.endsWith("^{}");
    const name = ref.slice("refs/tags/".length, peeled ? -3 : undefined);
    const entry = byName.get(name) ?? {};
    if (peeled) {
      entry.peeled = sha;
    } else {
      entry.base = sha;
    }
    byName.set(name, entry);
  }

  return Array.from(byName, ([name, entry]) => ({
    annotated: entry.peeled !== undefined,
    name,
    peeledCommit: entry.peeled ?? entry.base,
  }));
}
