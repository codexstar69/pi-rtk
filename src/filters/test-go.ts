/**
 * Test runner filter for Go — handles `go test` output.
 *
 * All-pass:
 *   ✓ N suites, N tests passed (duration)
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
  suites: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: string;
  failures: { name: string; error: string; fileLine: string }[];
}

/**
 * Extract file:line from Go test output.
 * Typical: "    file_test.go:42: error message"
 */
function extractFileLine(lines: string[]): string {
  for (const line of lines) {
    const m = line.match(/\s+(\S+_test\.go):(\d+):/);
    if (m) return `${m[1]}:${m[2]}`;
  }
  // Fallback: any .go file reference
  for (const line of lines) {
    const m = line.match(/\s+(\S+\.go):(\d+):/);
    if (m) return `${m[1]}:${m[2]}`;
  }
  return "";
}

function parseGoTest(raw: string): ParsedResult {
  const lines = strip(raw).split("\n");
  const result: ParsedResult = {
    suites: 0, passed: 0, failed: 0, skipped: 0,
    duration: "", failures: [],
  };

  const passedTests = new Set<string>();
  const failedTests = new Map<string, string[]>();
  const packages = new Set<string>();
  let currentFailed = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // "--- PASS: TestName (0.00s)"
    const passMatch = line.match(/^--- PASS:\s+(\S+)\s+\(([\d.]+s)\)/);
    if (passMatch) {
      passedTests.add(passMatch[1]);
      continue;
    }

    // "--- FAIL: TestName (0.00s)"
    const failMatch = line.match(/^--- FAIL:\s+(\S+)\s+\(([\d.]+s)\)/);
    if (failMatch) {
      if (currentFailed && !failedTests.has(currentFailed)) {
        failedTests.set(currentFailed, []);
      }
      currentFailed = failMatch[1];
      if (!failedTests.has(currentFailed)) {
        failedTests.set(currentFailed, []);
      }
      continue;
    }

    // "--- SKIP: TestName (0.00s)"
    const skipMatch = line.match(/^--- SKIP:\s+(\S+)/);
    if (skipMatch) {
      result.skipped++;
      continue;
    }

    // "=== RUN   TestName" — just track, don't count yet
    if (/^=== RUN\s+/.test(line)) continue;

    // "ok  	package/name	1.234s"
    const pkgOk = line.match(/^ok\s+(\S+)\s+([\d.]+s)/);
    if (pkgOk) {
      packages.add(pkgOk[1]);
      result.duration = pkgOk[2];
      continue;
    }

    // "FAIL	package/name	1.234s"
    const pkgFail = line.match(/^FAIL\s+(\S+)\s+([\d.]+s)/);
    if (pkgFail) {
      packages.add(pkgFail[1]);
      result.duration = pkgFail[2];
      continue;
    }

    // "PASS" (standalone — single-package run without explicit package name)
    if (line.trim() === "PASS") {
      packages.add("_default_");
      continue;
    }

    // Collect error lines for current failed test
    if (currentFailed && failedTests.has(currentFailed)) {
      // Stop collecting at next test marker
      if (/^(---|===|ok\s|FAIL\s|PASS)/.test(line)) {
        currentFailed = "";
      } else {
        failedTests.get(currentFailed)!.push(line);
      }
    }
  }

  result.passed = passedTests.size;
  result.failed = failedTests.size;
  result.suites = Math.max(packages.size, 1);

  // Build failure details
  for (const [name, errorLines] of failedTests) {
    const firstError = errorLines.find((l) =>
      /Error|assert|expect|fatal|panic|fail/i.test(l) || /\.go:\d+:/.test(l)
    ) || errorLines[0] || "";

    const fileLine = extractFileLine(errorLines);

    result.failures.push({
      name,
      error: firstError.trim().slice(0, 120),
      fileLine,
    });
  }

  return result;
}

function formatResult(result: ParsedResult): string {
  const duration = result.duration ? ` (${result.duration})` : "";
  const suites = result.suites || 1;

  if (result.failed === 0) {
    return `✓ ${suites} suites, ${result.passed} tests passed${duration}`;
  }

  const parts: string[] = [];
  const summary = [`${result.passed} passed`, `${result.failed} failed`];
  if (result.skipped > 0) summary.push(`${result.skipped} skipped`);

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

export function createTestGoFilter(): Filter {
  return {
    name: "test-go",

    matches(command: string): boolean {
      return /^go\s+test\b/.test(command);
    },

    apply(_command: string, raw: string): FilterResult {
      const rawChars = raw.length;
      const result = parseGoTest(raw);
      const filtered = formatResult(result);
      return { filtered, rawChars, filteredChars: filtered.length };
    },
  };
}
