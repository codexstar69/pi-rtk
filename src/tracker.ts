/**
 * SQLite analytics tracker — records token savings per command run
 * and queries aggregate savings by time period.
 */

import type Database from "better-sqlite3";
import { estimateTokens } from "./utils.js";

/** Aggregate savings returned by getSavings(). */
export interface SavingsAggregate {
  totalRuns: number;
  totalRawTokens: number;
  totalFilteredTokens: number;
  totalSavedTokens: number;
  avgSavingsPct: number;
}

/** Time periods accepted by getSavings(). */
export type SavingsPeriod = "24h" | "7d" | "30d" | "all";

/** Options for record(). */
export interface RecordOptions {
  filterName: string;
  durationMs?: number;
  sessionId?: string;
  cwd?: string;
}

/**
 * Tracker class — wraps SQLite prepared statements for fast inserts and queries.
 */
export class Tracker {
  private db: Database.Database;
  private insertStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.insertStmt = db.prepare(
      `INSERT INTO command_runs
         (command, filter_name, raw_chars, filt_chars, raw_tokens, filt_tokens, savings_pct, duration_ms, timestamp, session_id, cwd)
       VALUES
         (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
  }

  /**
   * Record a command run with raw and filtered output sizes.
   * Computes savings_pct and token estimates automatically.
   */
  record(
    command: string,
    rawChars: number,
    filteredChars: number,
    options: RecordOptions,
  ): void {
    const rawTokens = estimateTokens("x".repeat(rawChars));
    const filtTokens = estimateTokens("x".repeat(filteredChars));
    const savingsPct = rawChars > 0 ? ((rawChars - filteredChars) / rawChars) * 100 : 0;

    this.insertStmt.run(
      command,
      options.filterName,
      rawChars,
      filteredChars,
      rawTokens,
      filtTokens,
      savingsPct,
      options.durationMs ?? null,
      Date.now(),
      options.sessionId ?? null,
      options.cwd ?? null,
    );
  }

  /**
   * Query aggregate savings filtered by time period.
   * Returns zeros without error when no records match.
   */
  getSavings(period: SavingsPeriod): SavingsAggregate {
    const cutoff = periodToCutoff(period);

    const row = this.db
      .prepare(
        `SELECT
           COUNT(*)                          AS totalRuns,
           COALESCE(SUM(raw_tokens), 0)      AS totalRawTokens,
           COALESCE(SUM(filt_tokens), 0)     AS totalFilteredTokens,
           COALESCE(SUM(raw_tokens - filt_tokens), 0) AS totalSavedTokens,
           COALESCE(AVG(savings_pct), 0)     AS avgSavingsPct
         FROM command_runs
         WHERE timestamp >= ?`,
      )
      .get(cutoff) as {
      totalRuns: number;
      totalRawTokens: number;
      totalFilteredTokens: number;
      totalSavedTokens: number;
      avgSavingsPct: number;
    };

    return {
      totalRuns: row.totalRuns,
      totalRawTokens: row.totalRawTokens,
      totalFilteredTokens: row.totalFilteredTokens,
      totalSavedTokens: row.totalSavedTokens,
      avgSavingsPct: row.avgSavingsPct,
    };
  }
}

/**
 * Convert a SavingsPeriod to a Unix-ms cutoff timestamp.
 * "all" returns 0 (matches everything).
 */
function periodToCutoff(period: SavingsPeriod): number {
  const now = Date.now();
  switch (period) {
    case "24h":
      return now - 24 * 60 * 60 * 1000;
    case "7d":
      return now - 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return now - 30 * 24 * 60 * 60 * 1000;
    case "all":
      return 0;
  }
}
