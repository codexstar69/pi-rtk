/**
 * Test runner filter for Rust — handles `cargo test` output.
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
  ignored: number;
  duration: string;
  failures: { name: string; error: string; fileLine: string }[];
}

/**
 * Extract file:line from Rust test output.
 * Typical: "thread 'test_name' panicked at 'msg', src/lib.rs:42:10"
 * Or: "  --> src/lib.rs:42:10"
 */
function extractFileLine(lines: string[]): string {
  for (const line of lines) {
    // "panicked at 'msg', src/file.rs:42:10" or "panicked at src/file.rs:42:10:"
    const panicMatch = line.match(/panicked at (?:'[^']*',\s*)?(\S+\.rs):(\d+)/);
    if (panicMatch) return `${panicMatch[1]}:${panicMatch[2]}`;

    // "  --> src/file.rs:42:10"
    const arrowMatch = line.match(/-->\s+(\S+\.rs):(\d+)/);
    if (arrowMatch) return `${arrowMatch[1]}:${arrowMatch[2]}`;
  }
  return "";
}

function parseCargoTest(raw: string): ParsedResult {
  const lines = strip(raw).split("\n");
  const result: ParsedResult = {
    suites: 0, passed: 0, failed: 0, skipped: 0, ignored: 0,
    duration: "", failures: [],
  };

  // Count suite blocks: "running N tests" lines
  const suiteStarts = lines.filter((l) => /^running \d+ tests?$/.test(l.trim()));
  result.suites = suiteStarts.length || 1;

  // Parse "test result: ok. N passed; N failed; N ignored; ..." lines
  // There can be multiple (one per suite). We accumulate.
  for (const line of lines) {
    const resultMatch = line.match(
      /test result:\s+(ok|FAILED)\.\s+(\d+)\s+passed;\s+(\d+)\s+failed;\s+(\d+)\s+ignored;/,
    );
    if (resultMatch) {
      result.passed += parseInt(resultMatch[2], 10);
      result.failed += parseInt(resultMatch[3], 10);
      result.ignored += parseInt(resultMatch[4], 10);
      continue;
    }

    // Duration: "finished in 1.23s"
    const durMatch = line.match(/finished in ([\d.]+s)/);
    if (durMatch) {
      result.duration = durMatch[1];
    }
  }

  result.skipped = result.ignored;

  // Parse failures section
  // "failures:" header followed by "---- test_name stdout ----" blocks
  if (result.failed > 0) {
    let inFailures = false;
    let currentTest = "";
    let errorLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trim() === "failures:") {
        inFailures = true;
        continue;
      }

      if (!inFailures) continue;

      // "---- test_name stdout ----"
      const testHeader = line.match(/^----\s+(.+?)\s+stdout\s+----$/);
      if (testHeader) {
        if (currentTest) {
          pushFailure(result, currentTest, errorLines);
        }
        currentTest = testHeader[1];
        errorLines = [];
        continue;
      }

      // End of failures section: "failures:" listing or "test result:"
      if (/^failures:$/.test(line.trim()) && currentTest) {
        pushFailure(result, currentTest, errorLines);
        currentTest = "";
        // The next section is just listing failed test names, skip
        break;
      }
      if (line.match(/^test result:/)) {
        if (currentTest) {
          pushFailure(result, currentTest, errorLines);
        }
        break;
      }

      if (currentTest) {
        errorLines.push(line);
      }
    }

    // Handle last failure
    if (currentTest) {
      pushFailure(result, currentTest, errorLines);
    }

    // If we didn't find any failures from stdout blocks, parse "failures:" listing
    if (result.failures.length === 0) {
      let inList = false;
      for (const line of lines) {
        if (line.trim() === "failures:") {
          if (inList) break; // second "failures:" is the test names list
          inList = true;
          continue;
        }
        if (inList && line.trim()) {
          const name = line.trim();
          if (!name.startsWith("---") && !name.startsWith("test result")) {
            result.failures.push({ name, error: "", fileLine: "" });
          }
        }
      }
    }
  }

  return result;
}

function pushFailure(
  result: ParsedResult,
  testName: string,
  errorLines: string[],
): void {
  const firstError = errorLines.find((l) =>
    /panic|assert|Error|expect|fail/i.test(l)
  ) || errorLines.find((l) => l.trim().startsWith("thread")) || "";

  const fileLine = extractFileLine(errorLines);

  result.failures.push({
    name: testName.trim(),
    error: firstError.trim().slice(0, 120),
    fileLine,
  });
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

export function createTestRsFilter(): Filter {
  return {
    name: "test-rs",

    matches(command: string): boolean {
      return /^cargo\s+test\b/.test(command);
    },

    apply(_command: string, raw: string): FilterResult {
      const rawChars = raw.length;
      const result = parseCargoTest(raw);
      const filtered = formatResult(result);
      return { filtered, rawChars, filteredChars: filtered.length };
    },
  };
}
