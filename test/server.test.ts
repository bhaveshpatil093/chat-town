import { once } from "node:events";
import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createChatTownServer, type ChatTownServer } from "../src/server.js";
import { EventBus, type ChatTownEvent } from "../src/bus.js";

describe("Chat Town server", () => {
  let chatTownServer: ChatTownServer | undefined;

  afterEach(async () => {
    await chatTownServer?.close();
    chatTownServer = undefined;
  });

  it("serves files from the public directory", async () => {
    chatTownServer = createChatTownServer();
    await listen(chatTownServer);

    const response = await fetch(serverUrl(chatTownServer));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<h1>Chat Town</h1>");
  });

  it("broadcasts every normalized event to connected clients as JSON", async () => {
    const bus = new EventBus();
    chatTownServer = createChatTownServer(bus);
    await listen(chatTownServer);

    const client = new WebSocket(webSocketUrl(chatTownServer));
    await once(client, "open");

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
      {
        type: "levelup",
        timestamp: 6,
        userId: "user-1",
        displayName: "Townie",
        level: 2,
      },
    ];

    for (const event of events) {
      const messageReceived = once(client, "message");
      bus.emit(event);
      const [payload] = await messageReceived;
      expect(JSON.parse(payload.toString())).toEqual(event);
    }
  });
});

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
