import { ApiClient } from "@twurple/api";
import type { RefreshingAuthProvider } from "@twurple/auth";
import { EventSubWsListener } from "@twurple/eventsub-ws";
import type { ChatTownEventMap, EventBus } from "./bus.js";
import { sanitizeChatMessage } from "./chatSanitizer.js";

export interface TwitchChatMessage {
  chatterId: string;
  chatterName: string;
  chatterDisplayName: string;
  messageText: string;
}

export function normalizeTwitchChat(
  event: TwitchChatMessage,
  blockedWords: readonly string[] = [],
  timestamp = Date.now(),
): ChatTownEventMap["chat"] {
  const sanitized = sanitizeChatMessage(event.messageText, blockedWords);
  return {
    type: "chat",
    timestamp,
    userId: event.chatterId,
    displayName: event.chatterDisplayName,
    message: sanitized.message,
    ...(sanitized.blocked ? { blocked: true } : {}),
  };
}

export function isIgnoredTwitchAccount(
  accounts: readonly string[],
  ...identifiers: Array<string | null | undefined>
): boolean {
  const ignored = new Set(accounts.map(normalizeAccount));
  return identifiers.some((identifier) =>
    identifier ? ignored.has(normalizeAccount(identifier)) : false,
  );
}

function normalizeAccount(account: string): string {
  return account.trim().replace(/^@/u, "").toLocaleLowerCase();
}

export interface TwitchListenerOptions {
  channel: string;
  botAccounts: readonly string[];
  blockedWords: readonly string[];
}

/** Connects chat and channel EventSub events to Chat Town's normalized bus. */
export async function startTwitchEventSub(
  bus: EventBus,
  authProvider: RefreshingAuthProvider,
  authenticatedUserId: string,
  options: TwitchListenerOptions,
): Promise<() => void> {
  const apiClient = new ApiClient({ authProvider });
  const broadcaster = await apiClient.users.getUserByName(options.channel);
  if (!broadcaster) {
    throw new Error(`Twitch channel "${options.channel}" was not found.`);
  }

  const channelId = broadcaster.id;
  const listener = new EventSubWsListener({ apiClient });
  listener.onChannelChatMessage(channelId, authenticatedUserId, (event) => {
    if (
      isIgnoredTwitchAccount(
        options.botAccounts,
        event.chatterId,
        event.chatterName,
        event.chatterDisplayName,
      )
    ) {
      return;
    }
    bus.emit(
      normalizeTwitchChat(
        {
          chatterId: event.chatterId,
          chatterName: event.chatterName,
          chatterDisplayName: event.chatterDisplayName,
          messageText: event.messageText,
        },
        options.blockedWords,
      ),
    );
  });
  listener.onChannelFollow(channelId, authenticatedUserId, (event) => {
    if (
      isIgnoredTwitchAccount(
        options.botAccounts,
        event.userId,
        event.userName,
        event.userDisplayName,
      )
    ) {
      return;
    }
    bus.emit({
      type: "follow",
      timestamp: event.followDate.getTime(),
      userId: event.userId,
      displayName: event.userDisplayName,
    });
  });
  listener.onChannelSubscription(channelId, (event) => {
    if (
      isIgnoredTwitchAccount(
        options.botAccounts,
        event.userId,
        event.userName,
        event.userDisplayName,
      )
    ) {
      return;
    }
    bus.emit({
      type: "sub",
      timestamp: Date.now(),
      userId: event.userId,
      displayName: event.userDisplayName,
      tier: event.tier,
    });
  });
  listener.onChannelCheer(channelId, (event) => {
    const userId = event.userId ?? "anonymous";
    const displayName = event.userDisplayName ?? "Anonymous";
    if (
      isIgnoredTwitchAccount(
        options.botAccounts,
        userId,
        event.userName,
        displayName,
      )
    ) {
      return;
    }
    bus.emit({
      type: "bits",
      timestamp: Date.now(),
      userId,
      displayName,
      amount: event.bits,
    });
  });
  listener.onChannelRaidTo(channelId, (event) => {
    if (
      isIgnoredTwitchAccount(
        options.botAccounts,
        event.raidingBroadcasterId,
        event.raidingBroadcasterName,
        event.raidingBroadcasterDisplayName,
      )
    ) {
      return;
    }
    bus.emit({
      type: "raid",
      timestamp: Date.now(),
      userId: event.raidingBroadcasterId,
      displayName: event.raidingBroadcasterDisplayName,
      viewerCount: event.viewers,
    });
  });

  listener.start();
  console.info(
    `[Chat Town] Twitch EventSub listening for ${broadcaster.displayName} (channel ${channelId}; moderator ${authenticatedUserId}).`,
  );
  return () => listener.stop();
}
