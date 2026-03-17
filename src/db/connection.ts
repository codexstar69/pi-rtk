/**
 * SQLite connection management — follows pi-lcm pattern exactly.
 * WAL mode, busy_timeout 5000, foreign_keys ON, secure permissions.
 */

import Database from "better-sqlite3";
import { mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

let db: Database.Database | null = null;

const DB_DIR = join(homedir(), ".pi", "agent", "rtk");

/**
 * Open (or return existing) SQLite connection.
 * Follows pi-lcm: WAL mode, busy_timeout 5000, foreign_keys ON, secure permissions.
 *
 * @param dbPath  Optional override for testing (e.g., ":memory:").
 */
export function openDb(dbPath?: string): Database.Database {
  if (db) return db;

  const resolvedPath = dbPath ?? join(DB_DIR, "rtk.db");

  // Only create directory and set permissions for real (non-memory) databases
  if (resolvedPath !== ":memory:") {
    const dir = resolvedPath === join(DB_DIR, "rtk.db") ? DB_DIR : join(resolvedPath, "..");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  db = new Database(resolvedPath);

  // Secure file permissions for real databases
  if (resolvedPath !== ":memory:") {
    try {
      chmodSync(resolvedPath, 0o600);
    } catch {
      /* may fail on some FS */
    }
  }

  // Connection pragmas — same as pi-lcm
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");

  return db;
}

/**
 * Close the database, running a PASSIVE WAL checkpoint first.
 */
export function closeDb(): void {
  if (!db) return;
  try {
    db.pragma("wal_checkpoint(PASSIVE)");
  } catch {
    /* non-fatal */
  }
  try {
    db.close();
  } catch {
    /* ignore close errors */
  }
  db = null;
}

/**
 * TRUNCATE checkpoint — safe to call under exclusive access (e.g., shutdown).
 */
export function checkpointDb(): void {
  if (!db) return;
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    /* non-fatal */
  }
}

/**
 * Return the current database handle (may be null if not opened).
 */
export function getDb(): Database.Database | null {
  return db;
}
