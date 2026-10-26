import { describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import {
  generateFakeEvents,
  parseSimulationRequest,
  parseSimulatorArgs,
} from "../src/simulator.js";

describe("simulator", () => {
  it("generates one fake event for every normalized event type by default", () => {
    const events = generateFakeEvents(
      { type: "all" },
      () => 0.5,
      () => 100,
    );

    expect(events.map((event) => event.type)).toEqual([
      "chat",
      "follow",
      "sub",
      "bits",
      "raid",
      "levelup",
    ]);
    expect(events.every((event) => event.timestamp >= 100)).toBe(true);
  });

  it("applies the requested raid viewer count", () => {
    const [event] = generateFakeEvents(
      { type: "raid", viewers: 40 },
      () => 0.5,
      () => 100,
    );

    expect(event).toMatchObject({ type: "raid", viewerCount: 40 });
  });

  it("validates simulation API input", () => {
    expect(parseSimulationRequest({ type: "raid", viewers: 40 })).toEqual({
      type: "raid",
      viewers: 40,
    });
    expect(parseSimulationRequest({ type: "not-an-event" })).toBeNull();
    expect(parseSimulationRequest({ type: "raid", viewers: 0 })).toBeNull();
  });

  it("parses CLI options and defaults to generating every event type", () => {
    expect(parseSimulatorArgs(["--type", "raid", "--viewers", "40"])).toEqual({
      type: "raid",
      viewers: 40,
      url: `http://127.0.0.1:${config.port}`,
    });
    expect(parseSimulatorArgs([]).type).toBe("all");
  });

  it("rejects invalid CLI options", () => {
    expect(() => parseSimulatorArgs(["--type", "unknown"])).toThrow(
      "Invalid --type value",
    );
    expect(() => parseSimulatorArgs(["--viewers", "100001"])).toThrow(
      "--viewers must be an integer from 1 to 100000",
    );
  });
});
