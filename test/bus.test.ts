import { describe, expect, it, vi } from "vitest";
import { EventBus, type ChatTownEvent } from "../src/bus.js";

const chatEvent: ChatTownEvent<"chat"> = {
  type: "chat",
  timestamp: 1_735_689_600_000,
  userId: "user-1",
  displayName: "Townie",
  message: "Hello, town!",
};

describe("EventBus", () => {
  it("dispatches an event to listeners registered for its type", () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on("chat", listener);

    bus.emit(chatEvent);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(chatEvent);
  });

  it("does not dispatch events to listeners for another type", () => {
    const bus = new EventBus();
    const followListener = vi.fn();
    bus.on("follow", followListener);

    bus.emit(chatEvent);

    expect(followListener).not.toHaveBeenCalled();
  });

  it("returns an unsubscribe function from on", () => {
    const bus = new EventBus();
    const listener = vi.fn();
    const unsubscribe = bus.on("chat", listener);

    unsubscribe();
    bus.emit(chatEvent);

    expect(listener).not.toHaveBeenCalled();
  });

  it("supports removing a listener with off", () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on("chat", listener);

    bus.off("chat", listener);
    bus.emit(chatEvent);

    expect(listener).not.toHaveBeenCalled();
  });

  it("allows multiple listeners for the same event", () => {
    const bus = new EventBus();
    const first = vi.fn();
    const second = vi.fn();
    bus.on("chat", first);
    bus.on("chat", second);

    bus.emit(chatEvent);

    expect(first).toHaveBeenCalledWith(chatEvent);
    expect(second).toHaveBeenCalledWith(chatEvent);
  });

  it("dispatches each normalized event type", () => {
    const bus = new EventBus();
    const eventTypes = [
      "chat",
      "follow",
      "sub",
      "bits",
      "raid",
      "levelup",
    ] as const;

    for (const type of eventTypes) {
      const listener = vi.fn();
      bus.on(type, listener);
      const common = {
        type,
        timestamp: 1_735_689_600_000,
        userId: "user-1",
        displayName: "Townie",
      };

      switch (type) {
        case "chat":
          bus.emit({ ...common, message: "Hello!" });
          break;
        case "follow":
          bus.emit(common);
          break;
        case "sub":
          bus.emit({ ...common, tier: "1", months: 3 });
          break;
        case "bits":
          bus.emit({ ...common, amount: 100 });
          break;
        case "raid":
          bus.emit({ ...common, viewerCount: 25 });
          break;
        case "levelup":
          bus.emit({ ...common, level: 2 });
          break;
      }

      expect(listener).toHaveBeenCalledOnce();
    }
  });
});
