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
});

export interface AppConfig {
  port: number;
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

  return { port: result.data.PORT };
}

export const config = parseConfig(process.env);
