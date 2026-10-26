import type Database from "better-sqlite3";

export const TOWN_GRID = [
  "gggggggggggggggggg",
  "gggTggggggggTggggg",
  "gggggggggggggggggg",
  "pppppppppppppppppp",
  "ggggggppgggggggggg",
  "gTggggppgHggTggggg",
  "ggggggppgggggggggg",
  "ggggggppppppppgggg",
  "gggHggggggggppgggg",
  "ggggggggggggppgggg",
] as const;

export type TownObjectKind = "house" | "tree";
export type TownHouseStyle = "tent" | "cabin" | "house" | "mansion";

export interface PersistedTownObject {
  id: number;
  type: TownObjectKind;
  row: number;
  column: number;
  style: string | null;
  ownerTwitchId: string | null;
  createdAt: number;
}

interface StoredTownObjectRow {
  id: number;
  type: string;
  x: number;
  y: number;
  style: string | null;
  owner_twitch_id: string | null;
  created_at: number;
}

export function createFollowTownObject(
  database: Database.Database,
  ownerTwitchId: string,
  houseStyle: TownHouseStyle,
  random: () => number = Math.random,
): PersistedTownObject | null {
  const kind = random() < 0.5 ? "tree" : "house";
  const existingObjects = database
    .prepare("SELECT type, x, y FROM town_objects")
    .all() as Array<{ type: string; x: number; y: number }>;
  const blocked = blockedTownCells(existingObjects);
  const spot =
    findFreeSpot(kind, blocked, random) ??
    findFreeSpot(kind === "tree" ? "house" : "tree", blocked, random);
  if (!spot) return null;

  const selectedKind = spot.kind;
  const style = selectedKind === "house" ? houseStyle : "pine";
  const result = database
    .prepare(
      `INSERT INTO town_objects (type, x, y, style, owner_twitch_id)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(selectedKind, spot.column, spot.row, style, ownerTwitchId);
  const createdAt = database
    .prepare("SELECT created_at FROM town_objects WHERE id = ?")
    .pluck()
    .get(Number(result.lastInsertRowid)) as number;

  return {
    id: Number(result.lastInsertRowid),
    type: selectedKind,
    row: spot.row,
    column: spot.column,
    style,
    ownerTwitchId,
    createdAt,
  };
}

export function loadTownObjects(
  database: Database.Database,
): PersistedTownObject[] {
  return (
    database
      .prepare(
        `SELECT id, type, x, y, style, owner_twitch_id, created_at
       FROM town_objects ORDER BY id`,
      )
      .all() as StoredTownObjectRow[]
  ).map((row) => ({
    id: row.id,
    type: row.type === "house" ? "house" : "tree",
    row: row.y,
    column: row.x,
    style: row.style,
    ownerTwitchId: row.owner_twitch_id,
    createdAt: row.created_at,
  }));
}

function blockedTownCells(
  objects: readonly { type: string; x: number; y: number }[],
): Set<string> {
  const blocked = new Set<string>();
  TOWN_GRID.forEach((mapRow, rowIndex) => {
    [...mapRow].forEach((tile, columnIndex) => {
      if (tile === "T") blocked.add(cellKey(rowIndex, columnIndex));
      if (tile === "H") {
        for (let offset = -1; offset <= 1; offset += 1) {
          blocked.add(cellKey(rowIndex, columnIndex + offset));
        }
      }
    });
  });
  for (const object of objects) {
    const radius = object.type === "house" ? 1 : 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      blocked.add(cellKey(object.y, object.x + offset));
    }
  }
  return blocked;
}

function findFreeSpot(
  kind: TownObjectKind,
  blocked: ReadonlySet<string>,
  random: () => number,
): { kind: TownObjectKind; row: number; column: number } | null {
  const options: Array<{ row: number; column: number }> = [];
  TOWN_GRID.forEach((mapRow, row) => {
    [...mapRow].forEach((tile, column) => {
      if (tile !== "g" || row < 3) return;
      const radius = kind === "house" ? 1 : 0;
      if (column - radius < 0 || column + radius >= mapRow.length) return;
      for (let offset = -radius; offset <= radius; offset += 1) {
        if (blocked.has(cellKey(row, column + offset))) return;
      }
      options.push({ row, column });
    });
  });
  if (!options.length) return null;
  const selected =
    options[
      Math.min(options.length - 1, Math.floor(random() * options.length))
    ]!;
  return { kind, row: selected.row, column: selected.column };
}

function cellKey(row: number, column: number): string {
  return `${row}:${column}`;
}
