/**
 * Tests for the log-dedup filter.
 *
 * Validates:
 * - VAL-DATA-014: 3+ consecutive identical lines → single line with (xN)
 * - VAL-DATA-015: 2 consecutive identical lines pass through
 * - VAL-DATA-016: Same message with different timestamps collapsed
 * - VAL-DATA-017: Output includes unique/total/collapsed counts summary
 */

import { describe, it, expect } from "vitest";
import { createLogDedupFilter } from "../src/filters/log-dedup.js";

const filter = createLogDedupFilter();

// ── Helper: generate N identical lines ────────────────────────────

function repeat(line: string, n: number): string {
  return Array(n).fill(line).join("\n");
}

// ── matches() ─────────────────────────────────────────────────────

describe("log-dedup filter — matches()", () => {
  it("matches docker logs command", () => {
    expect(filter.matches("docker logs mycontainer")).toBe(true);
  });

  it("matches docker logs with flags", () => {
    expect(filter.matches("docker logs -f --tail 100 mycontainer")).toBe(true);
  });

  it("matches journalctl", () => {
    expect(filter.matches("journalctl -u myservice")).toBe(true);
  });

  it("matches tail -f on log files", () => {
    expect(filter.matches("tail -f /var/log/syslog")).toBe(true);
  });

  it("matches cat on .log files", () => {
    expect(filter.matches("cat app.log")).toBe(true);
  });

  it("matches cat on syslog paths", () => {
    expect(filter.matches("cat /var/log/messages")).toBe(true);
  });

  it("does not match random commands", () => {
    expect(filter.matches("ls -la")).toBe(false);
    expect(filter.matches("git status")).toBe(false);
    expect(filter.matches("echo hello")).toBe(false);
  });
});

// ── Collapsing 3+ identical lines (VAL-DATA-014) ─────────────────

describe("log-dedup filter — collapses 3+ identical lines", () => {
  it("collapses 3 consecutive identical lines", () => {
    const raw = [
      "Starting server...",
      "Health check OK",
      "Health check OK",
      "Health check OK",
      "Shutting down",
    ].join("\n");

    const { filtered } = filter.apply("docker logs web", raw);
    expect(filtered).toContain("Health check OK (x3)");
    expect(filtered).not.toMatch(/Health check OK\nHealth check OK/);
  });

  it("collapses large runs (50 identical lines)", () => {
    const lines = [
      "Server started",
      ...Array(50).fill("ping received"),
      "Server stopped",
    ];
    const raw = lines.join("\n");

    const { filtered } = filter.apply("docker logs web", raw);
    expect(filtered).toContain("ping received (x50)");
  });

  it("collapses multiple separate runs", () => {
    const raw = [
      "A", "A", "A",
      "B",
      "C", "C", "C", "C", "C",
    ].join("\n");

    const { filtered } = filter.apply("docker logs web", raw);
    expect(filtered).toContain("A (x3)");
    expect(filtered).toContain("C (x5)");
    expect(filtered).toContain("B");
  });

  it("achieves savings on highly repetitive output", () => {
    const raw = Array(100).fill("Heartbeat OK").join("\n");
    const { filtered, rawChars, filteredChars } = filter.apply("docker logs web", raw);
    expect(filteredChars).toBeLessThan(rawChars);
    expect(filtered).toContain("(x100)");
  });
});

// ── Preserving runs < 3 (VAL-DATA-015) ──────────────────────────

describe("log-dedup filter — preserves runs < 3", () => {
  it("preserves 2 consecutive identical lines", () => {
    const raw = [
      "line A",
      "line B",
      "line B",
      "line C",
    ].join("\n");

    const { filtered } = filter.apply("docker logs web", raw);
    // Both "line B" lines should appear individually, no (xN)
    const matches = filtered.match(/line B/g);
    expect(matches).toHaveLength(2);
    expect(filtered).not.toContain("(x2)");
  });

  it("preserves single unique lines", () => {
    const raw = [
      "line A",
      "line B",
      "line C",
    ].join("\n");

    const { filtered } = filter.apply("docker logs web", raw);
    expect(filtered).toContain("line A");
    expect(filtered).toContain("line B");
    expect(filtered).toContain("line C");
    expect(filtered).not.toContain("(x");
  });

  it("preserves exactly 1 repeated line (no collapse)", () => {
    const raw = "single line";
    const { filtered } = filter.apply("docker logs web", raw);
    expect(filtered).toContain("single line");
    expect(filtered).not.toContain("(x");
  });
});

