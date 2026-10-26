import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const DEFAULT_PORT = 3000;
const envFile = resolve(process.cwd(), ".env");

if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not load .env: ${detail}`, { cause: error });
  }
}

const configSchema = z.object({
  PORT: z.preprocess((value: unknown) => {
    if (value === undefined) return DEFAULT_PORT;
    if (typeof value === "string") return Number(value);
    return value;
  }, z.number().int().min(1).max(65_535)),
  CHAT_BLOCKED_WORDS: z.string().optional().default(""),
  TWITCH_CHANNEL: z.string().trim().optional().default(""),
  TWITCH_BOT_ACCOUNTS: z.string().optional().default(""),
});

export interface AppConfig {
  port: number;
  blockedWords: string[];
  twitchChannel: string | null;
  twitchBotAccounts: string[];
}

export function parseConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const result = configSchema.safeParse(environment);
  if (!result.success) {
    const invalidPort = result.error.issues.some(
      (issue) => issue.path[0] === "PORT",
    );
    const detail = invalidPort
      ? "PORT must be an integer from 1 to 65535."
      : result.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(
      `Invalid environment configuration: ${detail} Check .env or copy .env.example to .env.`,
    );
  }

  const blockedWords = result.data.CHAT_BLOCKED_WORDS.split(",")
    .map((word) => word.trim())
    .filter(Boolean);
  const twitchBotAccounts = result.data.TWITCH_BOT_ACCOUNTS.split(",")
    .map((account) => account.trim().replace(/^@/u, "").toLocaleLowerCase())
    .filter(Boolean);
  return {
    port: result.data.PORT,
    blockedWords,
    twitchChannel: result.data.TWITCH_CHANNEL || null,
    twitchBotAccounts,
  };
}

export const config = parseConfig(process.env);
