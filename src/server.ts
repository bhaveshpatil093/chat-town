import { createServer as createHttpServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import express, { type Express } from "express";
import WebSocket, { WebSocketServer } from "ws";
import { createDatabase } from "./db.js";
import { CHAT_TOWN_EVENT_TYPES, EventBus, type ChatTownEvent } from "./bus.js";
import { createChatCommandHandler } from "./chatCommands.js";
import { sanitizeChatMessage } from "./chatSanitizer.js";
import { config } from "./config.js";
import { generateFakeEvents, parseSimulationRequest } from "./simulator.js";
import { initializeTwitchAuth } from "./twitchAuth.js";
import { startTwitchEventSub } from "./twitch.js";
import { createViewerProgression, cosmeticsForLevel } from "./progression.js";
import { loadTownObjects } from "./townObjects.js";
import {
  configureTwitchStatus,
  getTwitchStatus,
  setTwitchConnectionState,
} from "./twitchStatus.js";

export const DEFAULT_PORT = config.port;
export const eventBus = new EventBus();

const PUBLIC_DIRECTORY = fileURLToPath(new URL("../public/", import.meta.url));

export interface ChatTownServer {
  app: Express;
  httpServer: Server;
  webSocketServer: WebSocketServer;
  bus: EventBus;
  database: ReturnType<typeof createDatabase>;
  close(): Promise<void>;
}

export function createChatTownServer(
  bus = eventBus,
  publicDirectory = PUBLIC_DIRECTORY,
  database = createDatabase(),
): ChatTownServer {
  configureTwitchStatus(config.twitchEnabled, config.twitchChannel);
  const app = express();
  app.use(express.json());
  const audioSettings = { volume: 0.25, muted: false };

  app.get("/health", (_request, response) => {
    response.status(200).json({
      status: "ok",
      twitchEnabled: config.twitchEnabled,
      twitchConnection: getTwitchStatus().connectionState,
    });
  });

  app.get("/api/twitch/status", (_request, response) => {
    response.status(200).json(getTwitchStatus());
  });

  app.get("/api/audio/settings", (_request, response) => {
    response.status(200).json(audioSettings);
  });

  app.post("/api/audio/settings", (request, response) => {
    const { volume, muted } = request.body ?? {};
    if (
      typeof volume !== "number" ||
      !Number.isFinite(volume) ||
      volume < 0 ||
      volume > 1 ||
      typeof muted !== "boolean"
    ) {
      response.status(400).json({
        error: "Expected volume between 0 and 1 and a boolean muted value.",
      });
      return;
    }
    audioSettings.volume = volume;
    audioSettings.muted = muted;
    bus.emit({
      type: "control",
      timestamp: Date.now(),
      command: "audio-settings",
      ...audioSettings,
    });
    response.status(200).json(audioSettings);
  });

  app.get("/api/town", (_request, response) => {
    const viewers = database
      .prepare(
        "SELECT twitch_id, name, xp, level FROM viewers ORDER BY twitch_id",
      )
      .all() as Array<{
      twitch_id: string;
      name: string;
      xp: number;
      level: number;
    }>;
    response.status(200).json({
      viewers: viewers.map((viewer) => ({
        userId: viewer.twitch_id,
        displayName: viewer.name,
        profile: {
          xp: viewer.xp,
          level: viewer.level,
          ...cosmeticsForLevel(viewer.level),
        },
      })),
      townObjects: loadTownObjects(database),
    });
  });

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

  const removeChatSanitizer = bus.on("chat", (event) => {
    if (event.blocked) return;
    const sanitized = sanitizeChatMessage(event.message, config.blockedWords);
    event.message = sanitized.message;
    if (sanitized.blocked) event.blocked = true;
    else delete event.blocked;
  });
  const removeViewerProgression = createViewerProgression(bus, database);
  const unsubscribe = CHAT_TOWN_EVENT_TYPES.map((type) =>
    bus.on(type, broadcast),
  );
  const removeCommandHandler = bus.on("chat", createChatCommandHandler(bus));

  return {
    app,
    httpServer,
    webSocketServer,
    bus,
    database,
    async close(): Promise<void> {
      unsubscribe.forEach((removeListener) => removeListener());
      removeCommandHandler();
      removeChatSanitizer();
      removeViewerProgression();
      for (const client of webSocketServer.clients) client.terminate();

      try {
        await new Promise<void>((resolveClose, rejectClose) => {
          webSocketServer.close((webSocketError) => {
            httpServer.close((httpError) => {
              const error = httpError ?? webSocketError;
              if (error) rejectClose(error);
              else resolveClose();
            });
          });
        });
      } finally {
        database.close();
      }
    },
  };
}

export function startChatTownServer(
  port = DEFAULT_PORT,
  bus = eventBus,
): ChatTownServer {
  const server = createChatTownServer(bus);
  let serverClosed = false;
  let stopTwitch: (() => void) | undefined;
  const closeServer = server.close.bind(server);
  server.close = async () => {
    serverClosed = true;
    stopTwitch?.();
    await closeServer();
  };
  server.httpServer.listen(port, () => {
    console.log(`Chat Town server listening on port ${port}`);
    if (!config.twitchEnabled) {
      console.info(
        "[Chat Town] Simulator-only mode is enabled. Twitch credentials are not required.",
      );
      return;
    }
    if (!config.twitchChannel) {
      setTwitchConnectionState("not_configured");
      console.info(
        "[Chat Town] Twitch events are disabled. Set TWITCH_CHANNEL to enable them.",
      );
      return;
    }
    void initializeTwitchAuth()
      .then((auth) => {
        if (!auth) {
          if (getTwitchStatus().connectionState === "connecting") {
            setTwitchConnectionState("auth_required");
          }
          return;
        }
        if (serverClosed) return;
        return startTwitchEventSub(bus, auth.provider, auth.userId, {
          channel: config.twitchChannel as string,
          botAccounts: config.twitchBotAccounts,
          blockedWords: config.blockedWords,
        }).then((stop) => {
          if (serverClosed) stop();
          else stopTwitch = stop;
        });
      })
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        setTwitchConnectionState("error", detail);
        console.error(`[Chat Town] Twitch EventSub failed to start: ${detail}`);
      });
  });
  return server;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  startChatTownServer();
}
