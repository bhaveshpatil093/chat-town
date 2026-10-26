import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TWITCH_REDIRECT_URI,
  loadStoredTwitchToken,
  parseStoredTwitchToken,
  parseTwitchOAuthCredentials,
  REQUIRED_TWITCH_SCOPES,
  saveTwitchToken,
} from "../src/twitchAuth.js";

describe("Twitch OAuth configuration", () => {
  it("parses credentials and defaults the local callback URL", () => {
    expect(
      parseTwitchOAuthCredentials({
        TWITCH_CLIENT_ID: "client-id",
        TWITCH_CLIENT_SECRET: "client-secret",
      }),
    ).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: DEFAULT_TWITCH_REDIRECT_URI,
    });
  });

  it("requires both Twitch application credentials", () => {
    expect(() => parseTwitchOAuthCredentials({})).toThrow(
      "Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env",
    );
  });

  it("requests only scopes used by Chat Town's chat and event feeds", () => {
    expect(REQUIRED_TWITCH_SCOPES).toEqual([
      "user:read:chat",
      "moderator:read:followers",
      "channel:read:subscriptions",
      "bits:read",
    ]);
  });

  it("validates token data before loading it into the refreshing provider", () => {
    expect(
      parseStoredTwitchToken({
        userId: "1234",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        scope: [...REQUIRED_TWITCH_SCOPES],
        expiresIn: 3_600,
        obtainmentTimestamp: 1_735_689_600_000,
      }),
    ).toMatchObject({ userId: "1234", accessToken: "access-token" });
    expect(() => parseStoredTwitchToken({ accessToken: "incomplete" })).toThrow(
      "The Twitch token file is invalid",
    );
  });

  it("persists token data with owner-only file permissions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "chat-town-auth-"));
    const tokenPath = join(directory, "twitch-token.json");
    const token = {
      userId: "1234",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      scope: [...REQUIRED_TWITCH_SCOPES],
      expiresIn: 3_600,
      obtainmentTimestamp: 1_735_689_600_000,
    };

    try {
      await saveTwitchToken(token, tokenPath);
      expect(await loadStoredTwitchToken(tokenPath)).toEqual(token);
      expect((await stat(tokenPath)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
