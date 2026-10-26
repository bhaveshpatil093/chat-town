import type { ChatTownEvent, EventBus } from "./bus.js";

export const CHAT_ACTIONS = ["dance", "jump", "wave", "sit"] as const;
export type ChatAction = (typeof CHAT_ACTIONS)[number];

const COMMAND_PREFIX = "!";
const DEFAULT_RATE_LIMIT_MS = 2_000;
const MAX_TRACKED_USERS = 10_000;

export function createChatCommandHandler(
  bus: EventBus,
  rateLimitMs = DEFAULT_RATE_LIMIT_MS,
  now: () => number = Date.now,
): (event: ChatTownEvent<"chat">) => void {
  const lastActionAt = new Map<string, number>();
  let acceptedCommands = 0;

  return (event) => {
    const command = event.message.trim().toLowerCase();
    if (!command.startsWith(COMMAND_PREFIX)) return;
    const action = command.slice(1);
    if (!isChatAction(action)) return;

    const timestamp = now();
    const previous = lastActionAt.get(event.userId);
    if (previous !== undefined && timestamp - previous < rateLimitMs) return;

    lastActionAt.set(event.userId, timestamp);
    acceptedCommands += 1;
    if (acceptedCommands % 128 === 0 || lastActionAt.size > MAX_TRACKED_USERS) {
      for (const [userId, lastAt] of lastActionAt) {
        if (timestamp - lastAt > rateLimitMs * 5) lastActionAt.delete(userId);
      }
      while (lastActionAt.size > MAX_TRACKED_USERS) {
        const oldestUserId = lastActionAt.keys().next().value;
        if (oldestUserId === undefined) break;
        lastActionAt.delete(oldestUserId);
      }
    }

    bus.emit({
      type: "action",
      timestamp: event.timestamp,
      userId: event.userId,
      displayName: event.displayName,
      action,
    });
  };
}

function isChatAction(value: string): value is ChatAction {
  return CHAT_ACTIONS.some((action) => action === value);
}
