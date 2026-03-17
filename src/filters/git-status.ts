/**
 * Git status filter — compresses verbose `git status` output into a compact
 * emoji-annotated format grouped by status.
 *
 * Output format:
 *   📌 {branch} ({tracking info})
 *   ✅ Staged: {N} files
 *      {file1}  {file2}  {file3}
 *   📝 Modified: {N} files
 *      {file1}  {file2}
 *   ❓ Untracked: {N} files
 *      {file1}
 *   🗑️ Deleted: {N} files
 *      {file1}
 *   ⚠️ Conflicts: {N} files
 *      {file1}
 */

import type { Filter, FilterResult } from "./index.js";

/** Max files to list inline per section before truncation. */
const MAX_INLINE_FILES = 10;

/** Format a list of files inline, truncating if too many. */
function formatFileList(files: string[]): string {
  if (files.length <= MAX_INLINE_FILES) {
    return files.join("  ");
  }
  const shown = files.slice(0, MAX_INLINE_FILES);
  return `${shown.join("  ")}  ... +${files.length - MAX_INLINE_FILES} more`;
}

/** Pre-compiled regex patterns for parsing git status output. */
const RE_BRANCH = /^On branch (.+)$/m;
const RE_DETACHED = /^HEAD detached at (.+)$/m;
const RE_UP_TO_DATE = /up to date/;
const RE_AHEAD = /ahead of '.+?' by (\d+) commit/;
const RE_BEHIND = /behind '.+?' by (\d+) commit/;
const RE_DIVERGED = /have (\d+) and (\d+) different commits/;
const RE_FATAL = /^fatal:/m;

const RE_FILE_ENTRY = /^\t(modified|new file|deleted|renamed|copied|typechange):\s+(.+)$/;
const RE_UNTRACKED_FILE = /^\t([^\s].*)$/;
const RE_CONFLICT_ENTRY = /^\t(both modified|both added|both deleted|added by us|added by them|deleted by us|deleted by them):\s+(.+)$/;

/** Section headers in standard git status output. */
const enum Section {
  None = 0,
  Staged = 1,
  Unstaged = 2,
  Untracked = 3,
  Unmerged = 4,
}

export function createGitStatusFilter(): Filter {
  return {
    name: "git-status",

    matches(command: string): boolean {
      return /^git\s+status\b/.test(command);
    },

    apply(command: string, raw: string): FilterResult {
      const rawChars = raw.length;

      // Preserve fatal errors verbatim
      if (RE_FATAL.test(raw)) {
        return { filtered: raw, rawChars, filteredChars: raw.length };
      }

      const result: string[] = [];

      // ── Parse branch info ───────────────────────────────────────

      const branchMatch = raw.match(RE_BRANCH);
      const detachedMatch = raw.match(RE_DETACHED);

      let branchName: string;
      if (detachedMatch) {
        branchName = `HEAD@${detachedMatch[1]}`;
      } else if (branchMatch) {
        branchName = branchMatch[1];
      } else {
        branchName = "unknown";
      }

      // Parse tracking info
      const trackingParts: string[] = [];

      if (RE_UP_TO_DATE.test(raw)) {
        trackingParts.push("up to date");
      } else {
        const divergedMatch = raw.match(RE_DIVERGED);
        if (divergedMatch) {
          trackingParts.push(`ahead ${divergedMatch[1]}`);
          trackingParts.push(`behind ${divergedMatch[2]}`);
        } else {
          const aheadMatch = raw.match(RE_AHEAD);
          if (aheadMatch) trackingParts.push(`ahead ${aheadMatch[1]}`);

          const behindMatch = raw.match(RE_BEHIND);
          if (behindMatch) trackingParts.push(`behind ${behindMatch[1]}`);
        }
      }

      const tracking = trackingParts.length > 0
        ? trackingParts.join(", ")
        : "";

      result.push(tracking
        ? `📌 ${branchName} (${tracking})`
        : `📌 ${branchName}`);

      // ── Parse file statuses ─────────────────────────────────────

      const staged: string[] = [];
      const modified: string[] = [];
      const untracked: string[] = [];
      const deleted: string[] = [];
      const conflicts: string[] = [];

      const lines = raw.split("\n");
      let section: Section = Section.None;

      for (const line of lines) {
        // Detect section transitions
        if (line.startsWith("Changes to be committed")) {
          section = Section.Staged;
          continue;
        }
        if (line.startsWith("Changes not staged for commit")) {
          section = Section.Unstaged;
          continue;
        }
        if (line.startsWith("Untracked files")) {
          section = Section.Untracked;
          continue;
        }
        if (line.startsWith("Unmerged paths")) {
          section = Section.Unmerged;
          continue;
        }

        // Skip hint lines (indented with spaces, starting with "(use")
        if (/^\s+\(use /.test(line)) continue;

        // Skip blank lines
        if (line.trim() === "") continue;

        // ── Unmerged / conflict entries ────────────────────────────
        if (section === Section.Unmerged) {
          const conflictMatch = line.match(RE_CONFLICT_ENTRY);
          if (conflictMatch) {
            conflicts.push(conflictMatch[2].trim());
            continue;
          }
        }

        // ── File entries with status prefix ───────────────────────
        const fileMatch = line.match(RE_FILE_ENTRY);
        if (fileMatch) {
          const status = fileMatch[1];
          const file = fileMatch[2].trim();

          if (section === Section.Staged) {
            if (status === "deleted") {
              deleted.push(file);
            } else {
              staged.push(file);
            }
          } else if (section === Section.Unstaged) {
            if (status === "deleted") {
              deleted.push(file);
            } else {
              modified.push(file);
            }
          }
          continue;
        }

        // ── Untracked files (tab-indented, no status prefix) ──────
        if (section === Section.Untracked) {
          const untrackedMatch = line.match(RE_UNTRACKED_FILE);
          if (untrackedMatch) {
            untracked.push(untrackedMatch[1].trim());
            continue;
          }
        }
      }

      // ── Build output sections ───────────────────────────────────

      if (conflicts.length > 0) {
        result.push(`⚠️ Conflicts: ${conflicts.length} files`);
        result.push(`   ${formatFileList(conflicts)}`);
      }

      if (staged.length > 0) {
        result.push(`✅ Staged: ${staged.length} files`);
        result.push(`   ${formatFileList(staged)}`);
      }

      if (modified.length > 0) {
        result.push(`📝 Modified: ${modified.length} files`);
        result.push(`   ${formatFileList(modified)}`);
      }

      if (deleted.length > 0) {
        result.push(`🗑️ Deleted: ${deleted.length} files`);
        result.push(`   ${formatFileList(deleted)}`);
      }

      if (untracked.length > 0) {
        result.push(`❓ Untracked: ${untracked.length} files`);
        result.push(`   ${formatFileList(untracked)}`);
      }

      const filtered = result.join("\n");
      return { filtered, rawChars, filteredChars: filtered.length };
    },
  };
}
