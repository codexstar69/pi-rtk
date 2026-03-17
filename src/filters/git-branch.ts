/**
 * Git branch filter — compresses branch listing into a compact format
 * with current branch marker (*) and truncation at 50+ branches.
 *
 * Output format:
 *   * main  develop  feature/auth  feature/api  ...
 *   + N more branches
 */

import type { Filter, FilterResult } from "./index.js";

/** Max branches to display before truncation. */
const MAX_BRANCHES = 50;

interface BranchEntry {
  name: string;
  isCurrent: boolean;
}

/**
 * Parse git branch output into structured entries.
 * Handles plain, -v (verbose), -a (all), and -r (remote) formats.
 */
function parseBranches(raw: string): BranchEntry[] {
  const lines = raw.split("\n");
  const branches: BranchEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isCurrent = trimmed.startsWith("* ");

    // Extract branch name — strip leading "* " or "  "
    let name: string;
    if (isCurrent) {
      name = trimmed.slice(2).trim();
    } else {
      name = trimmed;
    }

    // For verbose output (git branch -v), extract just the branch name
    // Format: "branch-name  abc1234 Commit message"
    // But also handle: "remotes/origin/HEAD -> origin/main"
    if (name.includes(" -> ")) {
      // Remote HEAD pointer — keep the full line as branch name
      // e.g., "remotes/origin/HEAD -> origin/main"
    } else {
      // Take just the first token (branch name, without hash/message)
      const parts = name.split(/\s+/);
      if (parts.length > 1 && /^[0-9a-f]{7,}$/.test(parts[1])) {
        // Verbose format: "branch-name abc1234 message"
        name = parts[0];
      }
    }

    branches.push({ name, isCurrent });
  }

  return branches;
}

export function createGitBranchFilter(): Filter {
  return {
    name: "git-branch",

    matches(command: string): boolean {
      return /^git\s+branch\b/.test(command);
    },

    apply(command: string, raw: string): FilterResult {
      const rawChars = raw.length;

      if (!raw.trim()) {
        const empty = "No branches";
        return { filtered: empty, rawChars, filteredChars: empty.length };
      }

      const all = parseBranches(raw);

      if (all.length === 0) {
        return { filtered: raw, rawChars, filteredChars: raw.length };
      }

      const total = all.length;

      // If truncating, ensure current branch is always included
      let shown: BranchEntry[];
      if (total > MAX_BRANCHES) {
        const currentIdx = all.findIndex((b) => b.isCurrent);
        const first = all.slice(0, MAX_BRANCHES);

        // If current branch is beyond the limit, swap it in
        if (currentIdx >= MAX_BRANCHES) {
          first[MAX_BRANCHES - 1] = all[currentIdx];
        }

        shown = first;
      } else {
        shown = all;
      }

      // Format branches compactly
      const formatted = shown.map((b) =>
        b.isCurrent ? `* ${b.name}` : b.name,
      );

      const lines: string[] = [formatted.join("  ")];

      if (total > MAX_BRANCHES) {
        const remaining = total - MAX_BRANCHES;
        lines.push(`+ ${remaining} more branches`);
      }

      const filtered = lines.join("\n");
      return { filtered, rawChars, filteredChars: filtered.length };
    },
  };
}
