import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { config } from "./config.js";
import {
  CHAT_TOWN_EVENT_TYPES,
  type ChatTownEvent,
  type ChatTownEventType,
} from "./bus.js";

export type SimulationType = ChatTownEventType | "all";

export interface SimulationRequest {
  type: SimulationType;
  viewers?: number;
  username?: string;
  message?: string;
}

export interface SimulatorCliOptions extends SimulationRequest {
  url: string;
}

const names = ["MapleFox", "PixelPanda", "RiverOtter", "CozyComet"];
const messages = [
  "Hello, town!",
  "Great stream!",
  "Joining the fun!",
  "Nice work!",
];
const subscriptionTiers = ["1000", "2000", "3000"];
const bitAmounts = [100, 250, 500, 1000];

export function parseSimulationRequest(
  value: unknown,
): SimulationRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const body = value as Record<string, unknown>;
  const type = body.type ?? "all";
  if (
    typeof type !== "string" ||
    (type !== "all" && !isChatTownEventType(type))
  ) {
    return null;
  }

  const viewers = body.viewers;
  if (
    viewers !== undefined &&
    (typeof viewers !== "number" ||
      !Number.isInteger(viewers) ||
      viewers < 1 ||
      viewers > 100_000)
  ) {
    return null;
  }

  const username = body.username;
  if (
    username !== undefined &&
    (typeof username !== "string" ||
      username.trim().length < 1 ||
      username.length > 25)
  ) {
    return null;
  }
  const message = body.message;
  if (
    message !== undefined &&
    (typeof message !== "string" ||
      message.trim().length < 1 ||
      message.length > 500)
  ) {
    return null;
  }

  return {
    type,
    ...(viewers === undefined ? {} : { viewers }),
    ...(username === undefined ? {} : { username: username.trim() }),
    ...(message === undefined ? {} : { message: message.trim() }),
  };
}

export function parseSimulatorArgs(args: string[]): SimulatorCliOptions {
  let type: SimulationType = "all";
  let viewers: number | undefined;
  let url = `http://127.0.0.1:${config.port}`;

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];

    if (option === "--type") {
      if (!value || (value !== "all" && !isChatTownEventType(value))) {
        throw new Error(`Invalid --type value: ${value ?? "missing"}`);
      }
      type = value;
      index += 1;
    } else if (option === "--viewers") {
      const parsedViewers = Number(value);
      if (
        !value ||
        !Number.isInteger(parsedViewers) ||
        parsedViewers < 1 ||
        parsedViewers > 100_000
      ) {
        throw new Error("--viewers must be an integer from 1 to 100000");
      }
      viewers = parsedViewers;
      index += 1;
    } else if (option === "--url") {
      if (!value) throw new Error("--url requires a server URL");
      const parsedUrl = new URL(value);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error("--url must use http or https");
      }
      url = parsedUrl.origin;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${option}`);
    }
  }

  return { type, ...(viewers === undefined ? {} : { viewers }), url };
}

export function generateFakeEvents(
  request: SimulationRequest = { type: "all" },
  random: () => number = Math.random,
  now: () => number = Date.now,
): ChatTownEvent[] {
  const types = request.type === "all" ? CHAT_TOWN_EVENT_TYPES : [request.type];

  return types.map((type, index) => {
    const displayName = request.username ?? choose(names, random);
    const identity = {
      userId: request.username
        ? `sim-${request.username.trim().toLowerCase()}`
        : `fake-${Math.floor(random() * 1_000_000)}`,
      displayName,
    };
    const timestamp = now() + index;

    switch (type) {
      case "chat":
        return {
          type,
          timestamp,
          ...identity,
          message: request.message ?? choose(messages, random),
        };
      case "follow":
        return { type, timestamp, ...identity };
      case "sub":
        return {
          type,
          timestamp,
          ...identity,
          tier: choose(subscriptionTiers, random),
          months: randomInteger(1, 24, random),
        };
      case "bits":
        return {
          type,
          timestamp,
          ...identity,
          amount: choose(bitAmounts, random),
        };
      case "raid":
        return {
          type,
          timestamp,
          ...identity,
          viewerCount: request.viewers ?? randomInteger(5, 100, random),
        };
      case "levelup":
        return {
          type,
          timestamp,
          ...identity,
          level: randomInteger(2, 20, random),
        };
    }
  });
}

async function runCli(args: string[]): Promise<void> {
  if (args.includes("--help")) {
    console.log(
      "Usage: npm run sim -- [--type all|chat|follow|sub|bits|raid|levelup] [--viewers count] [--url server-url]",
    );
    return;
  }

  const { url, ...request } = parseSimulatorArgs(args);
  const response = await fetch(new URL("/api/sim", url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(
      `Simulation request failed: ${response.status} ${response.statusText}`,
    );
  }

  const result = (await response.json()) as { events: ChatTownEvent[] };
  for (const event of result.events) console.log(JSON.stringify(event));
}

function choose<T>(values: readonly T[], random: () => number): T {
  return values[Math.floor(random() * values.length)]!;
}

function randomInteger(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function isChatTownEventType(value: string): value is ChatTownEventType {
  return CHAT_TOWN_EVENT_TYPES.some((type) => type === value);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
