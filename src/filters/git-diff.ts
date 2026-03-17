/**
 * Git diff filter — compresses verbose `git diff` output into a compact
 * format with stat summary, compact hunks, truncation, and binary skipping.
 *
 * Output format:
 *   {stat lines — file | changes +++ ---}
 *
 *   @@ {file}:{line} @@
 *   {hunk lines, truncated if >20 lines}
 *
 *   {N} files changed, {ins} insertions(+), {del} deletions(-)
 */

import type { Filter, FilterResult } from "./index.js";

/** Max number of content lines in a hunk before truncation. */
const MAX_HUNK_LINES = 20;

/** Number of lines to show when a hunk is truncated. */
const SHOW_LINES = 10;

/** Pre-compiled regex patterns. */
const RE_DIFF_HEADER = /^diff --git a\/(.+?) b\/(.+)$/;
const RE_HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const RE_BINARY = /^Binary files .+ and .+ differ$/;
const RE_DIFF_COMMAND = /^git\s+diff\b/;
const RE_DIFFTOOL = /^git\s+difftool\b/;

/** Parsed representation of a single file's diff. */
interface FileDiff {
  file: string;
  isBinary: boolean;
  hunks: Hunk[];
  insertions: number;
  deletions: number;
}

/** Parsed representation of a single hunk within a file. */
interface Hunk {
  startLine: number;
  lines: string[];
}

/**
 * Parse raw diff output into structured file diffs.
 */
function parseDiff(raw: string): FileDiff[] {
  const files: FileDiff[] = [];
  let current: FileDiff | null = null;
  let currentHunk: Hunk | null = null;

  const lines = raw.split("\n");

  for (const line of lines) {
    // New file diff header
    const diffMatch = line.match(RE_DIFF_HEADER);
    if (diffMatch) {
      // Finalize previous hunk
      if (currentHunk && current) {
        current.hunks.push(currentHunk);
        currentHunk = null;
      }
      current = {
        file: diffMatch[2],
        isBinary: false,
        hunks: [],
        insertions: 0,
        deletions: 0,
      };
      files.push(current);
      continue;
    }

    if (!current) continue;

    // Binary file indicator
    if (RE_BINARY.test(line)) {
      current.isBinary = true;
      continue;
    }

    // Skip index, ---, +++ header lines
    if (
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("old mode ") ||
      line.startsWith("new mode ") ||
      line.startsWith("similarity index ") ||
      line.startsWith("rename from ") ||
      line.startsWith("rename to ") ||
      line.startsWith("new file mode ") ||
      line.startsWith("deleted file mode ")
    ) {
      continue;
    }

    // Hunk header
    const hunkMatch = line.match(RE_HUNK_HEADER);
    if (hunkMatch) {
      // Finalize previous hunk
      if (currentHunk) {
        current.hunks.push(currentHunk);
      }
      currentHunk = {
        startLine: parseInt(hunkMatch[2], 10),
        lines: [],
      };
      continue;
    }

    // Hunk content lines (context, additions, deletions, no-newline marker)
    if (currentHunk) {
      if (line.startsWith("+")) {
        current.insertions++;
        currentHunk.lines.push(line);
      } else if (line.startsWith("-")) {
        current.deletions++;
        currentHunk.lines.push(line);
      } else if (line.startsWith(" ") || line.startsWith("\\")) {
        currentHunk.lines.push(line);
      }
      // Ignore other lines (e.g., empty lines between hunks)
    }
  }

  // Finalize last hunk
  if (currentHunk && current) {
    current.hunks.push(currentHunk);
  }

  return files;
}

/**
 * Build a stat line for a single file (e.g., "src/foo.ts | 12 +++---").
 */
function buildStatLine(fd: FileDiff): string {
  if (fd.isBinary) {
    return `${fd.file} | Binary`;
  }
  const total = fd.insertions + fd.deletions;
  const plus = "+".repeat(Math.min(fd.insertions, 20));
  const minus = "-".repeat(Math.min(fd.deletions, 20));
  return `${fd.file} | ${total} ${plus}${minus}`;
}

/**
 * Build the summary line (e.g., "2 files changed, 10 insertions(+), 3 deletions(-)").
 */
function buildSummary(files: FileDiff[]): string {
  const fileCount = files.length;
  const totalIns = files.reduce((s, f) => s + f.insertions, 0);
  const totalDel = files.reduce((s, f) => s + f.deletions, 0);

  const parts: string[] = [];
  parts.push(`${fileCount} ${fileCount === 1 ? "file" : "files"} changed`);
  if (totalIns > 0) parts.push(`${totalIns} ${totalIns === 1 ? "insertion" : "insertions"}(+)`);
  if (totalDel > 0) parts.push(`${totalDel} ${totalDel === 1 ? "deletion" : "deletions"}(-)`);

  return parts.join(", ");
}

/**
 * Strip context lines, keeping only change lines (+/-) and
 * no-newline markers. This maximizes compression.
 */
function stripContext(lines: string[]): string[] {
  return lines.filter(
    (l) => l.startsWith("+") || l.startsWith("-") || l.startsWith("\\"),
  );
}

/**
 * Format a single hunk with context reduction and truncation.
 */
function formatHunk(file: string, hunk: Hunk): string[] {
  const result: string[] = [];

  // Hunk header with file:line
  result.push(`@@ ${file}:${hunk.startLine} @@`);

  // Strip context lines for maximum compression
  const reduced = stripContext(hunk.lines);

  if (reduced.length > MAX_HUNK_LINES) {
    // Show first SHOW_LINES lines, then truncation indicator
    for (let i = 0; i < SHOW_LINES; i++) {
      result.push(reduced[i]);
    }
    const remaining = reduced.length - SHOW_LINES;
    result.push(`... ${remaining} more lines`);
  } else {
    for (const line of reduced) {
      result.push(line);
    }
  }

  return result;
}

export function createGitDiffFilter(): Filter {
  return {
    name: "git-diff",

    matches(command: string): boolean {
      // Match "git diff" but not "git difftool"
      if (RE_DIFFTOOL.test(command)) return false;
      return RE_DIFF_COMMAND.test(command);
    },

    apply(command: string, raw: string): FilterResult {
      const rawChars = raw.length;

      // Handle empty diff
      if (!raw.trim()) {
        const empty = "No changes";
        return { filtered: empty, rawChars, filteredChars: empty.length };
      }

      const files = parseDiff(raw);

      // If parsing yielded nothing, return as-is
      if (files.length === 0) {
        return { filtered: raw, rawChars, filteredChars: raw.length };
      }

      const output: string[] = [];

      // ── Stat summary at top ─────────────────────────────────────
      for (const fd of files) {
        output.push(buildStatLine(fd));
      }
      output.push(""); // blank separator

      // ── Compact hunks per file ──────────────────────────────────
      for (const fd of files) {
        if (fd.isBinary) {
          output.push(`Binary: ${fd.file}`);
          continue;
        }

        for (const hunk of fd.hunks) {
          output.push(...formatHunk(fd.file, hunk));
        }
      }

      // ── Summary at bottom ───────────────────────────────────────
      output.push(""); // blank separator
      output.push(buildSummary(files));

      const filtered = output.join("\n");
      return { filtered, rawChars, filteredChars: filtered.length };
    },
  };
}
