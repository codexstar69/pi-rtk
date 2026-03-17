/**
 * SQLite schema migrations for the RTK tracking database.
 */

import type Database from "better-sqlite3";

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS rtk_savings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command TEXT NOT NULL,
    raw_tokens INTEGER NOT NULL,
    filtered_tokens INTEGER NOT NULL,
    saved_tokens INTEGER NOT NULL,
    timestamp INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_rtk_savings_timestamp
    ON rtk_savings(timestamp);

  CREATE INDEX IF NOT EXISTS idx_rtk_savings_command
    ON rtk_savings(command);
`;

export function runMigrations(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  for (const stmt of SCHEMA_SQL.split(";").filter((s) => s.trim())) {
    db.prepare(stmt.trim()).run();
  }
}
