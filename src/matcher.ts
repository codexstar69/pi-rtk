/**
 * Command pattern matching — detects which filter to apply to a bash command.
 */

export interface CommandMatch {
  category: string;
  subcategory?: string;
  command: string;
}

/**
 * Match a bash command string to a filter category.
 * Returns null if no filter matches.
 */
export function matchCommand(command: string): CommandMatch | null {
  const trimmed = command.trim();

  // TODO: implement filter matching
  // Categories: git-status, git-diff, git-log, git-action, git-branch,
  //             ls, test-js, test-py, test-rs, test-go,
  //             lint-tsc, lint-js, lint-py, lint-rs,
  //             grep, json-schema, log-dedup, docker, npm-install, http

  return null;
}
