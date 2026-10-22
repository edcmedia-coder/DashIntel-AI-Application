import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle as drizzleBetterSqlite, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export type Database = BetterSQLite3Database<typeof schema> & {
  $client: unknown;
};

type GlobalWithDb = typeof globalThis & {
  __dashintelDb?: Database;
  __dashintelDbKind?: "sqlite" | "libsql";
};

const g = globalThis as GlobalWithDb;

function resolveFilePath(): string {
  const configured = process.env.DATABASE_FILE?.trim();
  const file = configured && configured.length > 0 ? configured : "data/dashintel.db";
  return path.isAbsolute(file) ? file : path.join(process.cwd(), file);
}

function createSqliteDb(): Database {
  const file = resolveFilePath();
  const dir = path.dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzleBetterSqlite(sqlite, { schema });
  Object.defineProperty(db, "$client", { value: sqlite, enumerable: false });
  return db as Database;
}

async function createLibsqlDb(url: string, authToken: string | undefined): Promise<Database> {
  // Loaded lazily so the local (file) path never pays for the Turbo dependency.
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  const client = createClient({ url, authToken });
  await client.execute("PRAGMA foreign_keys = ON");
  const db = drizzle(client, { schema });
  Object.defineProperty(db, "$client", { value: client, enumerable: false });
  return db as unknown as Database;
}

/**
 * Apply pending migrations exactly once per process.
 * Memoised so concurrent requests never race on the migration table.
 */
let migrationPromise: Promise<void> | null = null;

async function ensureMigrated(db: Database): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      const folder = path.join(process.cwd(), "drizzle");
      if (g.__dashintelDbKind === "libsql") {
        const { migrate } = await import("drizzle-orm/libsql/migrator");
        await migrate(db as never, { migrationsFolder: folder });
      } else {
        const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
        migrate(db as never, { migrationsFolder: folder });
      }
    })().catch((err) => {
      migrationPromise = null;
      throw err;
    });
  }
  return migrationPromise;
}

/**
 * Resolve the active database.
 *
 * - `DATABASE_URL` starting with `libsql://` or `https://` → Turso / libSQL.
 * - otherwise → local SQLite file at `DATABASE_FILE` (default `data/dashintel.db`).
 *
 * The schema and all queries are identical across both targets, which is the
 * production migration path: point `DATABASE_URL` at Turso and redeploy.
 */
export async function getDb(): Promise<Database> {
  if (g.__dashintelDb) {
    await ensureMigrated(g.__dashintelDb);
    return g.__dashintelDb;
  }

  const url = process.env.DATABASE_URL?.trim();
  const useLibsql = url && (url.startsWith("libsql://") || url.startsWith("https://"));

  if (useLibsql) {
    const db = await createLibsqlDb(url, process.env.DATABASE_AUTH_TOKEN);
    g.__dashintelDb = db;
    g.__dashintelDbKind = "libsql";
    await ensureMigrated(db);
    return db;
  }

  const db = createSqliteDb();
  g.__dashintelDb = db;
  g.__dashintelDbKind = "sqlite";
  await ensureMigrated(db);
  return db;
}

export function dbKind(): "sqlite" | "libsql" | "unknown" {
  return g.__dashintelDbKind ?? "unknown";
}

export { schema };
