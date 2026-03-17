/**
 * SQLite analytics tracker — records token savings per command.
 */

import type Database from "better-sqlite3";

export interface SavingsRecord {
  command: string;
  rawTokens: number;
  filteredTokens: number;
  savedTokens: number;
  timestamp: number;
}

export class Tracker {
  private db: Database.Database;
  private insertStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.insertStmt = db.prepare(
      `INSERT INTO rtk_savings (command, raw_tokens, filtered_tokens, saved_tokens, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    );
  }

  record(command: string, rawTokens: number, filteredTokens: number): void {
    const saved = rawTokens - filteredTokens;
    this.insertStmt.run(command, rawTokens, filteredTokens, saved, Date.now());
  }

  getSessionSavings(): { totalRaw: number; totalFiltered: number; totalSaved: number } {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(raw_tokens), 0) as totalRaw,
                COALESCE(SUM(filtered_tokens), 0) as totalFiltered,
                COALESCE(SUM(saved_tokens), 0) as totalSaved
         FROM rtk_savings`
      )
      .get() as { totalRaw: number; totalFiltered: number; totalSaved: number };
    return row;
  }
}
