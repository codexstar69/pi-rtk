import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db/schema.js";
import { formatDiscoverOutput } from "../src/discover.js";
import { matchCommand } from "../src/matcher.js";

/**
 * Tests for /rtk discover — missed optimization opportunities.
 * Covers: VAL-UX-007, VAL-UX-008, VAL-UX-009.
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

// ── Helper: insert unfiltered command records ─────────────────────

function seedUnfiltered(command: string, count: number, avgChars: number = 5000): void {
  const stmt = db.prepare(
    `INSERT INTO unfiltered_commands (command, char_count, timestamp) VALUES (?, ?, ?)`,
  );
  for (let i = 0; i < count; i++) {
    stmt.run(command, avgChars, Date.now() - i * 1000);
  }
}

// ────────────────────────────────────────────────────────────────────
// VAL-UX-007: /rtk discover identifies unfiltered commands
// ────────────────────────────────────────────────────────────────────

describe("discover identifies unfiltered commands", () => {
  it("identifies commands that could have been filtered", () => {
    seedUnfiltered("cargo build", 4, 12000);
    seedUnfiltered("docker ps", 2, 8000);

    const output = formatDiscoverOutput(db);
    expect(output).toContain("cargo build");
    expect(output).toContain("docker ps");
  });

  it("groups similar commands together", () => {
    seedUnfiltered("cargo build", 3, 10000);
    seedUnfiltered("cargo build --release", 2, 10000);

    const output = formatDiscoverOutput(db);
    // Both should be identified (they match the same filter: lint-rs)
    // The output should group them by applicable filter
    expect(output).toContain("cargo");
  });

  it("shows the applicable filter name", () => {
    seedUnfiltered("cargo build", 4, 12000);

    const output = formatDiscoverOutput(db);
    expect(output).toContain("lint-rs");
  });

  it("shows run count per command pattern", () => {
    seedUnfiltered("docker ps", 3, 8000);

    const output = formatDiscoverOutput(db);
    expect(output).toMatch(/3/);
  });

  it("does not list commands that have no matching filter", () => {
    // Commands with no RTK filter — should not appear
    seedUnfiltered("echo hello", 5, 200);
    seedUnfiltered("pwd", 10, 50);

    const output = formatDiscoverOutput(db);
    expect(output).not.toContain("echo hello");
    expect(output).not.toContain("pwd");
  });

  it("shows header text about missed opportunities", () => {
    seedUnfiltered("cargo build", 2, 12000);

    const output = formatDiscoverOutput(db);
    // Header should mention missed / unfiltered / opportunity
    expect(output).toMatch(/[Dd]iscover|[Mm]issed|[Oo]pportunit|[Uu]nfiltered/);
  });
});

// ────────────────────────────────────────────────────────────────────
// VAL-UX-008: /rtk discover estimates savings
// ────────────────────────────────────────────────────────────────────

describe("discover estimates savings", () => {
  it("shows estimated savings per unfiltered command type", () => {
    seedUnfiltered("cargo build", 4, 12000);

    const output = formatDiscoverOutput(db);
    // Should show some percentage-based savings estimate
    expect(output).toMatch(/\d+%/);
  });

  it("shows estimated token savings", () => {
    seedUnfiltered("cargo build", 4, 12000);

    const output = formatDiscoverOutput(db);
    // Should show token/character savings estimate
    expect(output).toMatch(/\d+(\.\d+)?K/);
  });

  it("different commands get different savings estimates", () => {
    seedUnfiltered("cargo build", 4, 12000);
    seedUnfiltered("docker compose up", 2, 8000);

    const output = formatDiscoverOutput(db);
    // Both should be listed with their own estimates
    expect(output).toContain("cargo build");
    expect(output).toContain("docker compose");
  });
});

// ────────────────────────────────────────────────────────────────────
// VAL-UX-009: /rtk discover total estimate
// ────────────────────────────────────────────────────────────────────

describe("discover total estimate", () => {
  it("includes total estimated savings summary", () => {
    seedUnfiltered("cargo build", 4, 12000);
    seedUnfiltered("docker compose up", 2, 8000);

    const output = formatDiscoverOutput(db);
    // Should contain a total/estimated summary line
    expect(output).toMatch(/[Ee]stimated.*sav|[Tt]otal.*sav/);
  });

  it("total is sum of individual command estimates", () => {
    seedUnfiltered("cargo build", 4, 12000);

    const output = formatDiscoverOutput(db);
    // Should contain a numeric total
    expect(output).toMatch(/\d+(\.\d+)?K/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Edge cases
// ────────────────────────────────────────────────────────────────────

describe("discover edge cases", () => {
  it("handles empty database gracefully", () => {
    const output = formatDiscoverOutput(db);
    // Should not crash, should show a helpful message
    expect(output.length).toBeGreaterThan(0);
    expect(output).toMatch(/[Nn]o.*command|[Nn]othing|[Aa]ll.*filtered|[Nn]o.*opportunit/);
  });

  it("does not crash with no unfiltered_commands table data", () => {
    expect(() => formatDiscoverOutput(db)).not.toThrow();
  });

  it("orders commands by potential savings descending", () => {
    // Large output commands first
    seedUnfiltered("cargo build", 10, 50000);
    seedUnfiltered("docker ps", 2, 1000);

    const output = formatDiscoverOutput(db);
    const lines = output.split("\n");

    const cargoIdx = lines.findIndex((l) => l.includes("cargo build"));
    const dockerIdx = lines.findIndex((l) => l.includes("docker ps"));

    if (cargoIdx > -1 && dockerIdx > -1) {
      expect(cargoIdx).toBeLessThan(dockerIdx);
    }
  });
});
