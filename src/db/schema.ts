/**
 * SQLite schema migrations for the RTK tracking database.
 * Creates the command_runs table with all columns from IMPLEMENTATION.md
 * and indexes idx_runs_timestamp and idx_runs_command.
 * Schema creation is idempotent.
 */

import type Database from "better-sqlite3";

/**
 * Run schema migrations. Safe to call multiple times (idempotent).
 */
export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS command_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      command     TEXT NOT NULL,
      filter_name TEXT NOT NULL,
      raw_chars   INTEGER NOT NULL,
      filt_chars  INTEGER NOT NULL,
      raw_tokens  INTEGER NOT NULL,
      filt_tokens INTEGER NOT NULL,
      savings_pct REAL NOT NULL,
      duration_ms INTEGER,
      timestamp   INTEGER NOT NULL,
      session_id  TEXT,
      cwd         TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_runs_timestamp ON command_runs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_runs_command ON command_runs(command);
  `);
}
