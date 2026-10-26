import { once } from "node:events";
import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createChatTownServer, type ChatTownServer } from "../src/server.js";
import { EventBus, type ChatTownEvent } from "../src/bus.js";
import { createDatabase } from "../src/db.js";

describe("Chat Town server", () => {
  let chatTownServer: ChatTownServer | undefined;

  afterEach(async () => {
    await chatTownServer?.close();
    chatTownServer = undefined;
  });

  it("serves files from the public directory", async () => {
    chatTownServer = createTestServer();
    await listen(chatTownServer);

    const response = await fetch(serverUrl(chatTownServer));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<h1>Chat Town</h1>");
  });

  it("reports application health and Twitch connection status", async () => {
    chatTownServer = createTestServer();
    await listen(chatTownServer);

    const health = await fetch(`${serverUrl(chatTownServer)}health`);
    const twitchStatus = await fetch(
      `${serverUrl(chatTownServer)}api/twitch/status`,
    );

    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok" });
    expect(twitchStatus.status).toBe(200);
    expect(await twitchStatus.json()).toMatchObject({
      connectionState: expect.any(String),
      recentEvents: [],
    });
  });

  it("broadcasts every normalized event to connected clients as JSON", async () => {
    const bus = new EventBus();
    chatTownServer = createTestServer(bus);
    await listen(chatTownServer);

    const client = new WebSocket(webSocketUrl(chatTownServer));
    await once(client, "open");
    const receivedEvents: ChatTownEvent[] = [];
    client.on("message", (payload) => {
      receivedEvents.push(JSON.parse(payload.toString()) as ChatTownEvent);
    });

    const events: ChatTownEvent[] = [
      {
        type: "chat",
        timestamp: 1,
        userId: "user-1",
        displayName: "Townie",
        message: "Hello!",
      },
      {
        type: "follow",
        timestamp: 2,
        userId: "user-1",
        displayName: "Townie",
      },
      {
        type: "sub",
        timestamp: 3,
        userId: "user-1",
        displayName: "Townie",
        tier: "1",
      },
      {
        type: "bits",
        timestamp: 4,
        userId: "user-1",
        displayName: "Townie",
        amount: 100,
      },
      {
        type: "raid",
        timestamp: 5,
        userId: "user-1",
        displayName: "Townie",
        viewerCount: 20,
      },
    ];

    for (const event of events) {
      bus.emit(event);
      await expect(waitForEvent(receivedEvents, event.type)).resolves.toEqual(
        event,
      );
    }
    expect(
      receivedEvents.some(
        (event) => event.type === "levelup" && event.userId === "user-1",
      ),
    ).toBe(true);
  });

  it("generates and broadcasts events through the simulation route", async () => {
    const bus = new EventBus();
    chatTownServer = createTestServer(bus);
    await listen(chatTownServer);

    const client = new WebSocket(webSocketUrl(chatTownServer));
    await once(client, "open");
    const messageReceived = once(client, "message");
    const response = await fetch(`${serverUrl(chatTownServer)}api/sim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "raid", viewers: 40 }),
    });
    const { events } = (await response.json()) as {
      events: ChatTownEvent[];
    };
    const [payload] = await messageReceived;

    expect(response.status).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "raid", viewerCount: 40 });
    expect(JSON.parse(payload.toString())).toEqual(events[0]);
  });

  it("sanitizes chat before returning and broadcasting the event", async () => {
    const bus = new EventBus();
    chatTownServer = createTestServer(bus);
    await listen(chatTownServer);

    const client = new WebSocket(webSocketUrl(chatTownServer));
    await once(client, "open");
    const messageReceived = once(client, "message");
    const response = await fetch(`${serverUrl(chatTownServer)}api/sim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "chat",
        username: "Townie",
        message: "Hello\u0000 town https://example.com/stream",
      }),
    });
    const { events } = (await response.json()) as {
      events: ChatTownEvent[];
    };
    const [payload] = await messageReceived;

    expect(events[0]).toMatchObject({ type: "chat", message: "Hello town" });
    expect(JSON.parse(payload.toString())).toMatchObject({
      type: "chat",
      message: "Hello town",
    });
  });

  it("rejects invalid simulation requests", async () => {
    chatTownServer = createTestServer();
    await listen(chatTownServer);

    const response = await fetch(`${serverUrl(chatTownServer)}api/sim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "raid", viewers: -1 }),
    });

    expect(response.status).toBe(400);
  });
});

function createTestServer(bus = new EventBus()): ChatTownServer {
  return createChatTownServer(bus, undefined, createDatabase(":memory:"));
}

async function listen(chatTownServer: ChatTownServer): Promise<void> {
  await new Promise<void>((resolveListen) => {
    chatTownServer.httpServer.listen(0, "127.0.0.1", resolveListen);
  });
}

function serverUrl(chatTownServer: ChatTownServer): string {
  const address = chatTownServer.httpServer.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/`;
}

function webSocketUrl(chatTownServer: ChatTownServer): string {
  return serverUrl(chatTownServer).replace("http:", "ws:");
}

async function waitForEvent(
  receivedEvents: ChatTownEvent[],
  expectedType: ChatTownEvent["type"],
): Promise<ChatTownEvent> {
  while (true) {
    const matchingIndex = receivedEvents.findIndex(
      (event) => event.type === expectedType,
    );
    if (matchingIndex >= 0) return receivedEvents.splice(matchingIndex, 1)[0]!;
    await new Promise((resolveNextFrame) => setTimeout(resolveNextFrame, 0));
  }
}
