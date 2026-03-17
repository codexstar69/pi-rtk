/**
 * Lint filter for JS/TS linters — handles eslint and biome output.
 *
 * Groups errors by rule name, caps at 5 instances per rule,
 * strips "Did you mean" / suggestion lines, includes total summary.
 *
 * Output format:
 *   no-unused-vars (N errors):
 *     file.ts:10:5 — 'foo' is defined but never used.
 *     file.ts:20:3 — 'bar' is defined but never used.
 *     ... and 3 more
 *
 *   @typescript-eslint/no-explicit-any (N errors):
 *     file.ts:5:1 — Unexpected any.
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

interface LintError {
  file: string;
  line: string;
  col: string;
  message: string;
  rule: string;
}

/** Check if a line is a suggestion / "Did you mean" hint. */
function isSuggestionLine(line: string): boolean {
  const trimmed = line.trim();
  return /Did you mean/i.test(trimmed)
    || /^help:/i.test(trimmed);
}

/**
 * Parse eslint/biome output into structured errors.
 *
 * ESLint format:
 *   /path/to/file.ts
 *     10:5  error  'foo' is defined but never used  no-unused-vars
 *     20:3  warning  bar is ...                      some-rule
 *
 * Biome format:
 *   file.ts:10:5 lint/suspicious/noExplicitAny ━━━━━━━━━━━━━
 *     ✖ message text
 *
 * Also handles "file.ts(line,col): error RULE: message" style.
 */
function parseLintErrors(raw: string): LintError[] {
  const lines = strip(raw).split("\n");
  const errors: LintError[] = [];
  let currentFile = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip suggestion lines
    if (isSuggestionLine(line)) continue;

    // ESLint: file header line (absolute or relative path, no leading whitespace)
    // Detect file path: starts with / or ./ or letter:\ and doesn't look like an error line
    if (/^[/.]/.test(line) && !line.includes("  error  ") && !line.includes("  warning  ") && !line.match(/:\d+:\d+\s/) && !line.includes("━")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("✖") && !trimmed.startsWith("×")) {
        currentFile = trimmed;
        continue;
      }
    }

    // ESLint error line: "  10:5  error  message  rule-name"
    const eslintMatch = line.match(/^\s+(\d+):(\d+)\s+(?:error|warning)\s+(.+?)\s{2,}([\w@/.-]+)\s*$/);
    if (eslintMatch && currentFile) {
      errors.push({
        file: currentFile,
        line: eslintMatch[1],
        col: eslintMatch[2],
        message: eslintMatch[3].trim(),
        rule: eslintMatch[4],
      });
      continue;
    }

    // Biome format: "file.ts:line:col lint/category/rule ━━━"
    const biomeMatch = line.match(/^(.+?):(\d+):(\d+)\s+([\w/.-]+)\s*━/);
    if (biomeMatch) {
      // Next line might have the error message with ✖
      const msgLine = i + 1 < lines.length ? lines[i + 1] : "";
      const msgMatch = msgLine.match(/^\s*[✖×]\s+(.+)/);
      const message = msgMatch ? msgMatch[1].trim() : "";
      errors.push({
        file: biomeMatch[1],
        line: biomeMatch[2],
        col: biomeMatch[3],
        message,
        rule: biomeMatch[4],
      });
      continue;
    }

    // Generic format: "file.ts(line,col): error RULE: message"
    const genericMatch = line.match(/^(.+?)\((\d+),(\d+)\):\s*(?:error|warning)\s+([\w@/.-]+):\s*(.+)/);
    if (genericMatch) {
      errors.push({
        file: genericMatch[1],
        line: genericMatch[2],
        col: genericMatch[3],
        message: genericMatch[5].trim(),
        rule: genericMatch[4],
      });
      continue;
    }
  }

  return errors;
}

/** Group errors by rule and format output. */
function formatGrouped(errors: LintError[]): string {
  if (errors.length === 0) return "";

  const groups = new Map<string, LintError[]>();
  for (const err of errors) {
    const list = groups.get(err.rule) || [];
    list.push(err);
    groups.set(err.rule, list);
  }

  const parts: string[] = [];

  // Sort rules by count descending, then alphabetically
  const sortedRules = [...groups.keys()].sort((a, b) => {
    const diff = (groups.get(b)?.length ?? 0) - (groups.get(a)?.length ?? 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  for (const rule of sortedRules) {
    const list = groups.get(rule)!;
    parts.push(`${rule} (${list.length} ${list.length === 1 ? "error" : "errors"}):`);

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
  const ruleCount = groups.size;
  parts.push(`✗ ${errors.length} ${errors.length === 1 ? "error" : "errors"} (${ruleCount} ${ruleCount === 1 ? "rule" : "rules"})`);

  return parts.join("\n");
}

export function createLintJsFilter(): Filter {
  return {
    name: "lint-js",

    matches(command: string): boolean {
      return /^(eslint|biome)\b/.test(command);
    },

    apply(_command: string, raw: string): FilterResult {
      const rawChars = raw.length;
      const clean = strip(raw);

      // Check if clean output (no errors)
      if (clean.trim() === "" || /^✔ No (issues|errors|warnings)/.test(clean.trim()) || /^All checks passed/.test(clean.trim())) {
        const filtered = clean.trim() || "✓ lint: no errors";
        return { filtered, rawChars, filteredChars: filtered.length };
      }

      const errors = parseLintErrors(raw);

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
