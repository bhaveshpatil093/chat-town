import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/bus.js";
import { createChatCommandHandler } from "../src/chatCommands.js";

describe("chat commands", () => {
  it("emits normalized actions for supported commands", () => {
    const bus = new EventBus();
    const actionListener = vi.fn();
    bus.on("action", actionListener);
    const handleChat = createChatCommandHandler(bus, 2_000, () => 1_000);

    handleChat(chatEvent("  !DaNcE  "));

    expect(actionListener).toHaveBeenCalledWith({
      type: "action",
      timestamp: 123,
      userId: "user-1",
      displayName: "Townie",
      action: "dance",
    });
  });

  it("rate limits commands per user and permits other users", () => {
    const bus = new EventBus();
    const actionListener = vi.fn();
    bus.on("action", actionListener);
    let timestamp = 0;
    const handleChat = createChatCommandHandler(bus, 2_000, () => timestamp);

    handleChat(chatEvent("!jump", "user-1"));
    timestamp = 500;
    handleChat(chatEvent("!wave", "user-1"));
    handleChat(chatEvent("!sit", "user-2"));
    timestamp = 2_000;
    handleChat(chatEvent("!wave", "user-1"));

    expect(actionListener.mock.calls.map(([event]) => event.action)).toEqual([
      "jump",
      "sit",
      "wave",
    ]);
  });

  it("ignores ordinary messages and unsupported commands", () => {
    const bus = new EventBus();
    const actionListener = vi.fn();
    bus.on("action", actionListener);
    const handleChat = createChatCommandHandler(bus);

    handleChat(chatEvent("hello"));
    handleChat(chatEvent("!dance now"));

    expect(actionListener).not.toHaveBeenCalled();
  });
});

function chatEvent(message: string, userId = "user-1") {
  return {
    type: "chat" as const,
    timestamp: 123,
    userId,
    displayName: "Townie",
    message,
  };
}
