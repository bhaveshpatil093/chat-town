export type TwitchConnectionState =
  | "disabled"
  | "not_configured"
  | "auth_required"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error"
  | "revoked";

export interface TwitchRecentEvent {
  type: "chat" | "follow" | "sub" | "bits" | "raid";
  displayName: string;
  timestamp: number;
  summary: string;
}

export interface TwitchStatus {
  enabled: boolean;
  connectionState: TwitchConnectionState;
  channel: string | null;
  lastConnectedAt: number | null;
  lastError: string | null;
  recentEvents: TwitchRecentEvent[];
}

const MAX_RECENT_EVENTS = 8;
const status: TwitchStatus = {
  enabled: false,
  connectionState: "disabled",
  channel: null,
  lastConnectedAt: null,
  lastError: null,
  recentEvents: [],
};

export function configureTwitchStatus(
  enabled: boolean,
  channel: string | null,
): void {
  status.enabled = enabled;
  status.channel = channel;
  status.connectionState = enabled
    ? channel
      ? "connecting"
      : "not_configured"
    : "disabled";
  status.lastError = null;
  status.lastConnectedAt = null;
  status.recentEvents = [];
}

export function setTwitchConnectionState(
  connectionState: TwitchConnectionState,
  detail?: string,
): void {
  status.connectionState = connectionState;
  if (connectionState === "connected") {
    status.lastConnectedAt = Date.now();
    status.lastError = null;
  } else if (detail) {
    status.lastError = detail;
  }
}

export function recordTwitchEvent(event: TwitchRecentEvent): void {
  status.recentEvents.unshift(event);
  status.recentEvents.length = Math.min(
    status.recentEvents.length,
    MAX_RECENT_EVENTS,
  );
}

export function getTwitchStatus(): TwitchStatus {
  return {
    ...status,
    recentEvents: status.recentEvents.map((event) => ({ ...event })),
  };
}
