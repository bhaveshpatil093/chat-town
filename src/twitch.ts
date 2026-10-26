import { ApiClient } from "@twurple/api";
import { InvalidTokenError, type RefreshingAuthProvider } from "@twurple/auth";
import { EventSubWsListener } from "@twurple/eventsub-ws";
import type { ChatTownEventMap, EventBus } from "./bus.js";
import { sanitizeChatMessage } from "./chatSanitizer.js";
import { recordTwitchEvent, setTwitchConnectionState } from "./twitchStatus.js";

type RealTwitchEvent =
  | ChatTownEventMap["chat"]
  | ChatTownEventMap["follow"]
  | ChatTownEventMap["sub"]
  | ChatTownEventMap["bits"]
  | ChatTownEventMap["raid"];

function publishTwitchEvent(
  bus: EventBus,
  event: RealTwitchEvent,
  summary: string,
): void {
  recordTwitchEvent({
    type: event.type,
    displayName: event.displayName,
    timestamp: event.timestamp,
    summary,
  });
  bus.emit(event);
}

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
  const refreshFailureListener = authProvider.onRefreshFailure(
    (userId, error) => {
      if (
        userId !== authenticatedUserId ||
        !(error instanceof InvalidTokenError)
      ) {
        return;
      }
      setTwitchConnectionState("revoked", error.message);
      console.error(
        `[Chat Town] Twitch authorization is no longer valid for user ${userId}. Run npm run twitch:login, then restart Chat Town.`,
      );
      listener.stop();
    },
  );
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
    const chat = normalizeTwitchChat(
      {
        chatterId: event.chatterId,
        chatterName: event.chatterName,
        chatterDisplayName: event.chatterDisplayName,
        messageText: event.messageText,
      },
      options.blockedWords,
    );
    const messageSummary = chat.blocked
      ? "Message blocked by chat filter"
      : chat.message.length > 90
        ? `${chat.message.slice(0, 87)}…`
        : chat.message;
    publishTwitchEvent(bus, chat, messageSummary);
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
    publishTwitchEvent(
      bus,
      {
        type: "follow",
        timestamp: event.followDate.getTime(),
        userId: event.userId,
        displayName: event.userDisplayName,
      },
      "Followed the channel",
    );
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
    publishTwitchEvent(
      bus,
      {
        type: "sub",
        timestamp: Date.now(),
        userId: event.userId,
        displayName: event.userDisplayName,
        tier: event.tier,
      },
      `Tier ${event.tier} subscription`,
    );
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
    publishTwitchEvent(
      bus,
      {
        type: "bits",
        timestamp: Date.now(),
        userId,
        displayName,
        amount: event.bits,
      },
      `${event.bits} Bits`,
    );
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
    publishTwitchEvent(
      bus,
      {
        type: "raid",
        timestamp: Date.now(),
        userId: event.raidingBroadcasterId,
        displayName: event.raidingBroadcasterDisplayName,
        viewerCount: event.viewers,
      },
      `Incoming raid with ${event.viewers} viewers`,
    );
  });

  listener.onUserSocketConnect((userId) => {
    console.info(`[Chat Town] Twitch WebSocket connected for user ${userId}.`);
  });
  listener.onUserSocketReady((userId) => {
    setTwitchConnectionState("connected");
    console.info(
      `[Chat Town] Twitch EventSub ready for user ${userId}; subscriptions are active.`,
    );
  });
  listener.onUserSocketDisconnect((userId, error) => {
    if (listener.isActive) setTwitchConnectionState("reconnecting");
    const detail = error?.message ?? "Connection closed";
    console.warn(
      `[Chat Town] Twitch WebSocket disconnected for user ${userId}: ${detail}. Twurple will reconnect and restore subscriptions.`,
    );
  });
  listener.onRevoke((subscription, status) => {
    const detail = `EventSub subscription ${subscription.id} was revoked (${status}).`;
    const connectionState =
      status === "authorization_revoked" ? "revoked" : "error";
    setTwitchConnectionState(connectionState, detail);
    console.error(`[Chat Town] ${detail}`);
    if (connectionState === "revoked") listener.stop();
  });

  listener.start();
  setTwitchConnectionState("connecting");
  console.info(
    `[Chat Town] Twitch EventSub listening for ${broadcaster.displayName} (channel ${channelId}; moderator ${authenticatedUserId}).`,
  );
  return () => {
    listener.stop();
    refreshFailureListener.unbind();
  };
}
