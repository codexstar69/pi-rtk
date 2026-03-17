/**
 * Git action filter — compresses push/pull/fetch/add/commit output to a
 * single "ok ✓ {action}: {summary}" line, while preserving errors like
 * rejected pushes and merge conflicts.
 *
 * Output format (success):
 *   ok ✓ push: main -> main
 *
 * Output format (error): preserved verbatim or with minimal compaction
 */

import type { Filter, FilterResult } from "./index.js";

/** Error patterns that must be preserved (not reduced to ok line). */
const ERROR_PATTERNS = [
  /\[rejected\]/i,
  /error:/i,
  /fatal:/i,
  /CONFLICT/,
  /merge failed/i,
  /remote rejected/i,
  /hook declined/i,
  /nothing to commit/i,
  /no changes added/i,
  /failed to push/i,
];

/**
 * Detect the git action type from the command string.
 */
function detectAction(command: string): string {
  const match = command.match(/^git\s+(push|pull|fetch|add|commit)\b/);
  return match ? match[1] : "action";
}

/**
 * Check if the output contains error/conflict indicators that should be preserved.
 */
function hasErrors(raw: string): boolean {
  return ERROR_PATTERNS.some((re) => re.test(raw));
}

/**
 * Extract a short summary from successful output.
 */
function extractSummary(action: string, raw: string): string {
  const trimmed = raw.trim();

  switch (action) {
    case "push": {
      // Try to find branch update line: abc1234..def5678 main -> main
      // Normal push uses ".." and forced push uses "..."
      const refMatch = trimmed.match(/([a-f0-9]+\.{2,3}[a-f0-9]+)\s+(\S+)\s*->\s*(\S+)/);
      if (refMatch) return `${refMatch[2]} -> ${refMatch[3]}`;
      // Try to find tag push: [new tag] v1.0.0 -> v1.0.0
      const tagMatch = trimmed.match(/\[new tag\]\s+(\S+)/);
      if (tagMatch) return `tag ${tagMatch[1]}`;
      return "completed";
    }

    case "pull": {
      // Fast-forward or already up to date
      if (/Already up[- ]to[- ]date/i.test(trimmed)) return "already up to date";
      // Try to find files changed summary
      const statsMatch = trimmed.match(/(\d+)\s+files?\s+changed/);
      if (statsMatch) return `${statsMatch[1]} files updated`;
      return "completed";
    }

    case "fetch": {
      // Count new branches/tags
      const newBranches = (trimmed.match(/\[new branch\]/g) || []).length;
      const newTags = (trimmed.match(/\[new tag\]/g) || []).length;
      const parts: string[] = [];
      if (newBranches > 0) parts.push(`${newBranches} new branch${newBranches > 1 ? "es" : ""}`);
      if (newTags > 0) parts.push(`${newTags} new tag${newTags > 1 ? "s" : ""}`);
      return parts.length > 0 ? parts.join(", ") : "completed";
    }

    case "add": {
      if (!trimmed) return "staged";
      // Count files added
      const addedFiles = trimmed.split("\n").filter((l) => l.startsWith("add "));
      if (addedFiles.length > 0) return `${addedFiles.length} files staged`;
      return "staged";
    }

    case "commit": {
      // Extract commit message from [branch hash] message
      const commitMatch = trimmed.match(/^\[.+?\]\s+(.+)/m);
      if (commitMatch) {
        const msg = commitMatch[1].trim();
        return msg.length > 60 ? msg.slice(0, 60) + "..." : msg;
      }
      return "committed";
    }

    default:
      return "completed";
  }
}

/**
 * Strip hint lines from error output (lines starting with "hint:").
 */
function stripHints(raw: string): string {
  return raw
    .split("\n")
    .filter((line) => !line.startsWith("hint:"))
    .join("\n")
    .trim();
}

export function createGitActionFilter(): Filter {
  return {
    name: "git-action",

    matches(command: string): boolean {
      return /^git\s+(push|pull|fetch|add|commit)\b/.test(command);
    },

    apply(command: string, raw: string): FilterResult {
      const rawChars = raw.length;
      const action = detectAction(command);

      // Check for errors that must be preserved
      if (hasErrors(raw)) {
        // Strip hint lines for compactness, but keep error info
        const compacted = stripHints(raw);
        return { filtered: compacted, rawChars, filteredChars: compacted.length };
      }

      // Success: compress to single line
      const summary = extractSummary(action, raw);
      const filtered = `ok ✓ ${action}: ${summary}`;
      return { filtered, rawChars, filteredChars: filtered.length };
    },
  };
}
