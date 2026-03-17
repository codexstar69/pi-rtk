/**
 * Grep / ripgrep filter — groups results by file, caps matches per file,
 * deduplicates identical match lines across files, and appends summary.
 *
 * Output format:
 *   file.ts:
 *     10: match line text
 *     25: another match
 *     ... 3 more matches
 *
 *   other.ts:
 *     5: match here
 *
 *   {N} matches in {N} files
 */

import type { Filter, FilterResult } from "./index.js";

/** Strip ANSI escape sequences. */
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, ""); // OSC 8 hyperlinks
}

const MAX_MATCHES_PER_FILE = 5;
const MAX_FILES = 20;

interface GrepMatch {
  file: string;
  line: string;  // line number as string, may be empty
  text: string;  // the matched line text
}

/**
 * Parse grep/rg output into structured matches.
 *
 * Handles multiple formats:
 *   file:line:text           (rg / grep -n)
 *   file:line:col:text       (rg --vimgrep)
 *   file:text                (grep -r without -n)
 *   line:text                (grep -n on single file)
 */
function parseMatches(raw: string): GrepMatch[] {
  const lines = strip(raw).split("\n");
  const matches: GrepMatch[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip context separators (rg -C uses "--" between groups)
    if (trimmed === "--") continue;

    // Skip context lines (rg uses file-linenum- for context, : for match)
    // Context lines have - as separator after linenum: file.ts-11-context
    // We only want actual match lines with : separators

    // Try file:line:col:text (vimgrep format)
    const vimgrep = trimmed.match(/^(.+?):(\d+):\d+:(.+)$/);
    if (vimgrep) {
      matches.push({ file: vimgrep[1], line: vimgrep[2], text: vimgrep[3].trim() });
      continue;
    }

    // Try file:line:text (standard rg/grep -n)
    const standard = trimmed.match(/^(.+?):(\d+):(.+)$/);
    if (standard) {
      matches.push({ file: standard[1], line: standard[2], text: standard[3].trim() });
      continue;
    }

    // Try line:text (single-file grep -n, no filename)
    const singleFile = trimmed.match(/^(\d+):(.+)$/);
    if (singleFile) {
      matches.push({ file: "", line: singleFile[1], text: singleFile[2].trim() });
      continue;
    }

    // Try file:text (grep -r without line numbers)
    // Guard: the "file" part must look like a path (contains / or .)
    // to avoid false positives like "Error: something" or "Warning: text"
    const noLineNum = trimmed.match(/^(.+?):(.+)$/);
    if (noLineNum && !noLineNum[1].match(/^\d+$/) && /[/.]/.test(noLineNum[1])) {
      matches.push({ file: noLineNum[1], line: "", text: noLineNum[2].trim() });
      continue;
    }
  }

  return matches;
}

/**
 * Deduplicate identical match text across files.
 * Returns a map: text → list of {file, line} where it appears.
 * Lines appearing in 3+ files are flagged for deduplication.
 */
function findDuplicates(matches: GrepMatch[]): Map<string, Array<{ file: string; line: string }>> {
  const textToLocations = new Map<string, Array<{ file: string; line: string }>>();

  for (const m of matches) {
    const locs = textToLocations.get(m.text) || [];
    // Only count unique files
    if (!locs.some((l) => l.file === m.file)) {
      locs.push({ file: m.file, line: m.line });
    }
    textToLocations.set(m.text, locs);
  }

  return textToLocations;
}

export function createGrepFilter(): Filter {
  return {
    name: "grep",

    matches(command: string): boolean {
      // Match rg or grep at command start, but NOT "git grep"
      return /^(rg|grep)\b/.test(command);
    },

    apply(_command: string, raw: string): FilterResult {
      const rawChars = raw.length;

      const allMatches = parseMatches(raw);

      if (allMatches.length === 0) {
        return { filtered: "", rawChars, filteredChars: 0 };
      }

      // Count totals before any filtering
      const totalMatches = allMatches.length;
      const allFiles = new Set(allMatches.map((m) => m.file));
      const totalFiles = allFiles.size;

      // Find duplicate texts across files
      const textLocations = findDuplicates(allMatches);
      const dupTexts = new Set<string>();
      for (const [text, locs] of textLocations) {
        if (locs.length >= 3) {
          dupTexts.add(text);
        }
      }

      // Group matches by file (preserving order of first appearance)
      const fileOrder: string[] = [];
      const fileMatches = new Map<string, GrepMatch[]>();

      for (const m of allMatches) {
        if (!fileMatches.has(m.file)) {
          fileOrder.push(m.file);
          fileMatches.set(m.file, []);
        }
        fileMatches.get(m.file)!.push(m);
      }

      const parts: string[] = [];
      let filesShown = 0;

      // Track which dup texts we've already displayed
      const shownDupTexts = new Set<string>();

      for (const file of fileOrder) {
        if (filesShown >= MAX_FILES) break;
        filesShown++;

        const matches = fileMatches.get(file)!;

        // File header
        parts.push(`${file}:`);

        let shown = 0;
        for (const m of matches) {
          if (shown >= MAX_MATCHES_PER_FILE) break;

          // If this is a duplicate text and we've already shown it, skip
          if (dupTexts.has(m.text) && shownDupTexts.has(m.text)) {
            continue;
          }

          // Display the match
          if (m.line) {
            parts.push(`  ${m.line}: ${m.text}`);
          } else {
            parts.push(`  ${m.text}`);
          }

          // If this is a duplicate, note it and mark as shown
          if (dupTexts.has(m.text)) {
            const count = textLocations.get(m.text)!.length;
            parts[parts.length - 1] += ` (${count} files)`;
            shownDupTexts.add(m.text);
          }

          shown++;
        }

        // Overflow indicator for this file
        const overflow = matches.length - MAX_MATCHES_PER_FILE;
        if (overflow > 0) {
          parts.push(`  ... ${overflow} more matches`);
        }

        parts.push("");
      }

      // File overflow indicator
      const fileOverflow = fileOrder.length - MAX_FILES;
      if (fileOverflow > 0) {
        parts.push(`... ${fileOverflow} more files`);
        parts.push("");
      }

      // Summary line
      const matchWord = totalMatches === 1 ? "match" : "matches";
      const fileWord = totalFiles === 1 ? "file" : "files";
      parts.push(`${totalMatches} ${matchWord} in ${totalFiles} ${fileWord}`);

      const filtered = parts.join("\n").trimEnd();
      return { filtered, rawChars, filteredChars: filtered.length };
    },
  };
}
