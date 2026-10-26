import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";

describe("parseConfig", () => {
  it("uses the default port when PORT is not set", () => {
    expect(parseConfig({})).toEqual({
      port: 3000,
      twitchEnabled: false,
      blockedWords: [],
      twitchChannel: null,
      twitchBotAccounts: [],
    });
  });

  it("parses a valid port", () => {
    expect(parseConfig({ PORT: "4321" })).toEqual({
      port: 4321,
      twitchEnabled: false,
      blockedWords: [],
      twitchChannel: null,
      twitchBotAccounts: [],
    });
  });

  it("parses a comma-separated blocked word list", () => {
    expect(parseConfig({ CHAT_BLOCKED_WORDS: "spam, bad phrase ,," })).toEqual({
      port: 3000,
      twitchEnabled: false,
      blockedWords: ["spam", "bad phrase"],
      twitchChannel: null,
      twitchBotAccounts: [],
    });
  });

  it("parses a Twitch channel and normalized bot account list", () => {
    expect(
      parseConfig({
        TWITCH_CHANNEL: "  MyChannel ",
        TWITCH_BOT_ACCOUNTS: " Nightbot, @StreamElements, 123456 ",
      }),
    ).toMatchObject({
      twitchChannel: "MyChannel",
      twitchBotAccounts: ["nightbot", "streamelements", "123456"],
    });
  });

  it("enables Twitch only when TWITCH_ENABLED is true", () => {
    expect(parseConfig({ TWITCH_ENABLED: "true" }).twitchEnabled).toBe(true);
    expect(parseConfig({ TWITCH_ENABLED: "false" }).twitchEnabled).toBe(false);
    expect(() => parseConfig({ TWITCH_ENABLED: "yes" })).toThrow(
      "TWITCH_ENABLED must be true or false",
    );
  });

  it("provides a clear error when PORT is invalid", () => {
    expect(() => parseConfig({ PORT: "not-a-number" })).toThrow(
      "PORT must be an integer from 1 to 65535",
    );
  });

  it("rejects ports outside the valid range", () => {
    expect(() => parseConfig({ PORT: "65536" })).toThrow(
      "PORT must be an integer from 1 to 65535",
    );
  });
});
