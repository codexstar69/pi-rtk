/**
 * Test runner filter for Python — handles pytest output.
 *
 * All-pass:
 *   ✓ N tests passed (duration)
 *
 * Failures:
 *   ✗ N passed, N failed, N skipped (duration)
 *
 *   FAILED:
 *     {test name} — {first error line}  ({file:line})
 */

import type { Filter, FilterResult } from "./index.js";

/** Strip ANSI escape sequences. */
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

interface ParsedResult {
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
  warnings: number;
  duration: string;
  failures: { name: string; error: string; fileLine: string }[];
}

/**
 * Extract the first file:line from a traceback block.
 * Pytest format: "file.py:42: AssertionError" or "    file.py:42: in <func>"
 */
function extractFileLine(lines: string[]): string {
  for (const line of lines) {
    // pytest short format: "test_foo.py:10: AssertionError"
    const m = line.match(/^\s*(\S+\.py):(\d+):/);
    if (m && !m[1].includes("site-packages")) {
      return `${m[1]}:${m[2]}`;
    }
  }
  return "";
}

function parsePytest(raw: string): ParsedResult {
  const lines = strip(raw).split("\n");
  const result: ParsedResult = {
    passed: 0, failed: 0, skipped: 0, errors: 0, warnings: 0,
    duration: "", failures: [],
  };

  // Parse the summary line:
  // "= 10 passed in 1.23s =" or "= 2 failed, 8 passed, 1 skipped in 2.45s ="
  // Also handles: "1 error", "1 warning"
  for (const line of lines) {
    const summaryMatch = line.match(/=+\s+(.*?)\s+in\s+([\d.]+s)\s*=+/);
    if (summaryMatch) {
      result.duration = summaryMatch[2];
      const parts = summaryMatch[1];

      const passedMatch = parts.match(/(\d+)\s+passed/);
      if (passedMatch) result.passed = parseInt(passedMatch[1], 10);

      const failedMatch = parts.match(/(\d+)\s+failed/);
      if (failedMatch) result.failed = parseInt(failedMatch[1], 10);

      const skippedMatch = parts.match(/(\d+)\s+skipped/);
      if (skippedMatch) result.skipped = parseInt(skippedMatch[1], 10);

      const errorMatch = parts.match(/(\d+)\s+error/);
      if (errorMatch) result.errors = parseInt(errorMatch[1], 10);

      const warningMatch = parts.match(/(\d+)\s+warning/);
      if (warningMatch) result.warnings = parseInt(warningMatch[1], 10);

      continue;
    }
  }

  // Parse FAILURES section
  if (result.failed > 0 || result.errors > 0) {
    let inFailure = false;
    let currentTest = "";
    let errorLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // "_ test_name _" or "FAILED test_file.py::test_name"
      const failHeader = line.match(/^_{2,}\s+(.+?)\s+_{2,}$/);
      if (failHeader) {
        // Save previous failure if any
        if (currentTest && inFailure) {
          pushFailure(result, currentTest, errorLines);
        }
        currentTest = failHeader[1];
        errorLines = [];
        inFailure = true;
        continue;
      }

      // Short test summary: "FAILED test_file.py::TestClass::test_name - reason"
      const shortFail = line.match(/^FAILED\s+(\S+)\s*(?:-\s*(.*))?$/);
      if (shortFail) {
        const name = shortFail[1].replace(/::/g, ".").replace(/\.py\./, "::");
        const error = shortFail[2] || "";
        // Only add if we haven't already captured this test from full section
        const exists = result.failures.some((f) =>
          f.name === name || name.endsWith(f.name) || f.name.endsWith(name.split("::").pop() || "")
        );
        if (!exists) {
          result.failures.push({ name, error: error.slice(0, 120), fileLine: "" });
        }
        continue;
      }

      if (inFailure) {
        // End of failure section
        if (/^={2,}/.test(line) || /^_{2,}\s+\S/.test(line)) {
          if (currentTest) {
            pushFailure(result, currentTest, errorLines);
          }
          currentTest = "";
          errorLines = [];
          inFailure = false;

          // Check if this starts a new test
          const nextHeader = line.match(/^_{2,}\s+(.+?)\s+_{2,}$/);
          if (nextHeader) {
            currentTest = nextHeader[1];
            inFailure = true;
          }
          continue;
        }
        errorLines.push(line);
      }
    }

    // Don't forget the last failure
    if (currentTest && inFailure) {
      pushFailure(result, currentTest, errorLines);
    }
  }

  return result;
}

function pushFailure(
  result: ParsedResult,
  testName: string,
  errorLines: string[],
): void {
  // Find first error line (assertion, raise, etc.)
  const firstError = errorLines.find((l) =>
    /assert|Error|raise|expect|fail/i.test(l)
  ) || errorLines.find((l) => l.trim().startsWith(">")) || "";

  const fileLine = extractFileLine(errorLines);

  result.failures.push({
    name: testName.trim(),
    error: firstError.trim().slice(0, 120),
    fileLine,
  });
}

function formatResult(result: ParsedResult): string {
  const duration = result.duration ? ` (${result.duration})` : "";

  if (result.failed === 0 && result.errors === 0) {
    // All pass: single summary line
    return `✓ ${result.passed} tests passed${duration}`;
  }

  // Has failures
  const parts: string[] = [];
  const summary = [`${result.passed} passed`, `${result.failed} failed`];
  if (result.skipped > 0) summary.push(`${result.skipped} skipped`);
  if (result.errors > 0) summary.push(`${result.errors} errors`);

  parts.push(`✗ ${summary.join(", ")}${duration}`);
  parts.push("");
  parts.push("FAILED:");

  for (const f of result.failures) {
    const loc = f.fileLine ? `  (${f.fileLine})` : "";
    const error = f.error ? ` — ${f.error}` : "";
    parts.push(`  ${f.name}${error}${loc}`);
  }

  return parts.join("\n");
}

export function createTestPyFilter(): Filter {
  return {
    name: "test-py",

    matches(command: string): boolean {
      return /^pytest\b/.test(command)
        || /^python3?\s+-m\s+pytest\b/.test(command);
    },

    apply(_command: string, raw: string): FilterResult {
      const rawChars = raw.length;
      const result = parsePytest(raw);
      const filtered = formatResult(result);
      return { filtered, rawChars, filteredChars: filtered.length };
    },
  };
}
