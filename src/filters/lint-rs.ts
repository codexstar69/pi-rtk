/**
 * Lint filter for Rust — handles `cargo clippy` and `cargo build` output.
 *
 * Groups warnings/errors by lint name, caps at 5 instances per lint,
 * strips "help:" suggestions, includes total summary.
 *
 * Output format:
 *   clippy::needless_return (N warnings):
 *     src/main.rs:10:5 — unneeded `return` statement
 *     src/lib.rs:20:9 — unneeded `return` statement
 *     ... and 3 more
 *
 *   clippy::unused_imports (N warnings):
 *     src/main.rs:1:5 — unused import: `std::io`
 *
 *   ✗ 42 warnings (6 lints)
 */

import type { Filter, FilterResult } from "./index.js";

/** Strip ANSI escape sequences. */
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

const MAX_PER_LINT = 5;

interface ClippyError {
  file: string;
  line: string;
  col: string;
  level: string;
  message: string;
  lint: string;
}

/** Check if a line is a suggestion / "help:" hint or "Did you mean" line. */
function isSuggestionLine(line: string): boolean {
  const trimmed = line.trim();
  return /^help:/i.test(trimmed)
    || /Did you mean/i.test(trimmed);
}

/**
 * Parse cargo clippy / cargo build output into structured errors.
 *
 * Clippy/rustc format:
 *   warning: unneeded `return` statement
 *     --> src/main.rs:10:5
 *     |
 *   10 |     return x;
 *     |     ^^^^^^^^^
 *     |
 *     = help: remove `return`
 *     = note: `#[warn(clippy::needless_return)]` on by default
 *
 *   error[E0425]: cannot find value `x` in this scope
 *     --> src/main.rs:20:9
 *
 * Also handles the summary line:
 *   warning: `project` (bin "project") generated 5 warnings
 *   error: could not compile `project` due to 3 errors
 */
function parseClippyErrors(raw: string): ClippyError[] {
  const lines = strip(raw).split("\n");
  const errors: ClippyError[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Skip suggestion / help lines
    if (isSuggestionLine(line)) {
      i++;
      continue;
    }

    // Match: "warning: message" or "error: message" or "error[E0425]: message"
    const headerMatch = line.match(/^(warning|error)(?:\[([A-Z]\d+)\])?:\s+(.+)/);
    if (headerMatch) {
      const level = headerMatch[1];
      const errorCode = headerMatch[2] || "";
      const message = headerMatch[3].trim();

      // Skip summary lines like "generated N warnings" or "could not compile"
      if (/generated \d+ warning/.test(message) || /could not compile/.test(message) || /aborting due to/.test(message)) {
        i++;
        continue;
      }

      // Look for location on next lines: "  --> file:line:col"
      let file = "";
      let lineNum = "";
      let col = "";
      let j = i + 1;
      while (j < lines.length && j < i + 5) {
        const locMatch = lines[j].match(/^\s*-->\s+(.+?):(\d+):(\d+)/);
        if (locMatch) {
          file = locMatch[1];
          lineNum = locMatch[2];
          col = locMatch[3];
          break;
        }
        j++;
      }

      // Look for lint name in "= note: `#[warn(clippy::lint_name)]`" or `#[deny(...)]`
      let lint = errorCode || "unknown";
      let k = i + 1;
      while (k < lines.length && k < i + 30) {
        const noteMatch = lines[k].match(/=\s+note:\s+`#\[(?:warn|deny|forbid|allow)\((.+?)\)\]`/);
        if (noteMatch) {
          lint = noteMatch[1];
          break;
        }
        // Also check for "for more information about this error" — stop searching
        if (/for more information/.test(lines[k])) break;
        // Stop at next warning/error header
        if (/^(warning|error)(\[|:)/.test(lines[k])) break;
        k++;
      }

      if (file) {
        errors.push({ file, line: lineNum, col, level, message, lint });
      }

      i++;
      continue;
    }

    i++;
  }

  return errors;
}

/** Group errors by lint name and format output. */
function formatGrouped(errors: ClippyError[]): string {
  if (errors.length === 0) return "";

  const groups = new Map<string, ClippyError[]>();
  for (const err of errors) {
    const list = groups.get(err.lint) || [];
    list.push(err);
    groups.set(err.lint, list);
  }

  const parts: string[] = [];

  // Sort lints by count descending, then alphabetically
  const sortedLints = [...groups.keys()].sort((a, b) => {
    const diff = (groups.get(b)?.length ?? 0) - (groups.get(a)?.length ?? 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  for (const lint of sortedLints) {
    const list = groups.get(lint)!;
    // Use the most common level for the label
    const levels = list.map((e) => e.level);
    const label = levels.includes("error") ? "errors" : "warnings";
    const singular = levels.includes("error") ? "error" : "warning";
    parts.push(`${lint} (${list.length} ${list.length === 1 ? singular : label}):`);

    const shown = list.slice(0, MAX_PER_LINT);
    for (const err of shown) {
      parts.push(`  ${err.file}:${err.line}:${err.col} — ${err.message}`);
    }

    const remaining = list.length - MAX_PER_LINT;
    if (remaining > 0) {
      parts.push(`  ... and ${remaining} more`);
    }

    parts.push("");
  }

  // Total summary — use "warnings" if all warnings, "errors" if any errors
  const hasErrors = errors.some((e) => e.level === "error");
  const totalLabel = hasErrors ? "errors" : "warnings";
  const lintCount = groups.size;
  parts.push(`✗ ${errors.length} ${totalLabel} (${lintCount} ${lintCount === 1 ? "lint" : "lints"})`);

  return parts.join("\n");
}

export function createLintRsFilter(): Filter {
  return {
    name: "lint-rs",

    matches(command: string): boolean {
      return /^cargo\s+(clippy|build)\b/.test(command);
    },

    apply(_command: string, raw: string): FilterResult {
      const rawChars = raw.length;
      const clean = strip(raw);

      // Check if clean output (no warnings/errors)
      if (clean.trim() === "" || /^Compiling/.test(clean.trim()) && !/^(warning|error)/m.test(clean)) {
        const filtered = "✓ clippy: no warnings";
        return { filtered, rawChars, filteredChars: filtered.length };
      }

      // If only Finished/Compiling lines and no warnings/errors
      const hasIssues = /^(warning|error)(\[|:)/m.test(clean);
      if (!hasIssues) {
        // Clean output — may be just build status
        const filtered = clean.trim();
        return { filtered, rawChars, filteredChars: filtered.length };
      }

      const errors = parseClippyErrors(raw);

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
