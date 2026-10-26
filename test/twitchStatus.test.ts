import { beforeEach, describe, expect, it } from "vitest";
import {
  configureTwitchStatus,
  getTwitchStatus,
  recordTwitchEvent,
  setTwitchConnectionState,
} from "../src/twitchStatus.js";

describe("Twitch status", () => {
  beforeEach(() => configureTwitchStatus(true, "chat-town-channel"));

  it("records connection state and the channel", () => {
    setTwitchConnectionState("connected");

    expect(getTwitchStatus()).toMatchObject({
      enabled: true,
      connectionState: "connected",
      channel: "chat-town-channel",
      lastConnectedAt: expect.any(Number),
    });
  });

  it("keeps only the eight most recent real events", () => {
    for (let timestamp = 1; timestamp <= 10; timestamp += 1) {
      recordTwitchEvent({
        type: "follow",
        displayName: `Viewer${timestamp}`,
        timestamp,
        summary: "Followed the channel",
      });
    }

    expect(getTwitchStatus().recentEvents).toHaveLength(8);
    expect(getTwitchStatus().recentEvents[0]?.displayName).toBe("Viewer10");
    expect(getTwitchStatus().recentEvents[7]?.displayName).toBe("Viewer3");
  });

  it("clears sensitive event history when switched to simulator-only", () => {
    recordTwitchEvent({
      type: "chat",
      displayName: "Viewer",
      timestamp: 1,
      summary: "hello",
    });
    configureTwitchStatus(false, null);

    expect(getTwitchStatus()).toMatchObject({
      enabled: false,
      connectionState: "disabled",
      channel: null,
      recentEvents: [],
    });
  });
});
