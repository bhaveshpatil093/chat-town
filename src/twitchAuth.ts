import "./config.js";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import {
  RefreshingAuthProvider,
  type AccessToken,
  type AccessTokenWithUserId,
} from "@twurple/auth";

export const TWITCH_CHAT_INTENT = "chat";
export const REQUIRED_TWITCH_SCOPES = [
  "user:read:chat",
  "moderator:read:followers",
  "channel:read:subscriptions",
  "bits:read",
] as const;
export const TWITCH_TOKEN_PATH = resolve(
  process.cwd(),
  "data/twitch-token.json",
);
export const DEFAULT_TWITCH_REDIRECT_URI = "http://localhost:3001/callback";

const credentialsSchema = z.object({
  TWITCH_CLIENT_ID: z.string().trim().min(1),
  TWITCH_CLIENT_SECRET: z.string().trim().min(1),
  TWITCH_REDIRECT_URI: z
    .string()
    .trim()
    .min(1)
    .default(DEFAULT_TWITCH_REDIRECT_URI),
});

const storedTokenSchema = z.object({
  userId: z.string().min(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).nullable(),
  scope: z.array(z.string()),
  expiresIn: z.number().nonnegative().nullable(),
  obtainmentTimestamp: z.number().nonnegative(),
});

export type TwitchOAuthCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type StoredTwitchToken = AccessTokenWithUserId;
let runtimeAuthProvider: RefreshingAuthProvider | null = null;

export function parseTwitchOAuthCredentials(
  environment: NodeJS.ProcessEnv,
): TwitchOAuthCredentials {
  const result = credentialsSchema.safeParse(environment);
  if (!result.success) {
    const missing = result.error.issues
      .map((issue) => issue.path[0])
      .filter(
        (key) => key === "TWITCH_CLIENT_ID" || key === "TWITCH_CLIENT_SECRET",
      );
    if (missing.length) {
      throw new Error(
        "Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env before running npm run twitch:login.",
      );
    }
    throw new Error(
      "TWITCH_REDIRECT_URI must be a valid non-empty URL registered in the Twitch Developer Console.",
    );
  }

  return {
    clientId: result.data.TWITCH_CLIENT_ID,
    clientSecret: result.data.TWITCH_CLIENT_SECRET,
    redirectUri: result.data.TWITCH_REDIRECT_URI,
  };
}

export function parseStoredTwitchToken(value: unknown): StoredTwitchToken {
  const result = storedTokenSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      "The Twitch token file is invalid. Run npm run twitch:login to create a new one.",
    );
  }
  return result.data;
}

export async function saveTwitchToken(
  token: StoredTwitchToken,
  path = TWITCH_TOKEN_PATH,
): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(token, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, path);
  await chmod(path, 0o600);
}

export async function loadStoredTwitchToken(
  path = TWITCH_TOKEN_PATH,
): Promise<StoredTwitchToken> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "No Twitch token found. Run npm run twitch:login to connect your Twitch account.",
        { cause: error },
      );
    }
    throw error;
  }

  try {
    return parseStoredTwitchToken(JSON.parse(contents) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        "The Twitch token file is not valid JSON. Run npm run twitch:login to replace it.",
        { cause: error },
      );
    }
    throw error;
  }
}

export function createRefreshingAuthProvider(
  credentials: TwitchOAuthCredentials,
  tokenPath = TWITCH_TOKEN_PATH,
): RefreshingAuthProvider {
  const provider = new RefreshingAuthProvider({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    redirectUri: credentials.redirectUri,
  });
  provider.onRefresh(async (userId, token) => {
    await saveTwitchToken({ userId, ...token }, tokenPath);
  });
  provider.onRefreshFailure((userId, error) => {
    console.error(
      `[Chat Town] Twitch token refresh failed for user ${userId}: ${error.message}`,
    );
  });
  return provider;
}

export async function loadRefreshingAuthProvider(
  tokenPath = TWITCH_TOKEN_PATH,
): Promise<{ provider: RefreshingAuthProvider; userId: string }> {
  const credentials = parseTwitchOAuthCredentials(process.env);
  const token = await loadStoredTwitchToken(tokenPath);
  const provider = createRefreshingAuthProvider(credentials, tokenPath);
  provider.addUser(token.userId, token as AccessToken, [TWITCH_CHAT_INTENT]);
  const usableToken = await provider.getAccessTokenForUser(token.userId, [
    ...REQUIRED_TWITCH_SCOPES,
  ]);
  if (!usableToken) {
    throw new Error(
      "The saved Twitch token is missing required scopes. Run npm run twitch:login to authorize again.",
    );
  }
  return { provider, userId: token.userId };
}

export async function initializeTwitchAuth(): Promise<{
  provider: RefreshingAuthProvider;
  userId: string;
} | null> {
  if (!existsSync(TWITCH_TOKEN_PATH)) return null;
  try {
    const auth = await loadRefreshingAuthProvider();
    const { provider, userId } = auth;
    runtimeAuthProvider = provider;
    console.info(`[Chat Town] Twitch auth ready for user ${userId}.`);
    return auth;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[Chat Town] Could not initialize Twitch auth: ${detail}`);
    return null;
  }
}

export function getRuntimeTwitchAuthProvider(): RefreshingAuthProvider | null {
  return runtimeAuthProvider;
}
