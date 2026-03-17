/**
 * Test runner filter for JS/TS — handles bun test, vitest, jest output.
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

/**
 * Extract the first meaningful file:line from a stack trace block.
 * Looks for "at <something> (file:line:col)" or "at file:line:col" patterns,
 * preferring lines that reference project source (not node_modules or node: internals).
 */
function extractFirstFileLine(lines: string[]): string {
  for (const line of lines) {
    const m = line.match(/at\s+(?:.*?\s+\()?([^()]+?):(\d+):\d+\)?/);
    if (m && !m[1].includes("node_modules") && !m[1].startsWith("node:")) {
      return `${m[1]}:${m[2]}`;
    }
  }
  // Fallback: any "at" line that's not a node internal
  for (const line of lines) {
    const m = line.match(/at\s+(?:.*?\s+\()?([^()]+?):(\d+):\d+\)?/);
    if (m && !m[1].startsWith("node:")) return `${m[1]}:${m[2]}`;
  }
  return "";
}

/** Detect if this looks like bun test output (must check BEFORE vitest). */
function isBunTest(raw: string): boolean {
  return /^bun test\b/m.test(raw) || /\bRan \d+ tests across \d+ files\b/.test(raw);
}

/** Detect if this looks like vitest output. */
function isVitest(raw: string): boolean {
  // Check for vitest-specific summary format
  return /Test Files\s+\d+/.test(raw) || /\bRUN\b.*v\d+\.\d+/.test(raw);
}

/** Detect if this looks like jest output. */
function isJest(raw: string): boolean {
  return /Test Suites:\s+\d+/.test(raw);
}

interface ParsedResult {
  suites: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: string;
  failures: { name: string; error: string; fileLine: string }[];
}

function parseVitest(raw: string): ParsedResult {
  const lines = strip(raw).split("\n");
  const result: ParsedResult = {
    suites: 0, passed: 0, failed: 0, skipped: 0,
    duration: "", failures: [],
  };

  // Parse summary lines
  for (const line of lines) {
    // "Test Files  12 passed (12)" or "Test Files  2 failed | 10 passed (12)"
    const filesMatch = line.match(/Test Files\s+(?:(\d+)\s+failed\s*\|?\s*)?(\d+)\s+passed(?:\s*\|?\s*(\d+)\s+skipped)?\s*\((\d+)\)/);
    if (filesMatch) {
      result.suites = parseInt(filesMatch[4], 10);
      continue;
    }

    // "Tests  366 passed (366)" or "Tests  2 failed | 360 passed | 4 skipped (366)"
    const testsMatch = line.match(/Tests\s+(?:(\d+)\s+failed\s*\|?\s*)?(\d+)\s+passed(?:\s*\|?\s*(\d+)\s+skipped)?\s*\(\d+\)/);
    if (testsMatch) {
      result.failed = testsMatch[1] ? parseInt(testsMatch[1], 10) : 0;
      result.passed = parseInt(testsMatch[2], 10);
      result.skipped = testsMatch[3] ? parseInt(testsMatch[3], 10) : 0;
      continue;
    }

    // "Duration  526ms" or "Duration  1.23s"
    const durMatch = line.match(/Duration\s+([\d.]+\s*m?s)/);
    if (durMatch) {
      result.duration = durMatch[1].trim();
      continue;
    }
  }

  // If no suites found from Test Files line, count test file lines
  if (result.suites === 0) {
    const suiteLines = lines.filter((l) => /^\s*[✓✗×].*\.test\./.test(l) || /^\s*(PASS|FAIL)\s/.test(l));
    if (suiteLines.length > 0) result.suites = suiteLines.length;
  }

  // Parse failed tests
  if (result.failed > 0) {
    parseFailedTests(lines, result);
  }

  return result;
}

function parseJest(raw: string): ParsedResult {
  const lines = strip(raw).split("\n");
  const result: ParsedResult = {
    suites: 0, passed: 0, failed: 0, skipped: 0,
    duration: "", failures: [],
  };

  for (const line of lines) {
    // "Test Suites: 2 failed, 10 passed, 12 total"
    const suitesMatch = line.match(/Test Suites:\s+(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+passed,\s*)?(\d+)\s+total/);
    if (suitesMatch) {
      result.suites = parseInt(suitesMatch[3], 10);
      continue;
    }

    // "Tests: 3 failed, 360 passed, 4 skipped, 367 total"
    const testsMatch = line.match(/Tests:\s+(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+passed,\s*)?(?:(\d+)\s+skipped,\s*)?(\d+)\s+total/);
    if (testsMatch) {
      result.failed = testsMatch[1] ? parseInt(testsMatch[1], 10) : 0;
      result.passed = testsMatch[2] ? parseInt(testsMatch[2], 10) : 0;
      result.skipped = testsMatch[3] ? parseInt(testsMatch[3], 10) : 0;
      continue;
    }

    // "Time: 3.456 s"
    const timeMatch = line.match(/Time:\s+([\d.]+\s*s)/);
    if (timeMatch) {
      result.duration = timeMatch[1].trim();
      continue;
    }
  }

  // Parse failed tests
  if (result.failed > 0) {
    parseFailedTests(lines, result);
  }

  return result;
}

