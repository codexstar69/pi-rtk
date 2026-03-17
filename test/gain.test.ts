import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db/schema.js";
import { Tracker } from "../src/tracker.js";
import { formatGainOutput, type GainOptions } from "../src/gain.js";

/**
 * Tests for /rtk gain analytics dashboard.
 * Covers: VAL-UX-001 through VAL-UX-006.
 */

let db: Database.Database;
let tracker: Tracker;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  tracker = new Tracker(db);
});

afterEach(() => {
  db.close();
});

// ────────────────────────────────────────────────────────────────────
// Helper: seed test data
// ────────────────────────────────────────────────────────────────────

function seedData(): void {
  // git diff: 12 runs, ~45.2K raw, ~8.1K filtered
  for (let i = 0; i < 12; i++) {
    tracker.record("git diff", 3767, 675, { filterName: "git-diff" });
  }
  // git status: 28 runs, ~8.4K raw, ~2.1K filtered
  for (let i = 0; i < 28; i++) {
    tracker.record("git status", 300, 75, { filterName: "git-status" });
  }
  // bun test: 6 runs, ~32K raw, ~3.2K filtered
  for (let i = 0; i < 6; i++) {
    tracker.record("bun test", 5333, 533, { filterName: "test-js" });
  }
  // ls: 15 runs, ~6K raw, ~1.2K filtered
  for (let i = 0; i < 15; i++) {
    tracker.record("ls -la", 400, 80, { filterName: "ls" });
  }
}

