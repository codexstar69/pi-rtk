/**
 * SQLite connection management — reuses pi-lcm pattern.
 */

import Database from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";

let db: Database.Database | null = null;

export function openDb(): Database.Database {
  if (db) return db;

  const dir = join(homedir(), ".pi", "agent", "rtk");
  mkdirSync(dir, { recursive: true });

  const dbPath = join(dir, "rtk.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function getDb(): Database.Database | null {
  return db;
}
