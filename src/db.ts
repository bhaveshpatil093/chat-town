import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const DEFAULT_DATABASE_PATH = resolve(
  process.cwd(),
  "data/chat-town.sqlite",
);

export interface Migration {
  version: number;
  sql: string;
}

export const DATABASE_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE viewers (
        twitch_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
        level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
        hat TEXT,
        house_style TEXT,
        first_seen INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        last_seen INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );

      CREATE TABLE town_objects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        style TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );
    `,
  },
  {
    version: 2,
    sql: `ALTER TABLE viewers ADD COLUMN last_chat_xp_at INTEGER;`,
  },
];

/** Create the migration ledger and apply each unapplied migration atomically. */
export function migrateDatabase(database: Database.Database): number[] {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `);

  const appliedVersions = new Set(
    (
      database.prepare("SELECT version FROM schema_migrations").all() as Array<{
        version: number;
      }>
    ).map(({ version }) => version),
  );
  const unappliedMigrations = DATABASE_MIGRATIONS.filter(
    ({ version }) => !appliedVersions.has(version),
  );
  const applyMigrations = database.transaction(() => {
    for (const migration of unappliedMigrations) {
      database.exec(migration.sql);
      database
        .prepare("INSERT INTO schema_migrations (version) VALUES (?)")
        .run(migration.version);
    }
  });
  applyMigrations();
  return unappliedMigrations.map(({ version }) => version);
}

/** Open the local database, create its directory, and run pending migrations. */
export function createDatabase(
  path = DEFAULT_DATABASE_PATH,
): Database.Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(resolve(path)), { recursive: true });
  }

  const database = new Database(path);
  database.pragma("foreign_keys = ON");
  if (path !== ":memory:") database.pragma("journal_mode = WAL");
  migrateDatabase(database);
  return database;
}
