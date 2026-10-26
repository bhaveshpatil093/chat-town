import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDatabase,
  DATABASE_MIGRATIONS,
  migrateDatabase,
} from "../src/db.js";

describe("Chat Town database", () => {
  let database: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    database = createDatabase(":memory:");
  });

  afterEach(() => {
    database.close();
  });

  it("runs migrations and creates the viewers and town_objects tables", () => {
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all() as Array<{ name: string }>;

    expect(tables.map(({ name }) => name)).toEqual([
      "schema_migrations",
      "sqlite_sequence",
      "town_objects",
      "viewers",
    ]);
    expect(
      database.prepare("SELECT version FROM schema_migrations").pluck().all(),
    ).toEqual([1, 2, 3]);
  });

  it("creates viewer fields with XP and level defaults", () => {
    database
      .prepare("INSERT INTO viewers (twitch_id, name) VALUES (?, ?)")
      .run("12345", "TownGuest");

    const viewer = database
      .prepare("SELECT * FROM viewers WHERE twitch_id = ?")
      .get("12345");

    expect(viewer).toMatchObject({
      twitch_id: "12345",
      name: "TownGuest",
      xp: 0,
      level: 1,
      hat: null,
      house_style: null,
      last_chat_xp_at: null,
    });
    expect((viewer as { first_seen: number }).first_seen).toEqual(
      expect.any(Number),
    );
    expect((viewer as { last_seen: number }).last_seen).toEqual(
      expect.any(Number),
    );
  });

  it("creates town objects with generated IDs and timestamps", () => {
    const result = database
      .prepare(
        "INSERT INTO town_objects (type, x, y, style) VALUES (?, ?, ?, ?)",
      )
      .run("tree", 12.5, 24, "pine");
    const townObject = database
      .prepare("SELECT * FROM town_objects WHERE id = ?")
      .get(result.lastInsertRowid);

    expect(townObject).toMatchObject({
      id: result.lastInsertRowid,
      type: "tree",
      x: 12.5,
      y: 24,
      style: "pine",
    });
    expect((townObject as { created_at: number }).created_at).toEqual(
      expect.any(Number),
    );
  });

  it("does not reapply already-recorded migrations", () => {
    expect(migrateDatabase(database)).toEqual([]);
    expect(DATABASE_MIGRATIONS.map(({ version }) => version)).toEqual([
      1, 2, 3,
    ]);
    expect(
      database.prepare("SELECT version FROM schema_migrations").pluck().all(),
    ).toEqual([1, 2, 3]);
  });
});