// ── Timestamp-based dedup (VAL-DATA-016) ─────────────────────────

describe("log-dedup filter — pattern-based timestamp dedup", () => {
  it("collapses lines with same message but different ISO timestamps", () => {
    const raw = [
      "2024-01-15T10:30:00.000Z Health check passed",
      "2024-01-15T10:30:01.000Z Health check passed",
      "2024-01-15T10:30:02.000Z Health check passed",
      "2024-01-15T10:30:03.000Z Health check passed",
      "2024-01-15T10:30:04.000Z Something else",
    ].join("\n");

    const { filtered } = filter.apply("docker logs web", raw);
    expect(filtered).toContain("Health check passed");
    expect(filtered).toContain("(x4)");
    expect(filtered).toContain("Something else");
  });

  it("collapses lines with same message but different syslog timestamps", () => {
    const raw = [
      "Jan 15 10:30:00 Health check passed",
      "Jan 15 10:30:01 Health check passed",
      "Jan 15 10:30:02 Health check passed",
    ].join("\n");

    const { filtered } = filter.apply("docker logs web", raw);
    expect(filtered).toContain("Health check passed");
    expect(filtered).toContain("(x3)");
  });

  it("collapses lines with same message but different bracketed timestamps", () => {
    const raw = [
      "[2024-01-15 10:30:00] Request handled",
      "[2024-01-15 10:30:01] Request handled",
      "[2024-01-15 10:30:02] Request handled",
      "[2024-01-15 10:30:03] Request handled",
      "[2024-01-15 10:30:04] Request handled",
    ].join("\n");

    const { filtered } = filter.apply("docker logs web", raw);
    expect(filtered).toContain("Request handled");
    expect(filtered).toContain("(x5)");
  });

  it("does not collapse timestamp lines with different messages", () => {
    const raw = [
      "2024-01-15T10:30:00.000Z Starting",
      "2024-01-15T10:30:01.000Z Running",
      "2024-01-15T10:30:02.000Z Stopping",
    ].join("\n");

    const { filtered } = filter.apply("docker logs web", raw);
    expect(filtered).toContain("Starting");
    expect(filtered).toContain("Running");
    expect(filtered).toContain("Stopping");
    expect(filtered).not.toContain("(x");
  });

  it("preserves 2 timestamp-different same-message lines", () => {
    const raw = [
      "2024-01-15T10:30:00.000Z Health check passed",
      "2024-01-15T10:30:01.000Z Health check passed",
      "2024-01-15T10:30:02.000Z Something else",
    ].join("\n");

    const { filtered } = filter.apply("docker logs web", raw);
    // Only 2 identical messages — should NOT collapse
    const hcMatches = filtered.match(/Health check passed/g);
    expect(hcMatches).toHaveLength(2);
    expect(filtered).not.toContain("(x2)");
  });
});

// ── Summary line (VAL-DATA-017) ──────────────────────────────────

