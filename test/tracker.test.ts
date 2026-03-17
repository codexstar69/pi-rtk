import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db/schema.js";
import { Tracker } from "../src/tracker.js";
import type { SavingsAggregate } from "../src/tracker.js";

/**
 * All tests use in-memory SQLite — same pattern as pi-lcm.
 */

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

// ────────────────────────────────────────────────────────────────────
// Schema creation
// ────────────────────────────────────────────────────────────────────

describe("schema creation", () => {
  it("creates command_runs table with all required columns", () => {
    const cols = db
      .prepare("PRAGMA table_info(command_runs)")
      .all() as Array<{ name: string; type: string; notnull: number }>;

    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain("id");
    expect(colNames).toContain("command");
    expect(colNames).toContain("filter_name");
    expect(colNames).toContain("raw_chars");
    expect(colNames).toContain("filt_chars");
    expect(colNames).toContain("raw_tokens");
    expect(colNames).toContain("filt_tokens");
    expect(colNames).toContain("savings_pct");
    expect(colNames).toContain("duration_ms");
    expect(colNames).toContain("timestamp");
    expect(colNames).toContain("session_id");
    expect(colNames).toContain("cwd");
    expect(colNames).toHaveLength(12);
  });

  it("creates idx_runs_timestamp index", () => {
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='command_runs'",
      )
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain("idx_runs_timestamp");
  });

  it("creates idx_runs_command index", () => {
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='command_runs'",
      )
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain("idx_runs_command");
  });

  it("schema creation is idempotent — running twice does not error", () => {
    // Already ran in beforeEach; run again:
    expect(() => runMigrations(db)).not.toThrow();

    // Table still exists and is intact
    const cols = db
      .prepare("PRAGMA table_info(command_runs)")
      .all() as Array<{ name: string }>;
    expect(cols).toHaveLength(12);
  });

  it("schema creation is idempotent — running three times does not error", () => {
    runMigrations(db);
    runMigrations(db);

    const cols = db
      .prepare("PRAGMA table_info(command_runs)")
      .all() as Array<{ name: string }>;
    expect(cols).toHaveLength(12);
  });
});

// ────────────────────────────────────────────────────────────────────
// Record insertion
// ────────────────────────────────────────────────────────────────────

describe("tracker.record()", () => {
  it("inserts a row with correct values", () => {
    const tracker = new Tracker(db);
    tracker.record("git status", 2400, 320, {
      filterName: "git-status",
      durationMs: 3,
      sessionId: "sess-1",
      cwd: "/tmp/project",
    });

    const row = db.prepare("SELECT * FROM command_runs").get() as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.command).toBe("git status");
    expect(row.filter_name).toBe("git-status");
    expect(row.raw_chars).toBe(2400);
    expect(row.filt_chars).toBe(320);
    expect(row.duration_ms).toBe(3);
    expect(row.session_id).toBe("sess-1");
    expect(row.cwd).toBe("/tmp/project");
  });

  it("computes savings_pct correctly", () => {
    const tracker = new Tracker(db);
    tracker.record("git diff", 1000, 200, { filterName: "git-diff" });

    const row = db.prepare("SELECT savings_pct FROM command_runs").get() as {
      savings_pct: number;
    };
    // (1000 - 200) / 1000 * 100 = 80.0
    expect(row.savings_pct).toBeCloseTo(80.0, 1);
  });

  it("computes raw_tokens and filt_tokens from char counts", () => {
    const tracker = new Tracker(db);
    tracker.record("ls -la", 400, 100, { filterName: "ls" });

    const row = db
      .prepare("SELECT raw_tokens, filt_tokens FROM command_runs")
      .get() as { raw_tokens: number; filt_tokens: number };

    // estimateTokens: Math.ceil(chars / 4)
    expect(row.raw_tokens).toBe(100); // 400 / 4
    expect(row.filt_tokens).toBe(25); // 100 / 4
  });

  it("handles zero raw chars without error (no division by zero)", () => {
    const tracker = new Tracker(db);
    expect(() =>
      tracker.record("echo", 0, 0, { filterName: "test" }),
    ).not.toThrow();

    const row = db.prepare("SELECT savings_pct FROM command_runs").get() as {
      savings_pct: number;
    };
    expect(row.savings_pct).toBe(0);
  });

  it("stores null for optional fields when not provided", () => {
    const tracker = new Tracker(db);
    tracker.record("rg pattern", 500, 100, { filterName: "grep" });

    const row = db
      .prepare("SELECT duration_ms, session_id, cwd FROM command_runs")
      .get() as Record<string, unknown>;
    expect(row.duration_ms).toBeNull();
    expect(row.session_id).toBeNull();
    expect(row.cwd).toBeNull();
  });

  it("inserts multiple rows", () => {
    const tracker = new Tracker(db);
    tracker.record("git status", 2400, 320, { filterName: "git-status" });
    tracker.record("git diff", 8000, 1600, { filterName: "git-diff" });
    tracker.record("ls -la", 2000, 400, { filterName: "ls" });

    const count = db
      .prepare("SELECT COUNT(*) as cnt FROM command_runs")
      .get() as { cnt: number };
    expect(count.cnt).toBe(3);
  });

  it("auto-increments id", () => {
    const tracker = new Tracker(db);
    tracker.record("git status", 100, 50, { filterName: "git-status" });
    tracker.record("git diff", 200, 100, { filterName: "git-diff" });

    const rows = db
      .prepare("SELECT id FROM command_runs ORDER BY id")
      .all() as Array<{ id: number }>;
    expect(rows[0].id).toBe(1);
    expect(rows[1].id).toBe(2);
  });

  it("sets timestamp to current time", () => {
    const before = Date.now();
    const tracker = new Tracker(db);
    tracker.record("git log", 5000, 400, { filterName: "git-log" });
    const after = Date.now();

    const row = db.prepare("SELECT timestamp FROM command_runs").get() as {
      timestamp: number;
    };
    expect(row.timestamp).toBeGreaterThanOrEqual(before);
    expect(row.timestamp).toBeLessThanOrEqual(after);
  });
});

