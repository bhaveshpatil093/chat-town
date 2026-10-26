import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/bus.js";
import { createDatabase } from "../src/db.js";
import {
  CHAT_XP_COOLDOWN_MS,
  CHAT_XP_REWARD,
  cosmeticsForLevel,
  createViewerProgression,
  FOLLOW_XP_REWARD,
  levelForXp,
  MAX_CHEER_XP,
  SUBSCRIPTION_XP_PER_TIER,
  xpRequiredForLevel,
} from "../src/progression.js";

describe("viewer progression", () => {
  let bus: EventBus;
  let database: ReturnType<typeof createDatabase>;
  let removeProgression: (() => void) | undefined;
  let timestamp: number;

  beforeEach(() => {
    bus = new EventBus();
    database = createDatabase(":memory:");
    timestamp = 1_800_000_000_000;
    removeProgression = createViewerProgression(bus, database, () => timestamp);
  });

  afterEach(() => {
    removeProgression?.();
    database.close();
  });

  it("awards chat XP no more than once per user each minute", () => {
    const firstChat = chatEvent("viewer-1", "Regular");
    bus.emit(firstChat);
    expect(firstChat.profile).toMatchObject({ xp: CHAT_XP_REWARD, level: 1 });

    const anotherViewer = chatEvent("viewer-1a", "AnotherRegular");
    bus.emit(anotherViewer);
    expect(anotherViewer.profile?.xp).toBe(CHAT_XP_REWARD);

    removeProgression?.();
    removeProgression = createViewerProgression(bus, database, () => timestamp);

    const secondChat = chatEvent("viewer-1", "Regular");
    bus.emit(secondChat);
    expect(secondChat.profile?.xp).toBe(CHAT_XP_REWARD);

    timestamp += CHAT_XP_COOLDOWN_MS - 1;
    const stillCoolingDown = chatEvent("viewer-1", "Regular");
    bus.emit(stillCoolingDown);
    expect(stillCoolingDown.profile?.xp).toBe(CHAT_XP_REWARD);

    timestamp += 1;
    const afterCooldown = chatEvent("viewer-1", "Regular");
    bus.emit(afterCooldown);
    expect(afterCooldown.profile?.xp).toBe(CHAT_XP_REWARD * 2);
    expect(
      database
        .prepare("SELECT last_chat_xp_at FROM viewers WHERE twitch_id = ?")
        .pluck()
        .get("viewer-1"),
    ).toBe(timestamp);
  });

  it("does not award XP for filtered or empty chat", () => {
    const blocked = chatEvent("blocked-user", "Blocked", "", true);
    const empty = chatEvent("empty-user", "Empty", "  ");
    bus.emit(blocked);
    bus.emit(empty);

    expect(
      database.prepare("SELECT count(*) AS count FROM viewers").get(),
    ).toEqual({ count: 0 });
  });

  it("awards follow, tiered subscription, and capped cheer XP", () => {
    const follow = {
      type: "follow" as const,
      timestamp,
      userId: "viewer-2",
      displayName: "Supporter",
    };
    bus.emit(follow);
    expect(follow.profile?.xp).toBe(FOLLOW_XP_REWARD);

    const subscription = {
      type: "sub" as const,
      timestamp,
      userId: "viewer-2",
      displayName: "Supporter",
      tier: "2000",
    };
    bus.emit(subscription);
    expect(subscription.profile?.xp).toBe(
      FOLLOW_XP_REWARD + SUBSCRIPTION_XP_PER_TIER * 2,
    );

    const cheer = {
      type: "bits" as const,
      timestamp,
      userId: "viewer-2",
      displayName: "Supporter",
      amount: 10_000,
    };
    bus.emit(cheer);
    expect(cheer.profile?.xp).toBe(
      FOLLOW_XP_REWARD + SUBSCRIPTION_XP_PER_TIER * 2 + MAX_CHEER_XP,
    );
  });

  it("emits one levelup event with the viewer's new persisted profile", () => {
    const levelUps = vi.fn();
    bus.on("levelup", levelUps);

    for (let index = 0; index < 10; index += 1) {
      timestamp += CHAT_XP_COOLDOWN_MS;
      bus.emit(chatEvent("viewer-3", "TownRegular"));
    }

    expect(levelUps).toHaveBeenCalledOnce();
    expect(levelUps).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "levelup",
        userId: "viewer-3",
        level: 2,
        profile: expect.objectContaining({ hat: "beanie" }),
      }),
    );
    expect(
      database
        .prepare(
          "SELECT xp, level, hat, house_style FROM viewers WHERE twitch_id = ?",
        )
        .get("viewer-3"),
    ).toEqual({ xp: 50, level: 2, hat: "beanie", house_style: "tent" });
  });
});

describe("level curve and unlocks", () => {
  it("uses quadratic XP thresholds", () => {
    expect(xpRequiredForLevel(1)).toBe(0);
    expect(xpRequiredForLevel(2)).toBe(50);
    expect(xpRequiredForLevel(3)).toBe(200);
    expect(levelForXp(199)).toBe(2);
    expect(levelForXp(200)).toBe(3);
  });

  it("unlocks hats, regular nameplates, and house upgrades by level", () => {
    expect(cosmeticsForLevel(1)).toEqual({
      hat: null,
      houseStyle: "tent",
      nameplateColor: "#ffffff",
    });
    expect(cosmeticsForLevel(3)).toMatchObject({
      hat: "beanie",
      houseStyle: "cabin",
    });
    expect(cosmeticsForLevel(5).nameplateColor).toBe("#ffd166");
    expect(cosmeticsForLevel(6).houseStyle).toBe("house");
    expect(cosmeticsForLevel(7).hat).toBe("crown");
    expect(cosmeticsForLevel(10).houseStyle).toBe("mansion");
  });
});

function chatEvent(
  userId: string,
  displayName: string,
  message = "Hello town!",
  blocked = false,
): {
  type: "chat";
  timestamp: number;
  userId: string;
  displayName: string;
  message: string;
  blocked?: boolean;
} {
  return {
    type: "chat",
    timestamp: Date.now(),
    userId,
    displayName,
    message,
    ...(blocked ? { blocked: true } : {}),
  };
}
