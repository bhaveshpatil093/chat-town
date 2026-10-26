import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import {
  createRefreshingAuthProvider,
  parseTwitchOAuthCredentials,
  REQUIRED_TWITCH_SCOPES,
  saveTwitchToken,
  TWITCH_CHAT_INTENT,
} from "./twitchAuth.js";

const LOGIN_TIMEOUT_MS = 5 * 60_000;

async function runLogin(): Promise<void> {
  const credentials = parseTwitchOAuthCredentials(process.env);
  const redirectUri = new URL(credentials.redirectUri);
  assertLoopbackRedirect(redirectUri);

  const state = randomBytes(32).toString("hex");
  const provider = createRefreshingAuthProvider(credentials);
  const authorizationUrl = new URL("https://id.twitch.tv/oauth2/authorize");
  authorizationUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: credentials.clientId,
    redirect_uri: credentials.redirectUri,
    scope: REQUIRED_TWITCH_SCOPES.join(" "),
    state,
  }).toString();

  const server = createServer((request, response) => {
    void handleCallback(request, response, {
      path: redirectUri.pathname,
      state,
      server,
      provider,
      authorizationUrl: authorizationUrl.toString(),
    });
  });

  const port = Number(redirectUri.port);
  server.listen(port, redirectUri.hostname);
  await once(server, "listening");
  const serverClosed = once(server, "close");
  console.log(
    `Opening Twitch login. Make sure this exact redirect URI is registered: ${credentials.redirectUri}`,
  );
  openBrowser(authorizationUrl.toString());

  const timeout = setTimeout(() => {
    server.close();
    console.error("Twitch login timed out after five minutes.");
    process.exitCode = 1;
  }, LOGIN_TIMEOUT_MS);

  try {
    await serverClosed;
  } finally {
    clearTimeout(timeout);
  }
}

async function handleCallback(
  request: IncomingMessage,
  response: ServerResponse,
  options: {
    path: string;
    state: string;
    server: ReturnType<typeof createServer>;
    provider: ReturnType<typeof createRefreshingAuthProvider>;
    authorizationUrl: string;
  },
): Promise<void> {
  if (request.method !== "GET") {
    response.writeHead(405).end("Use the Twitch browser callback.");
    return;
  }
  const callbackUrl = new URL(request.url ?? "/", options.authorizationUrl);
  if (callbackUrl.pathname !== options.path) {
    response.writeHead(404).end("Not found");
    return;
  }

  const returnedState = callbackUrl.searchParams.get("state") ?? "";
  if (!statesMatch(options.state, returnedState)) {
    response
      .writeHead(400)
      .end("Login state did not match. You can close this page.");
    return;
  }

  const oauthError = callbackUrl.searchParams.get("error");
  if (oauthError) {
    response
      .writeHead(400, { "content-type": "text/plain; charset=utf-8" })
      .end(
        `Twitch denied authorization: ${oauthError}. You can close this page.`,
      );
    console.error(`Twitch authorization was denied: ${oauthError}`);
    options.server.close();
    process.exitCode = 1;
    return;
  }

  const code = callbackUrl.searchParams.get("code");
  if (!code) {
    response.writeHead(400).end("Twitch did not return an authorization code.");
    return;
  }

  try {
    const userId = await options.provider.addUserForCode(code, [
      TWITCH_CHAT_INTENT,
    ]);
    const token = await options.provider.getAccessTokenForUser(userId, [
      ...REQUIRED_TWITCH_SCOPES,
    ]);
    if (!token) {
      throw new Error("Twitch did not grant all of the requested scopes.");
    }
    await saveTwitchToken(token);
    response
      .writeHead(200, { "content-type": "text/html; charset=utf-8" })
      .end(
        "<h1>Chat Town is connected to Twitch.</h1><p>You can close this page and return to the terminal.</p>",
      );
    console.log(`Twitch authorization saved for user ${userId}.`);
    options.server.close();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    response
      .writeHead(500, { "content-type": "text/plain; charset=utf-8" })
      .end(`Could not save Twitch authorization: ${detail}`);
    console.error(`Twitch authorization failed: ${detail}`);
    options.server.close();
    process.exitCode = 1;
  }
}

function assertLoopbackRedirect(redirectUri: URL): void {
  if (
    redirectUri.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(redirectUri.hostname) ||
    Number(redirectUri.port) < 1024 ||
    Number(redirectUri.port) > 65_535 ||
    redirectUri.search ||
    redirectUri.hash
  ) {
    throw new Error(
      "TWITCH_REDIRECT_URI must be a local HTTP callback on port 1024-65535, such as http://localhost:3001/callback, registered in the Twitch Developer Console.",
    );
  }
}

function statesMatch(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "rundll32"
        : "xdg-open";
  const args =
    process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.once("error", () => {
    console.log(`If the browser did not open, visit this URL:\n${url}`);
  });
  child.unref();
}

runLogin().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
