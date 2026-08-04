import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

const DB_PATH = resolve(process.cwd(), "data", "attendance.db");
const MIGRATION_PATH = resolve(process.cwd(), "drizzle", "0000_flowery_devos.sql");

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;

  const dataDir = dirname(DB_PATH);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // Auto-initialize schema if tables don't exist
  const tableCheck = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='employees'",
    )
    .get();

  if (!tableCheck && existsSync(MIGRATION_PATH)) {
    const migrationSql = readFileSync(MIGRATION_PATH, "utf-8");
    const statements = migrationSql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      sqlite.exec(stmt);
    }
  }

  _db = drizzle(sqlite, { schema });
  return _db;
}
