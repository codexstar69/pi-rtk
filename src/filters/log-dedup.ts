/**
 * Log deduplication filter — collapses consecutive identical (or
 * timestamp-different but same-message) log lines into a single
 * occurrence with an (xN) suffix.
 *
 * Rules:
 * - Collapse 3+ consecutive identical lines into one + "(xN)"
 * - Runs of fewer than 3 identical lines are preserved verbatim
 * - Lines that differ only by timestamp are treated as identical
 * - Summary appended: "{N} unique lines ({N} total, {N} duplicates collapsed)"
 *
 * Matches: docker logs, journalctl, tail on log files, cat on .log files.
 */

import type { Filter, FilterResult } from "./index.js";

// ── ANSI stripping ────────────────────────────────────────────────

/** Strip ANSI escape sequences (SGR + OSC 8 hyperlinks). */
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, "");
}

// ── Timestamp normalisation ───────────────────────────────────────

/**
 * Remove common timestamp prefixes so two lines that differ only by
 * timestamp compare as equal.
 *
 * Supported formats:
 *  - ISO 8601: 2024-01-15T10:30:00.000Z
 *  - Syslog:   Jan 15 10:30:00
 *  - Bracketed: [2024-01-15 10:30:00] or [2024-01-15T10:30:00.000Z]
 */
function normalizeForComparison(line: string): string {
  return line
    // ISO 8601 timestamps at start of line
    .replace(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\d]*Z?\s*/g, "")
    // Syslog-style: Jan 15 10:30:00
    .replace(/^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s*/g, "")
    // Bracketed timestamps: [2024-01-15 10:30:00]
    .replace(/^\[\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\d]*Z?\]\s*/g, "")
    .trim();
}

// ── Core dedup logic ──────────────────────────────────────────────

interface DedupStats {
  totalLines: number;
  uniqueLines: number;
  duplicatesCollapsed: number;
}

/**
 * Walk the lines array, collapsing runs of 3+ identical (after
 * normalisation) lines into one representative line + "(xN)".
 * Runs shorter than 3 are emitted verbatim.
 *
 * Returns the deduplicated lines and statistics.
 */
function dedup(lines: string[]): { result: string[]; stats: DedupStats } {
  const result: string[] = [];
  const uniqueSet = new Set<string>();
  let duplicatesCollapsed = 0;

  let i = 0;
  while (i < lines.length) {
    const cur = lines[i];
    const curNorm = normalizeForComparison(cur);

    // Count how many consecutive lines share the same normalised value
    let runLen = 1;
    while (
      i + runLen < lines.length &&
      normalizeForComparison(lines[i + runLen]) === curNorm
    ) {
      runLen++;
    }

    uniqueSet.add(curNorm);

    if (runLen >= 3) {
      // Collapse: emit first occurrence + (xN)
      result.push(`${cur} (x${runLen})`);
      duplicatesCollapsed += runLen - 1;
    } else {
      // Preserve each line individually
      for (let j = 0; j < runLen; j++) {
        result.push(lines[i + j]);
      }
    }

    i += runLen;
  }

  return {
    result,
    stats: {
      totalLines: lines.length,
      uniqueLines: uniqueSet.size,
      duplicatesCollapsed,
    },
  };
}

// ── Matching patterns ─────────────────────────────────────────────

/** Regex for commands whose output is typically log-like. */
const LOG_CMD = /^(docker\s+logs|journalctl)\b/;

/** Tail on files (especially log files). */
const TAIL_CMD = /^tail\b/;

/** Cat of .log files or common log paths. */
const CAT_LOG_CMD = /^cat\s+.*\.(log|logs)\b|^cat\s+.*\/log\//;

// ── Filter export ─────────────────────────────────────────────────

export function createLogDedupFilter(): Filter {
  return {
    name: "log-dedup",

    matches(command: string): boolean {
      const cmd = command.trim();
      if (LOG_CMD.test(cmd)) return true;
      if (TAIL_CMD.test(cmd)) return true;
      if (CAT_LOG_CMD.test(cmd)) return true;
      return false;
    },

    apply(_command: string, raw: string): FilterResult {
      const rawChars = raw.length;
      const cleaned = strip(raw);
      const lines = cleaned.split("\n");

      // Handle empty / trivial input
      if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) {
        const summary = "\n0 unique lines (0 total, 0 duplicates collapsed)";
        return { filtered: summary, rawChars, filteredChars: summary.length };
      }

      const { result, stats } = dedup(lines);

      // Append summary line
      const summary = `${stats.uniqueLines} unique lines (${stats.totalLines} total, ${stats.duplicatesCollapsed} duplicates collapsed)`;
      result.push("");
      result.push(summary);

      const filtered = result.join("\n");
      return { filtered, rawChars, filteredChars: filtered.length };
    },
  };
}
