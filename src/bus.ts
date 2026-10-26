export interface UserIdentity {
  userId: string;
  displayName: string;
}

interface BaseEvent<T extends string> {
  type: T;
  timestamp: number;
}

export interface ChatTownEventMap {
  chat: BaseEvent<"chat"> &
    UserIdentity & { message: string; blocked?: boolean };
  action: BaseEvent<"action"> &
    UserIdentity & {
      action: "dance" | "jump" | "wave" | "sit";
    };
  scene: BaseEvent<"scene"> & { scene: "day" | "night" };
  control: BaseEvent<"control"> &
    (
      | { command: "panic" | "restore" }
      | { command: "remove-character"; displayName: string }
    );
  follow: BaseEvent<"follow"> & UserIdentity;
  sub: BaseEvent<"sub"> & UserIdentity & { tier: string; months?: number };
  bits: BaseEvent<"bits"> & UserIdentity & { amount: number };
  raid: BaseEvent<"raid"> & UserIdentity & { viewerCount: number };
  levelup: BaseEvent<"levelup"> & UserIdentity & { level: number };
}

export type ChatTownEventType = keyof ChatTownEventMap;
export type SimulatableEventType = Exclude<
  ChatTownEventType,
  "action" | "scene" | "control"
>;
export const CHAT_TOWN_EVENT_TYPES = [
  "chat",
  "action",
  "scene",
  "control",
  "follow",
  "sub",
  "bits",
  "raid",
  "levelup",
] as const satisfies readonly ChatTownEventType[];
export const SIMULATABLE_EVENT_TYPES = [
  "chat",
  "follow",
  "sub",
  "bits",
  "raid",
  "levelup",
] as const satisfies readonly SimulatableEventType[];
export type ChatTownEvent<K extends ChatTownEventType = ChatTownEventType> =
  ChatTownEventMap[K];
export type EventListener<K extends ChatTownEventType> = (
  event: ChatTownEvent<K>,
) => void;

type AnyEventListener = (event: ChatTownEvent) => void;

export class EventBus {
  private readonly listeners = new Map<
    ChatTownEventType,
    Set<AnyEventListener>
  >();

  on<K extends ChatTownEventType>(
    type: K,
    listener: EventListener<K>,
  ): () => void {
    const listeners = this.listeners.get(type) ?? new Set<AnyEventListener>();
    listeners.add(listener as AnyEventListener);
    this.listeners.set(type, listeners);

    return () => this.off(type, listener);
  }

  off<K extends ChatTownEventType>(type: K, listener: EventListener<K>): void {
    const listeners = this.listeners.get(type);
    if (!listeners) return;

    listeners.delete(listener as AnyEventListener);
    if (listeners.size === 0) this.listeners.delete(type);
  }

  emit<K extends ChatTownEventType>(event: ChatTownEvent<K>): void {
    const listeners = this.listeners.get(event.type);
    if (!listeners) return;

    for (const listener of listeners) listener(event);
  }
}
