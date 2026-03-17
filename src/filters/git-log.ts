/**
 * Git log filter — compresses verbose `git log` output into oneline format
 * with max 20 commits and 80-char subject truncation.
 *
 * Output format:
 *   {short-hash} {subject (≤80 chars)}
 *   ...
 *   + N more commits
 */

import type { Filter, FilterResult } from "./index.js";

/** Maximum number of commit entries to show. */
const MAX_COMMITS = 20;

/** Maximum subject length before truncation. */
const MAX_SUBJECT = 80;

/** Regex to detect a commit header line. */
const RE_COMMIT = /^commit\s+([0-9a-f]{7,40})/;

/** Regex to detect an already-oneline formatted line (short hash + text). */
const RE_ONELINE = /^([0-9a-f]{7,12})\s+(.+)/;

interface LogEntry {
  hash: string;
  subject: string;
}

/**
 * Parse verbose `git log` output into entries.
 * Handles both verbose (default) and --oneline formats.
 */
function parseLog(raw: string): LogEntry[] {
  const lines = raw.split("\n");
  const entries: LogEntry[] = [];

  let currentHash: string | null = null;
  let collectingSubject = false;

  for (const line of lines) {
    // Check for verbose commit header
    const commitMatch = line.match(RE_COMMIT);
    if (commitMatch) {
      currentHash = commitMatch[1].slice(0, 7);
      collectingSubject = true;
      continue;
    }

    // Check for oneline format
    if (!currentHash) {
      const onelineMatch = line.match(RE_ONELINE);
      if (onelineMatch) {
        entries.push({
          hash: onelineMatch[1].slice(0, 7),
          subject: onelineMatch[2].trim(),
        });
        continue;
      }
    }

    // In verbose mode, subject is the first non-empty indented line after commit
    if (currentHash && collectingSubject) {
      // Skip Author/Date/Merge lines
      if (
        line.startsWith("Author:") ||
        line.startsWith("Date:") ||
        line.startsWith("Merge:") ||
        line.trim() === ""
      ) {
        continue;
      }

      // Subject line (indented with spaces)
      const subject = line.trim();
      if (subject.length > 0) {
        entries.push({ hash: currentHash, subject });
        currentHash = null;
        collectingSubject = false;
      }
    }
  }

  return entries;
}

/**
 * Truncate a subject to MAX_SUBJECT characters with ellipsis.
 */
function truncateSubject(subject: string): string {
  if (subject.length <= MAX_SUBJECT) return subject;
  return subject.slice(0, MAX_SUBJECT) + "...";
}

export function createGitLogFilter(): Filter {
  return {
    name: "git-log",

    matches(command: string): boolean {
      return /^git\s+log\b/.test(command);
    },

    apply(command: string, raw: string): FilterResult {
      const rawChars = raw.length;

      if (!raw.trim()) {
        const empty = "No commits";
        return { filtered: empty, rawChars, filteredChars: empty.length };
      }

      const entries = parseLog(raw);

      if (entries.length === 0) {
        return { filtered: raw, rawChars, filteredChars: raw.length };
      }

      const total = entries.length;
      const shown = entries.slice(0, MAX_COMMITS);

      const lines: string[] = shown.map(
        (e) => `${e.hash} ${truncateSubject(e.subject)}`,
      );

      if (total > MAX_COMMITS) {
        lines.push(`+ ${total - MAX_COMMITS} more commits`);
      }

      const filtered = lines.join("\n");
      return { filtered, rawChars, filteredChars: filtered.length };
    },
  };
}
