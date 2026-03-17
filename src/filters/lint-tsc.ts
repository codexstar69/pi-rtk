/**
 * Lint filter for TypeScript — handles `tsc` / `bunx tsc` output.
 *
 * Groups errors by TS error code, caps at 5 instances per code,
 * strips "Did you mean" / suggestion lines, includes total summary.
 *
 * Output format:
 *   TS2322 (N errors):
 *     file.ts:10 — Type 'string' is not assignable...
 *     file.ts:20 — Type 'number' is not assignable...
 *     ... and 3 more
 *
 *   TS2304 (N errors):
 *     file.ts:5 — Cannot find name 'foo'
 *
 *   ✗ 42 errors (6 codes)
 */

import type { Filter, FilterResult } from "./index.js";

/** Strip ANSI escape sequences. */
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

const MAX_PER_CODE = 5;

interface TscError {
  file: string;
  line: string;
  code: string;
  message: string;
}

/**
 * Parse tsc output lines into structured errors.
 * TSC format: "file.ts(10,5): error TS2322: Type ..."
 * or:         "file.ts:10:5 - error TS2322: Type ..."
 */
function parseTscErrors(raw: string): TscError[] {
  const lines = strip(raw).split("\n");
  const errors: TscError[] = [];

  for (const line of lines) {
    // Skip suggestion / "Did you mean" / help lines
    if (isSuggestionLine(line)) continue;

    // Format 1: file.ts(line,col): error TS1234: message
    const m1 = line.match(/^(.+?)\((\d+),\d+\):\s*error\s+(TS\d+):\s*(.+)/);
    if (m1) {
      errors.push({ file: m1[1], line: m1[2], code: m1[3], message: m1[4].trim() });
      continue;
    }

    // Format 2: file.ts:line:col - error TS1234: message
    const m2 = line.match(/^(.+?):(\d+):\d+\s*-\s*error\s+(TS\d+):\s*(.+)/);
    if (m2) {
      errors.push({ file: m2[1], line: m2[2], code: m2[3], message: m2[4].trim() });
      continue;
    }
  }

  return errors;
}

/** Check if a line is a suggestion / "Did you mean" hint. */
function isSuggestionLine(line: string): boolean {
  const trimmed = line.trim();
  return /Did you mean/i.test(trimmed)
    || /^help:/i.test(trimmed);
}

/** Group errors by code and format output. */
function formatGrouped(errors: TscError[]): string {
  if (errors.length === 0) return "";

  // Group by code
  const groups = new Map<string, TscError[]>();
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

    const shown = list.slice(0, MAX_PER_CODE);
    for (const err of shown) {
      parts.push(`  ${err.file}:${err.line} — ${err.message}`);
    }

    const remaining = list.length - MAX_PER_CODE;
    if (remaining > 0) {
      parts.push(`  ... and ${remaining} more`);
    }

    parts.push("");
  }

  // Total summary
  const codeCount = groups.size;
  parts.push(`✗ ${errors.length} ${errors.length === 1 ? "error" : "errors"} (${codeCount} ${codeCount === 1 ? "code" : "codes"})`);

  return parts.join("\n");
}

export function createLintTscFilter(): Filter {
  return {
    name: "lint-tsc",

    matches(command: string): boolean {
      return /^(bunx|npx)\s+tsc\b/.test(command) || /^tsc\b/.test(command);
    },

    apply(_command: string, raw: string): FilterResult {
      const rawChars = raw.length;
      const clean = strip(raw);

      // Check if clean output (no errors)
      if (clean.trim() === "" || /^Found 0 errors/.test(clean.trim())) {
        const filtered = clean.trim() || "✓ tsc: no errors";
        return { filtered, rawChars, filteredChars: filtered.length };
      }

      const errors = parseTscErrors(raw);

      // If no errors parsed but output exists, pass through a cleaned version
      if (errors.length === 0) {
        // Strip suggestion lines even if we didn't parse structured errors
        const lines = clean.split("\n").filter((l) => !isSuggestionLine(l));
        const filtered = lines.join("\n").trim();
        return { filtered, rawChars, filteredChars: filtered.length };
      }

      const filtered = formatGrouped(errors);
      return { filtered, rawChars, filteredChars: filtered.length };
    },
  };
}