// ────────────────────────────────────────────────────────────────────
// Savings queries
// ────────────────────────────────────────────────────────────────────

describe("tracker.getSavings()", () => {
  it("returns correct aggregates for 'all' period", () => {
    const tracker = new Tracker(db);
    tracker.record("git status", 2400, 320, { filterName: "git-status" });
    tracker.record("git diff", 8000, 1600, { filterName: "git-diff" });

    const result = tracker.getSavings("all");
    expect(result.totalRuns).toBe(2);
    expect(result.totalRawTokens).toBe(600 + 2000); // 2400/4 + 8000/4
    expect(result.totalFilteredTokens).toBe(80 + 400); // 320/4 + 1600/4
    expect(result.totalSavedTokens).toBe(520 + 1600); // difference
    expect(result.avgSavingsPct).toBeGreaterThan(0);
  });

  it("empty period returns zeros without error", () => {
    const tracker = new Tracker(db);
    const result = tracker.getSavings("all");

    expect(result.totalRuns).toBe(0);
    expect(result.totalRawTokens).toBe(0);
    expect(result.totalFilteredTokens).toBe(0);
    expect(result.totalSavedTokens).toBe(0);
    expect(result.avgSavingsPct).toBe(0);
  });

  it("filters by 24h period", () => {
    const tracker = new Tracker(db);

    // Insert a recent record (will be included)
    tracker.record("git status", 2400, 320, { filterName: "git-status" });

    // Insert an old record directly (48h ago — should be excluded from "24h")
    const oldTimestamp = Date.now() - 48 * 60 * 60 * 1000;
    db.prepare(
      `INSERT INTO command_runs
         (command, filter_name, raw_chars, filt_chars, raw_tokens, filt_tokens, savings_pct, duration_ms, timestamp, session_id, cwd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("git diff", "git-diff", 8000, 1600, 2000, 400, 80.0, null, oldTimestamp, null, null);

    const result = tracker.getSavings("24h");
    expect(result.totalRuns).toBe(1);
    expect(result.totalRawTokens).toBe(600); // only the recent one: 2400/4
  });

  it("filters by 7d period", () => {
    const tracker = new Tracker(db);

    // Recent record
    tracker.record("ls -la", 2000, 400, { filterName: "ls" });

    // Old record (10 days ago — excluded from "7d")
    const oldTimestamp = Date.now() - 10 * 24 * 60 * 60 * 1000;
    db.prepare(
      `INSERT INTO command_runs
         (command, filter_name, raw_chars, filt_chars, raw_tokens, filt_tokens, savings_pct, duration_ms, timestamp, session_id, cwd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("git log", "git-log", 5000, 400, 1250, 100, 92.0, null, oldTimestamp, null, null);

    const result7d = tracker.getSavings("7d");
    expect(result7d.totalRuns).toBe(1);

    // "all" still has both
    const resultAll = tracker.getSavings("all");
    expect(resultAll.totalRuns).toBe(2);
  });

  it("filters by 30d period", () => {
    const tracker = new Tracker(db);

    // Recent record
    tracker.record("bun test", 6000, 300, { filterName: "test-js" });

    // Old record (60 days ago — excluded from "30d")
    const oldTimestamp = Date.now() - 60 * 24 * 60 * 60 * 1000;
    db.prepare(
      `INSERT INTO command_runs
         (command, filter_name, raw_chars, filt_chars, raw_tokens, filt_tokens, savings_pct, duration_ms, timestamp, session_id, cwd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("tsc", "lint-tsc", 4000, 500, 1000, 125, 87.5, null, oldTimestamp, null, null);

    const result30d = tracker.getSavings("30d");
    expect(result30d.totalRuns).toBe(1);

    const resultAll = tracker.getSavings("all");
    expect(resultAll.totalRuns).toBe(2);
  });

  it("computes correct avgSavingsPct", () => {
    const tracker = new Tracker(db);
    // 80% savings
    tracker.record("cmd1", 1000, 200, { filterName: "git-status" });
    // 50% savings
    tracker.record("cmd2", 1000, 500, { filterName: "git-diff" });

    const result = tracker.getSavings("all");
    // (80 + 50) / 2 = 65
    expect(result.avgSavingsPct).toBeCloseTo(65.0, 0);
  });
});
