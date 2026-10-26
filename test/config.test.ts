import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";

describe("parseConfig", () => {
  it("uses the default port when PORT is not set", () => {
    expect(parseConfig({})).toEqual({ port: 3000 });
  });

  it("parses a valid port", () => {
    expect(parseConfig({ PORT: "4321" })).toEqual({ port: 4321 });
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
