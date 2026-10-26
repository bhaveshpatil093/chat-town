import type Database from "better-sqlite3";
import type { ChatTownEventMap, EventBus } from "./bus.js";

export const CHAT_XP_COOLDOWN_MS = 60_000;
export const CHAT_XP_REWARD = 5;
export const FOLLOW_XP_REWARD = 25;
export const SUBSCRIPTION_XP_PER_TIER = 100;
export const MAX_CHEER_XP = 100;
export const XP_PER_LEVEL_SQUARE = 50;
export const REGULAR_NAMEPLATE_LEVEL = 5;

export interface ViewerCosmetics {
  xp: number;
  level: number;
  hat: string | null;
  houseStyle: "tent" | "cabin" | "house" | "mansion";
  nameplateColor: string;
}

type ProgressionEvent =
  | ChatTownEventMap["chat"]
  | ChatTownEventMap["follow"]
  | ChatTownEventMap["sub"]
  | ChatTownEventMap["bits"];

interface StoredViewer {
  xp: number;
  level: number;
  last_chat_xp_at: number | null;
}

export function xpRequiredForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new Error("Level must be a positive integer.");
  }
  return XP_PER_LEVEL_SQUARE * (level - 1) ** 2;
}

export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp < 0) {
    throw new Error("XP must be a non-negative finite number.");
  }
  return Math.floor(Math.sqrt(xp / XP_PER_LEVEL_SQUARE)) + 1;
}

export function cosmeticsForLevel(
  level: number,
): Omit<ViewerCosmetics, "xp" | "level"> {
  return {
    hat:
      level >= 7
        ? "crown"
        : level >= 4
          ? "flower"
          : level >= 2
            ? "beanie"
            : null,
    houseStyle:
      level >= 10
        ? "mansion"
        : level >= 6
          ? "house"
          : level >= 3
            ? "cabin"
            : "tent",
    nameplateColor: level >= REGULAR_NAMEPLATE_LEVEL ? "#ffd166" : "#ffffff",
  };
}

export function createViewerProgression(
  bus: EventBus,
  database: Database.Database,
  now: () => number = Date.now,
): () => void {
  const upsertViewer = database.prepare(`
    INSERT INTO viewers (twitch_id, name, first_seen, last_seen, house_style)
    VALUES (?, ?, ?, ?, 'tent')
    ON CONFLICT(twitch_id) DO UPDATE SET
      name = excluded.name,
      last_seen = excluded.last_seen
  `);
  const selectViewer = database.prepare(
    "SELECT xp, level, last_chat_xp_at FROM viewers WHERE twitch_id = ?",
  );
  const updateViewer = database.prepare(`
    UPDATE viewers
    SET xp = ?, level = ?, hat = ?, house_style = ?, last_seen = ?,
        last_chat_xp_at = CASE WHEN ? THEN ? ELSE last_chat_xp_at END
    WHERE twitch_id = ?
  `);

  const persistEvent = database.transaction(
    (event: ProgressionEvent, award: number, timestamp: number) => {
      upsertViewer.run(event.userId, event.displayName, timestamp, timestamp);
      const current = selectViewer.get(event.userId) as StoredViewer;
      const chatReward = event.type === "chat";
      const chatCooldownActive =
        chatReward &&
        current.last_chat_xp_at !== null &&
        timestamp - current.last_chat_xp_at < CHAT_XP_COOLDOWN_MS;
      const earnedXp = chatCooldownActive ? 0 : award;
      const xp = current.xp + earnedXp;
      const level = levelForXp(xp);
      const cosmetics = cosmeticsForLevel(level);

      updateViewer.run(
        xp,
        level,
        cosmetics.hat,
        cosmetics.houseStyle,
        timestamp,
        chatReward && !chatCooldownActive ? 1 : 0,
        timestamp,
        event.userId,
      );

      return {
        previousLevel: current.level,
        profile: { xp, level, ...cosmetics } satisfies ViewerCosmetics,
      };
    },
  );

  const handle = (event: ProgressionEvent, award: number): void => {
    const timestamp = now();
    const { previousLevel, profile } = persistEvent(event, award, timestamp);
    event.profile = profile;
    if (profile.level <= previousLevel) return;

    bus.emit({
      type: "levelup",
      timestamp,
      userId: event.userId,
      displayName: event.displayName,
      level: profile.level,
      profile,
    });
  };

  const removeChat = bus.on("chat", (event) => {
    if (event.blocked || !event.message.trim()) return;
    handle(event, CHAT_XP_REWARD);
  });
  const removeFollow = bus.on("follow", (event) => {
    handle(event, FOLLOW_XP_REWARD);
  });
  const removeSub = bus.on("sub", (event) => {
    handle(event, subscriptionXp(event.tier));
  });
  const removeBits = bus.on("bits", (event) => {
    handle(event, cheerXp(event.amount));
  });

  return () => {
    removeChat();
    removeFollow();
    removeSub();
    removeBits();
  };
}

function subscriptionXp(tier: string): number {
  const parsed = Number(tier);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return SUBSCRIPTION_XP_PER_TIER;
  }
  const tierNumber = parsed >= 1000 ? parsed / 1000 : parsed;
  return (
    SUBSCRIPTION_XP_PER_TIER * Math.min(3, Math.max(1, Math.floor(tierNumber)))
  );
}

function cheerXp(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.min(MAX_CHEER_XP, Math.max(1, Math.floor(amount / 10)));
}
