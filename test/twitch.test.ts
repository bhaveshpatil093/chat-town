import { describe, expect, it } from "vitest";
import { isIgnoredTwitchAccount, normalizeTwitchChat } from "../src/twitch.js";

describe("Twitch event normalization", () => {
  it("maps chat identity and sanitizes message content", () => {
    expect(
      normalizeTwitchChat(
        {
          chatterId: "42",
          chatterName: "viewer_login",
          chatterDisplayName: "Viewer",
          messageText: "hello https://example.com 🌳🌳🌳🌳🌳🌳",
        },
        [],
        123,
      ),
    ).toEqual({
      type: "chat",
      timestamp: 123,
      userId: "42",
      displayName: "Viewer",
      message: "hello 🌳🌳🌳🌳🌳",
    });
  });

  it("marks blocked messages so the overlay can suppress their bubbles", () => {
    expect(
      normalizeTwitchChat(
        {
          chatterId: "42",
          chatterName: "viewer_login",
          chatterDisplayName: "Viewer",
          messageText: "this is forbidden",
        },
        ["forbidden"],
        456,
      ),
    ).toEqual({
      type: "chat",
      timestamp: 456,
      userId: "42",
      displayName: "Viewer",
      message: "",
      blocked: true,
    });
  });

  it("ignores configured account IDs, logins, and display names case-insensitively", () => {
    const bots = ["Nightbot", "@StreamElements", "123456"];
    expect(
      isIgnoredTwitchAccount(bots, "user-id", "nightbot", "NightBot"),
    ).toBe(true);
    expect(isIgnoredTwitchAccount(bots, "123456", "other", "Other")).toBe(true);
    expect(
      isIgnoredTwitchAccount(bots, "42", "regular_viewer", "Regular"),
    ).toBe(false);
  });
});
