import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

export function withoutGitLocalEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
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

export function poisonedGitLocalEnv(
  repo: string,
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...env,
    GIT_DIR: join(repo, ".git"),
    GIT_INDEX_FILE: join(repo, ".git", "index"),
    GIT_PREFIX: "",
    GIT_WORK_TREE: repo,
  };
}

export async function withPoisonedGitLocalEnv<T>(
  repo: string,
  callback: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const name of gitLocalEnvNames) {
    previous.set(name, process.env[name]);
  }
  for (const name of Object.keys(process.env)) {
    if (/^GIT_CONFIG_(?:KEY|VALUE)_\d+$/u.test(name)) {
      previous.set(name, process.env[name]);
    }
  }

  Object.assign(process.env, poisonedGitLocalEnv(repo));

  try {
    return await callback();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

export async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", [...args], {
    cwd,
    encoding: "utf8",
    env: withoutGitLocalEnv(),
  });
  return result.stdout.trim();
}