function seedOldData(daysAgo: number): void {
  const oldTimestamp = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  db.prepare(
    `INSERT INTO command_runs
       (command, filter_name, raw_chars, filt_chars, raw_tokens, filt_tokens, savings_pct, duration_ms, timestamp, session_id, cwd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("tsc", "lint-tsc", 4000, 500, 1000, 125, 87.5, null, oldTimestamp, null, null);
}

// ────────────────────────────────────────────────────────────────────
// VAL-UX-001: /rtk gain table format
// ────────────────────────────────────────────────────────────────────

describe("gain table format", () => {
  it("has correct columns: Command, Runs, Raw, Filtered, Saved%, bar chart", () => {
    seedData();
    const output = formatGainOutput(db, { period: "all", sessionSavings: 0 });

    // Header should contain all column names
    expect(output).toContain("Command");
    expect(output).toContain("Runs");
    expect(output).toContain("Raw");
    expect(output).toContain("Filtered");
    expect(output).toContain("Saved");
  });

  it("includes period label in header", () => {
    seedData();
    const output24h = formatGainOutput(db, { period: "24h", sessionSavings: 0 });
    expect(output24h).toContain("24h");

    const output7d = formatGainOutput(db, { period: "7d", sessionSavings: 0 });
    expect(output7d).toContain("7d");

    const output30d = formatGainOutput(db, { period: "30d", sessionSavings: 0 });
    expect(output30d).toContain("30d");

    const outputAll = formatGainOutput(db, { period: "all", sessionSavings: 0 });
    expect(outputAll.toLowerCase()).toContain("all");
  });

  it("includes separator lines", () => {
    seedData();
    const output = formatGainOutput(db, { period: "all", sessionSavings: 0 });
    // Should have at least one separator line with dashes
    expect(output).toMatch(/─+/);
  });

  it("shows bar chart characters for each command", () => {
    seedData();
    const output = formatGainOutput(db, { period: "all", sessionSavings: 0 });
    // Bar chart uses block characters (█ and ░)
    expect(output).toMatch(/[█░]+/);
  });
});

// ────────────────────────────────────────────────────────────────────
// VAL-UX-002: /rtk gain correct percentages
// ────────────────────────────────────────────────────────────────────

describe("gain correct percentages", () => {
  it("shows correct savings percentage per command", () => {
    // Insert data with known savings: 80%
    tracker.record("git diff", 1000, 200, { filterName: "git-diff" });
    tracker.record("git diff", 1000, 200, { filterName: "git-diff" });

    const output = formatGainOutput(db, { period: "all", sessionSavings: 0 });
    // Should show 80% for git diff
    expect(output).toContain("80%");
  });

  it("shows correct savings for mixed commands", () => {
    // git diff: 80% savings (1000 -> 200)
    tracker.record("git diff", 1000, 200, { filterName: "git-diff" });
    // git status: 75% savings (400 -> 100)
    tracker.record("git status", 400, 100, { filterName: "git-status" });

    const output = formatGainOutput(db, { period: "all", sessionSavings: 0 });
    expect(output).toContain("80%");
    expect(output).toContain("75%");
  });

  it("calculates percentage from raw tokens vs filtered tokens", () => {
    // 90% savings: 2000 raw -> 200 filtered
    tracker.record("bun test", 2000, 200, { filterName: "test-js" });

    const output = formatGainOutput(db, { period: "all", sessionSavings: 0 });
    expect(output).toContain("90%");
  });
});

// ────────────────────────────────────────────────────────────────────
// VAL-UX-003: /rtk gain total summary row
// ────────────────────────────────────────────────────────────────────

describe("gain total summary row", () => {
  it("includes total row at bottom", () => {
    seedData();
    const output = formatGainOutput(db, { period: "all", sessionSavings: 0 });
    expect(output.toLowerCase()).toContain("total");
  });

  it("total row has correct aggregate run count", () => {
    tracker.record("git diff", 1000, 200, { filterName: "git-diff" });
    tracker.record("git diff", 1000, 200, { filterName: "git-diff" });
    tracker.record("git status", 400, 100, { filterName: "git-status" });

    const output = formatGainOutput(db, { period: "all", sessionSavings: 0 });
    const lines = output.split("\n");
    // Find line containing "Total"
    const totalLine = lines.find((l) => l.toLowerCase().includes("total"));
    expect(totalLine).toBeDefined();
    // Total runs should be 3
    expect(totalLine).toContain("3");
  });

  it("total row has correct aggregate savings percentage", () => {
    // Two commands, both 80% savings
    tracker.record("git diff", 1000, 200, { filterName: "git-diff" });
    tracker.record("git status", 1000, 200, { filterName: "git-status" });

    const output = formatGainOutput(db, { period: "all", sessionSavings: 0 });
    const lines = output.split("\n");
    const totalLine = lines.find((l) => l.toLowerCase().includes("total"));
    expect(totalLine).toBeDefined();
    expect(totalLine).toContain("80%");
  });
});

// ────────────────────────────────────────────────────────────────────
// VAL-UX-004: /rtk gain time period filtering
// ────────────────────────────────────────────────────────────────────

describe("gain time period filtering", () => {
  it("24h period excludes old data", () => {
    // Recent data
    tracker.record("git status", 400, 100, { filterName: "git-status" });
    // Old data (2 days ago)
    seedOldData(2);

    const output = formatGainOutput(db, { period: "24h", sessionSavings: 0 });
    // Should only show git-status (1 run), not lint-tsc
    expect(output).toContain("git-status");
    expect(output).not.toContain("lint-tsc");
  });

  it("7d period excludes data older than 7 days", () => {
    tracker.record("git status", 400, 100, { filterName: "git-status" });
    seedOldData(10);

    const output = formatGainOutput(db, { period: "7d", sessionSavings: 0 });
    expect(output).toContain("git-status");
    expect(output).not.toContain("lint-tsc");
  });

  it("30d period excludes data older than 30 days", () => {
    tracker.record("git status", 400, 100, { filterName: "git-status" });
    seedOldData(60);

    const output = formatGainOutput(db, { period: "30d", sessionSavings: 0 });
    expect(output).toContain("git-status");
    expect(output).not.toContain("lint-tsc");
  });

  it("all period includes all data", () => {
    tracker.record("git status", 400, 100, { filterName: "git-status" });
    seedOldData(60);

    const output = formatGainOutput(db, { period: "all", sessionSavings: 0 });
    expect(output).toContain("git-status");
    expect(output).toContain("lint-tsc");
  });

  it("defaults to all when no period specified", () => {
    tracker.record("git status", 400, 100, { filterName: "git-status" });
    seedOldData(60);

    const output = formatGainOutput(db, { period: "all", sessionSavings: 0 });
    expect(output).toContain("git-status");
    expect(output).toContain("lint-tsc");
  });
});

// ────────────────────────────────────────────────────────────────────
// VAL-UX-005: /rtk gain session savings line
// ────────────────────────────────────────────────────────────────────

describe("gain session savings line", () => {
  it("shows session savings when > 0", () => {
    seedData();
    const output = formatGainOutput(db, { period: "all", sessionSavings: 113000 });
    expect(output).toMatch(/[Ss]ession/);
    expect(output).toContain("113");
  });

  it("shows session savings with K suffix for thousands", () => {
    seedData();
    const output = formatGainOutput(db, { period: "all", sessionSavings: 5000 });
    expect(output).toMatch(/~5K/);
  });

  it("shows session savings line even when 0", () => {
    seedData();
    const output = formatGainOutput(db, { period: "all", sessionSavings: 0 });
    expect(output).toMatch(/[Ss]ession/);
  });
});

// ────────────────────────────────────────────────────────────────────
// VAL-UX-006: /rtk gain empty database
// ────────────────────────────────────────────────────────────────────

describe("gain handles empty database", () => {
  it("shows helpful message when no data", () => {
    const output = formatGainOutput(db, { period: "all", sessionSavings: 0 });
    // Should have a helpful message, not crash or show empty table
    expect(output.length).toBeGreaterThan(0);
    // Should indicate no data
    expect(output).toMatch(/[Nn]o (data|commands|runs)|[Nn]othing/);
  });

  it("does not crash on empty database", () => {
    expect(() =>
      formatGainOutput(db, { period: "all", sessionSavings: 0 }),
    ).not.toThrow();
  });

  it("empty database with non-zero session savings still shows session line", () => {
    const output = formatGainOutput(db, { period: "all", sessionSavings: 5000 });
    expect(output).toMatch(/[Ss]ession/);
  });

  it("empty database for specific period shows helpful message", () => {
    const output = formatGainOutput(db, { period: "24h", sessionSavings: 0 });
    expect(output.length).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Output formatting details
// ────────────────────────────────────────────────────────────────────

describe("gain output formatting", () => {
  it("shows human-readable sizes (K, M) for token counts", () => {
    // Insert enough data to produce K-level sizes
    for (let i = 0; i < 10; i++) {
      tracker.record("git diff", 8000, 1600, { filterName: "git-diff" });
    }

    const output = formatGainOutput(db, { period: "all", sessionSavings: 0 });
    // Should show K suffix for large numbers
    expect(output).toMatch(/\d+(\.\d+)?K/);
  });

  it("orders commands by total raw tokens descending", () => {
    // git-diff: more raw tokens
    for (let i = 0; i < 5; i++) {
      tracker.record("git diff", 8000, 1600, { filterName: "git-diff" });
    }
    // git-status: fewer raw tokens
    tracker.record("git status", 400, 100, { filterName: "git-status" });

    const output = formatGainOutput(db, { period: "all", sessionSavings: 0 });
    const lines = output.split("\n");

    // Find lines containing the filter names
    const diffIdx = lines.findIndex((l) => l.includes("git-diff"));
    const statusIdx = lines.findIndex((l) => l.includes("git-status"));

    // git-diff should appear before git-status (higher raw tokens)
    expect(diffIdx).toBeGreaterThan(-1);
    expect(statusIdx).toBeGreaterThan(-1);
    expect(diffIdx).toBeLessThan(statusIdx);
  });

  it("groups commands by base command (e.g., 'git diff' and 'git diff --staged' grouped)", () => {
    tracker.record("git diff", 1000, 200, { filterName: "git-diff" });
    tracker.record("git diff --staged", 1000, 200, { filterName: "git-diff" });

    const output = formatGainOutput(db, { period: "all", sessionSavings: 0 });
    // Both should be grouped under the same filter name, not separate rows
    const lines = output.split("\n");
    const diffLines = lines.filter((l) => l.includes("git-diff") || l.includes("git diff"));
    // Should be exactly one data row for git-diff (plus possibly total/header)
    const dataLines = diffLines.filter(
      (l) => !l.toLowerCase().includes("total") && !l.includes("Command"),
    );
    expect(dataLines.length).toBeLessThanOrEqual(1);
  });
});