describe("log-dedup filter — summary line", () => {
  it("appends summary with unique, total, and collapsed counts", () => {
    const raw = [
      "Starting",
      "Health check OK",
      "Health check OK",
      "Health check OK",
      "Health check OK",
      "Health check OK",
      "Shutting down",
    ].join("\n");

    const { filtered } = filter.apply("docker logs web", raw);
    // 3 unique messages, 7 total, 4 duplicates collapsed
    expect(filtered).toMatch(/3 unique lines \(7 total, 4 duplicates collapsed\)/);
  });

  it("summary with no duplicates shows 0 collapsed", () => {
    const raw = [
      "line A",
      "line B",
      "line C",
    ].join("\n");

    const { filtered } = filter.apply("docker logs web", raw);
    expect(filtered).toMatch(/3 unique lines \(3 total, 0 duplicates collapsed\)/);
  });

  it("summary with all identical lines", () => {
    const raw = Array(10).fill("same line").join("\n");
    const { filtered } = filter.apply("docker logs web", raw);
    expect(filtered).toMatch(/1 unique lines \(10 total, 9 duplicates collapsed\)/);
  });

  it("summary counts correctly with mixed runs", () => {
    const raw = [
      "A", "A", "A",           // run of 3 → collapsed (1 unique, 2 dupes)
      "B",                      // 1 unique
      "C", "C",                 // run of 2 → preserved (1 unique, but both kept)
      "D", "D", "D", "D",      // run of 4 → collapsed (1 unique, 3 dupes)
    ].join("\n");

    const { filtered } = filter.apply("docker logs web", raw);
    // unique: A, B, C, D = 4
    // total: 10
    // collapsed: 2 (from A) + 3 (from D) = 5
    expect(filtered).toMatch(/4 unique lines \(10 total, 5 duplicates collapsed\)/);
  });
});

// ── Edge cases ───────────────────────────────────────────────────

describe("log-dedup filter — edge cases", () => {
  it("handles empty output", () => {
    const { filtered } = filter.apply("docker logs web", "");
    expect(filtered).toBeDefined();
  });

  it("handles single line", () => {
    const { filtered } = filter.apply("docker logs web", "one line");
    expect(filtered).toContain("one line");
  });

  it("handles lines with trailing whitespace consistently", () => {
    const raw = [
      "Health check OK",
      "Health check OK",
      "Health check OK",
    ].join("\n");

    const { filtered } = filter.apply("docker logs web", raw);
    expect(filtered).toContain("Health check OK (x3)");
  });

  it("handles blank lines in the stream", () => {
    const raw = [
      "line A",
      "",
      "",
      "",
      "",
      "line B",
    ].join("\n");

    const { filtered } = filter.apply("docker logs web", raw);
    // 4 consecutive empty lines → collapsed
    expect(filtered).toContain("(x4)");
    expect(filtered).toContain("line A");
    expect(filtered).toContain("line B");
  });

  it("handles unicode content", () => {
    const raw = [
      "🔥 Error occurred",
      "🔥 Error occurred",
      "🔥 Error occurred",
      "✅ Recovered",
    ].join("\n");

    const { filtered } = filter.apply("docker logs web", raw);
    expect(filtered).toContain("🔥 Error occurred (x3)");
    expect(filtered).toContain("✅ Recovered");
  });

  it("strips ANSI escape codes before dedup comparison", () => {
    const raw = [
      "\x1b[31mError: connection refused\x1b[0m",
      "\x1b[31mError: connection refused\x1b[0m",
      "\x1b[31mError: connection refused\x1b[0m",
    ].join("\n");

    const { filtered } = filter.apply("docker logs web", raw);
    expect(filtered).toContain("Error: connection refused (x3)");
  });

  it("returns correct rawChars and filteredChars", () => {
    const raw = Array(20).fill("repeated log entry").join("\n");
    const { rawChars, filteredChars } = filter.apply("docker logs web", raw);
    expect(rawChars).toBe(raw.length);
    expect(filteredChars).toBeLessThan(rawChars);
  });

  it("large output (500+ lines) with mixed content", () => {
    const lines: string[] = [];
    for (let i = 0; i < 100; i++) {
      lines.push(`Request ${i % 10} processed`);
    }
    // Add a run of identical lines
    for (let i = 0; i < 400; i++) {
      lines.push("Waiting for connection...");
    }
    lines.push("Connection established");

    const raw = lines.join("\n");
    const { filtered, rawChars, filteredChars } = filter.apply("docker logs web", raw);
    expect(filtered).toContain("Waiting for connection... (x400)");
    expect(filtered).toContain("Connection established");
    expect(filteredChars).toBeLessThan(rawChars);
  });
});
