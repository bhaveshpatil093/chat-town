import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../src/db.js";
import { createFollowTownObject, loadTownObjects } from "../src/townObjects.js";

describe("persistent town objects", () => {
  let database: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    database = createDatabase(":memory:");
  });

  afterEach(() => database.close());

  it("creates and reloads an owned house at a free grid position", () => {
    const object = createFollowTownObject(
      database,
      "viewer-1",
      "cabin",
      () => 0.99,
    );

    expect(object).toMatchObject({
      type: "house",
      style: "cabin",
      ownerTwitchId: "viewer-1",
    });
    expect(object?.row).toBeGreaterThanOrEqual(3);
    expect(loadTownObjects(database)).toEqual([object]);
  });

  it("avoids overlap when placing multiple follow rewards", () => {
    const first = createFollowTownObject(
      database,
      "viewer-1",
      "tent",
      () => 0.99,
    );
    const second = createFollowTownObject(
      database,
      "viewer-2",
      "tent",
      () => 0.99,
    );

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(`${first?.row}:${first?.column}`).not.toBe(
      `${second?.row}:${second?.column}`,
    );
  });
});
