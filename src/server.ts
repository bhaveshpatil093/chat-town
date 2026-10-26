import { createServer as createHttpServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import express, { type Express } from "express";
import WebSocket, { WebSocketServer } from "ws";
import { CHAT_TOWN_EVENT_TYPES, EventBus, type ChatTownEvent } from "./bus.js";
import { config } from "./config.js";
import { generateFakeEvents, parseSimulationRequest } from "./simulator.js";

export const DEFAULT_PORT = config.port;
export const eventBus = new EventBus();

const PUBLIC_DIRECTORY = fileURLToPath(new URL("../public/", import.meta.url));

export interface ChatTownServer {
  app: Express;
  httpServer: Server;
  webSocketServer: WebSocketServer;
  bus: EventBus;
  close(): Promise<void>;
}

export function createChatTownServer(
  bus = eventBus,
  publicDirectory = PUBLIC_DIRECTORY,
): ChatTownServer {
  const app = express();
  app.use(express.json());

  app.post("/api/sim", (request, response) => {
    const simulation = parseSimulationRequest(request.body);
    if (!simulation) {
      response.status(400).json({
        error:
          "Expected a valid event type and an optional positive viewer count.",
      });
      return;
    }

    const events = generateFakeEvents(simulation);
    for (const event of events) bus.emit(event);
    response.status(200).json({ events });
  });

  app.use(express.static(publicDirectory));

  const httpServer = createHttpServer(app);
  const webSocketServer = new WebSocketServer({ server: httpServer });

  const broadcast = (event: ChatTownEvent): void => {
    const message = JSON.stringify(event);

    for (const client of webSocketServer.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    }
  };

  const unsubscribe = CHAT_TOWN_EVENT_TYPES.map((type) =>
    bus.on(type, broadcast),
  );

  return {
    app,
    httpServer,
    webSocketServer,
    bus,
    async close(): Promise<void> {
      unsubscribe.forEach((removeListener) => removeListener());
      for (const client of webSocketServer.clients) client.terminate();

      await new Promise<void>((resolveClose, rejectClose) => {
        webSocketServer.close((webSocketError) => {
          httpServer.close((httpError) => {
            const error = httpError ?? webSocketError;
            if (error) rejectClose(error);
            else resolveClose();
          });
        });
      });
    },
  };
}

export function startChatTownServer(
  port = DEFAULT_PORT,
  bus = eventBus,
): ChatTownServer {
  const server = createChatTownServer(bus);
  server.httpServer.listen(port, () => {
    console.log(`Chat Town server listening on port ${port}`);
  });
  return server;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  startChatTownServer();
}
