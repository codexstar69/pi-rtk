/**
 * Lint filter for Python — handles ruff output.
 *
 * Groups errors by rule code, caps at 5 instances per code,
 * strips "Did you mean" / "help:" suggestions, includes total summary.
 *
 * Output format:
 *   F401 (N errors):
 *     file.py:10:1 — `os` imported but unused
 *     file.py:20:1 — `sys` imported but unused
 *     ... and 3 more
 *
 *   E501 (N errors):
 *     file.py:5:1 — Line too long (120 > 88)
 *
 *   ✗ 42 errors (6 rules)
 */

import type { Filter, FilterResult } from "./index.js";

/** Strip ANSI escape sequences. */
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

const MAX_PER_RULE = 5;

interface RuffError {
  file: string;
  line: string;
  col: string;
  code: string;
  message: string;
}

/** Check if a line is a suggestion / "Did you mean" / "help:" hint. */
function isSuggestionLine(line: string): boolean {
  const trimmed = line.trim();
  return /Did you mean/i.test(trimmed)
    || /^help:/i.test(trimmed);
}

/**
 * Parse ruff output into structured errors.
 *
 * Ruff format:
 *   file.py:10:1: F401 `os` imported but unused
 *   file.py:20:5: E501 Line too long (120 > 88)
 *
 * Also supports ruff check --output-format=text (same format).
 */
function parseRuffErrors(raw: string): RuffError[] {
  const lines = strip(raw).split("\n");
  const errors: RuffError[] = [];

  for (const line of lines) {
    // Skip suggestion lines
    if (isSuggestionLine(line)) continue;

    // Ruff: "file.py:line:col: CODE message"
    const m = line.match(/^(.+?):(\d+):(\d+):\s+([A-Z]\w*\d+)\s+(.+)/);
    if (m) {
      errors.push({
        file: m[1],
        line: m[2],
        col: m[3],
        code: m[4],
        message: m[5].trim(),
      });
      continue;
    }
  }

  return errors;
}

/** Group errors by code and format output. */
function formatGrouped(errors: RuffError[]): string {
  if (errors.length === 0) return "";

  const groups = new Map<string, RuffError[]>();
  for (const err of errors) {
    const list = groups.get(err.code) || [];
    list.push(err);
    groups.set(err.code, list);
  }

  const parts: string[] = [];

  // Sort codes by count descending, then alphabetically
  const sortedCodes = [...groups.keys()].sort((a, b) => {
    const diff = (groups.get(b)?.length ?? 0) - (groups.get(a)?.length ?? 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  for (const code of sortedCodes) {
    const list = groups.get(code)!;
    parts.push(`${code} (${list.length} ${list.length === 1 ? "error" : "errors"}):`);

    const shown = list.slice(0, MAX_PER_RULE);
    for (const err of shown) {
      parts.push(`  ${err.file}:${err.line}:${err.col} — ${err.message}`);
    }

    const remaining = list.length - MAX_PER_RULE;
    if (remaining > 0) {
      parts.push(`  ... and ${remaining} more`);
    }

    parts.push("");
  }

  // Total summary
  const codeCount = groups.size;
  parts.push(`✗ ${errors.length} ${errors.length === 1 ? "error" : "errors"} (${codeCount} ${codeCount === 1 ? "rule" : "rules"})`);

  return parts.join("\n");
}

export function createLintPyFilter(): Filter {
  return {
    name: "lint-py",

    matches(command: string): boolean {
      return /^ruff\b/.test(command);
    },

    apply(_command: string, raw: string): FilterResult {
      const rawChars = raw.length;
      const clean = strip(raw);

      // Check if clean output (no errors)
      if (clean.trim() === "" || /^All checks passed/.test(clean.trim()) || /^Found 0 errors/.test(clean.trim())) {
        const filtered = clean.trim() || "✓ ruff: no errors";
        return { filtered, rawChars, filteredChars: filtered.length };
      }

      const errors = parseRuffErrors(raw);

      // If no errors parsed but output exists, pass through cleaned version
      if (errors.length === 0) {
        const lines = clean.split("\n").filter((l) => !isSuggestionLine(l));
        const filtered = lines.join("\n").trim();
        return { filtered, rawChars, filteredChars: filtered.length };
      }

      const filtered = formatGrouped(errors);
      return { filtered, rawChars, filteredChars: filtered.length };
    },
  };
}