function parseBunTest(raw: string): ParsedResult {
  const lines = strip(raw).split("\n");
  const result: ParsedResult = {
    suites: 0, passed: 0, failed: 0, skipped: 0,
    duration: "", failures: [],
  };

  // Count pass/fail from individual test lines
  for (const line of lines) {
    // "✓ test name [0.12ms]" or "(pass) test name"
    if (/^\s*(✓|\(pass\))/.test(line)) {
      result.passed++;
      continue;
    }
    // "✗ test name" or "(fail) test name"
    if (/^\s*(✗|×|\(fail\))/.test(line)) {
      result.failed++;
      continue;
    }
    // "- test name [skipped]" or "(skip) test name"
    if (/^\s*(-\s|\(skip\))/.test(line) && /skip/i.test(line)) {
      result.skipped++;
      continue;
    }
  }

  // Bun summary: "12 pass\n2 fail" or "366 pass"
  for (const line of lines) {
    const passMatch = line.match(/^(\d+)\s+pass/);
    if (passMatch) {
      result.passed = parseInt(passMatch[1], 10);
      continue;
    }
    const failMatch = line.match(/^(\d+)\s+fail/);
    if (failMatch) {
      result.failed = parseInt(failMatch[1], 10);
      continue;
    }
    const skipMatch = line.match(/^(\d+)\s+skip/);
    if (skipMatch) {
      result.skipped = parseInt(skipMatch[1], 10);
      continue;
    }
  }

  // Count suites from file headers
  const suiteLines = lines.filter((l) => /^\s*(✓|✗|×|PASS|FAIL)\s+.*\.(test|spec)\./.test(l));
  result.suites = suiteLines.length || 1;

  // Duration from bun: "Ran 12 tests across 4 files. [520.00ms]"
  for (const line of lines) {
    const durMatch = line.match(/\[([\d.]+\s*m?s)\]/);
    if (durMatch) {
      result.duration = durMatch[1].trim();
    }
  }

  // Parse failed tests
  if (result.failed > 0) {
    parseFailedTests(lines, result);
  }

  return result;
}

/**
 * Common failed test parser that works across runners.
 * Looks for "FAIL" sections, "●" (jest), "✗"/"×" (vitest/bun) markers,
 * or "AssertionError" / "Error:" patterns.
 */
function parseFailedTests(
  lines: string[],
  result: ParsedResult,
): void {
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Vitest/bun: "✗ test name" or "× test name" or "FAIL test name"
    // Jest: "● test name" or "✕ test name"
    const failMarker = line.match(/^\s*(?:[✗×✕●]|FAIL)\s+(.+)/);
    if (failMarker) {
      const testName = failMarker[1].replace(/\s*\[.*?\]\s*$/, "").trim();
      // Collect lines until next test/blank section to find error
      const errorLines: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        // Stop at next test marker or summary section
        if (/^\s*(?:[✓✗×✕●]|PASS|FAIL|Tests|Test Files|Test Suites)\s/.test(next)) break;
        if (next.trim() === "" && errorLines.length > 0) break;
        if (next.trim() !== "") errorLines.push(next);
        j++;
      }

      const firstError = errorLines.find((l) =>
        /Error|assert|expect|fail/i.test(l)
      ) || errorLines[0] || "";

      const fileLine = extractFirstFileLine(errorLines);

      if (testName) {
        result.failures.push({
          name: testName,
          error: firstError.trim().slice(0, 120),
          fileLine,
        });
      }
      i = j;
      continue;
    }

    // Also detect "AssertionError:" blocks that are part of failure output
    if (/AssertionError|Error:|expected.*received|expect\(/i.test(line)) {
      // Already handled above via markers, skip
    }

    i++;
  }
}

function formatResult(result: ParsedResult): string {
  const duration = result.duration ? ` (${result.duration})` : "";
  const suites = result.suites || 1;

  if (result.failed === 0) {
    // All pass: single summary line
    return `✓ ${suites} suites, ${result.passed} tests passed${duration}`;
  }

  // Has failures
  const parts: string[] = [];
  const summary = [
    `${result.passed} passed`,
    `${result.failed} failed`,
  ];
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

export function createTestJsFilter(): Filter {
  return {
    name: "test-js",

    matches(command: string): boolean {
      return /^(bunx|npx)\s+(vitest|jest)\b/.test(command)
        || /^(vitest|jest)\b/.test(command)
        || /^(bun|npm|pnpm|yarn)\s+(test|run\s+test)\b/.test(command);
    },

    apply(command: string, raw: string): FilterResult {
      const rawChars = raw.length;
      const clean = strip(raw);

      let result: ParsedResult;

      if (isBunTest(clean)) {
        result = parseBunTest(clean);
      } else if (isVitest(clean)) {
        result = parseVitest(clean);
      } else if (isJest(clean)) {
        result = parseJest(clean);
      } else {
        // Default: try vitest format first (most common), then bun
        result = parseVitest(clean);
        if (result.passed === 0 && result.failed === 0) {
          result = parseBunTest(clean);
        }
      }

      const filtered = formatResult(result);
      return { filtered, rawChars, filteredChars: filtered.length };
    },
  };
}
