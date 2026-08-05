import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const DB_PATH = resolve(process.cwd(), "data", "attendance.db");
const MIGRATIONS_DIR = resolve(process.cwd(), "drizzle");

let _db: ReturnType<typeof drizzle> | null = null;

function runMigrations(sqlite: InstanceType<typeof Database>) {
  // Create a migrations tracking table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Find all .sql migration files, sorted by name
  const allFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // Get already-applied migrations
  const applied = new Set(
    (sqlite.prepare("SELECT name FROM _migrations").all() as Array<{ name: string }>)
      .map((r) => r.name),
  );

  // Run any new migrations
  for (const file of allFiles) {
    if (applied.has(file)) continue;

    const filePath = resolve(MIGRATIONS_DIR, file);
    const migrationSql = readFileSync(filePath, "utf-8");
    const statements = migrationSql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      try {
        sqlite.exec(stmt);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("duplicate column name")) continue;
        throw err;
      }
    }

    sqlite.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
  }
}

export function getDb() {
  if (_db) return _db;

  const dataDir = dirname(DB_PATH);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  runMigrations(sqlite);

  _db = drizzle(sqlite, { schema });
  return _db;
}
