import { describe, expect, it } from "vitest";
import {
  MAX_CHAT_EMOJI,
  MAX_CHAT_LENGTH,
  sanitizeChatMessage,
} from "../src/chatSanitizer.js";

describe("chat sanitizer", () => {
  it("strips control characters and URLs while keeping readable spacing", () => {
    expect(
      sanitizeChatMessage(
        "Hi\u0000there https://example.xyz/path and www.test.org!",
      ),
    ).toEqual({ message: "Hi there and", blocked: false });
  });

  it("removes excess combining marks from zalgo text", () => {
    const message = sanitizeChatMessage(`H${"\u0336".repeat(12)}ello!`);
    expect(message.message.replace(/\p{M}/gu, "")).toBe("Hello!");
    expect((message.message.match(/\p{M}/gu) ?? []).length).toBeLessThanOrEqual(
      2,
    );
  });

  it("keeps emoji graphemes intact and limits excessive emoji", () => {
    const family = "👨‍👩‍👧‍👦";
    const sanitized = sanitizeChatMessage(family.repeat(8));
    const graphemes = Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
        sanitized.message,
      ),
    );

    expect(graphemes).toHaveLength(MAX_CHAT_EMOJI);
    expect(sanitized.message).toBe(family.repeat(MAX_CHAT_EMOJI));
  });

  it("limits long messages without splitting graphemes", () => {
    const message = sanitizeChatMessage("a".repeat(MAX_CHAT_LENGTH + 20));

    expect(Array.from(message.message)).toHaveLength(MAX_CHAT_LENGTH);
    expect(message.message.endsWith("…")).toBe(true);
  });

  it("blocks whole messages containing configured words or phrases", () => {
    expect(
      sanitizeChatMessage("This has a BAD   phrase!", ["bad phrase"]),
    ).toEqual({ message: "", blocked: true });
    expect(sanitizeChatMessage("badge earned", ["bad"])).toEqual({
      message: "badge earned",
      blocked: false,
    });
  });
});
