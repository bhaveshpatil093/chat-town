# Chat Town

A TypeScript Node.js application with an Express and WebSocket server.

## Quick start

```sh
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The server reads `.env` at startup; `PORT` defaults to `3000` and must be an integer from `1` to `65535`.
Use Node.js 20.12 or newer.

## Scripts

- `npm run dev` starts the server with `tsx` watch mode on port 3000.
- `npm run build` compiles `src/` to `dist/`.
- `npm start` runs the compiled server on port 3000.
- `npm test` runs the Vitest unit test suite.
- `npm run sim` emits fake events to the running server.
- `npm run lint` checks the code with ESLint.
- `npm run format` formats files with Prettier.

The Express server serves static files from `public/`. WebSocket clients connect to the same port and receive every normalized event from the shared `eventBus` as JSON.

## Twitch OAuth

Create an application in the Twitch Developer Console and register `http://localhost:3001/callback` as its OAuth redirect URL. Put its client ID and client secret in `.env`, then run `npm run twitch:login`. The command opens Twitch in your browser and saves the refreshable user token to `data/twitch-token.json`; the file is git-ignored and written with owner-only permissions. The server loads the token at startup and Twurple refreshes it when it is due, persisting the updated token automatically.

Chat Town requests only these user scopes for its current event set: `user:read:chat` for EventSub chat messages, `moderator:read:followers` for follows, `channel:read:subscriptions` for subscriptions, and `bits:read` for Cheers. Twitch lists these requirements for [chat authentication](https://dev.twitch.tv/docs/chat/authenticating/), [EventSub subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/), and [access token scopes](https://dev.twitch.tv/docs/authentication/scopes/).

The full-screen overlay is available at `/overlay.html`. Query parameters configure the name labels (`labelSize`, default responsive size, valid values `10`–`48`), the active character cap (`characterCap`, default `150`, valid values `1`–`1000`), the idle despawn timeout in minutes (`idleMinutes`, default `10`, valid values `1`–`1440`), and the full day/night cycle in minutes (`cycleMinutes`, default `10`, valid values `1`–`1440`). For example, `/overlay.html?characterCap=80&idleMinutes=5&cycleMinutes=20` keeps up to 80 characters, fades out idle characters after five minutes, and completes a day-to-night-to-day cycle in 20 minutes. Chat messages `!dance`, `!jump`, `!wave`, and `!sit` trigger character actions, rate-limited to one action per user every two seconds. Chat messages are cleaned of URLs, control characters, and excessive combining marks and emoji, capped at 240 graphemes, and blocked when they contain a configured word or phrase. Set `CHAT_BLOCKED_WORDS=word,phrase to block` in `.env` to configure whole-message blocking. The event control page is available at `/control.html`; its day/night buttons transition the scene and reset the cycle timer from the selected phase. Its panic button hides the overlay canvas, and the remove-character button fades out the character matching the username field.

To connect live Twitch events, set `TWITCH_CHANNEL` to the channel login, configure Twitch OAuth, and run `npm run twitch:login` again to grant the required scopes. The server then reads chat using EventSub `channel.chat.message` and listens for follows, subscriptions, Cheers, and incoming raids using `@twurple/eventsub-ws`. Set `TWITCH_BOT_ACCOUNTS` to a comma-separated list of bot logins or user IDs to ignore; both login and display-name matches are case-insensitive. Follows require the authorized account to be the broadcaster or a channel moderator: Twitch's `channel.follow` v2 subscription takes a `moderator_user_id`, which must match the authenticated user ID and have `moderator:read:followers`. The incoming raid subscription filters by `to_broadcaster_user_id` and has no scope requirement. Twitch's current [chat authentication guide](https://dev.twitch.tv/docs/chat/authenticating/), [EventSub subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/), and Twurple's [WebSocket listener guide](https://twurple.js.org/docs/getting-data/eventsub/listener-setup.html) describe these requirements.

With the server running, `npm run sim -- --type raid --viewers 40` sends a fake raid to connected clients. Running `npm run sim` without options sends one event of each type. The control page can generate events through `POST /api/sim`.
