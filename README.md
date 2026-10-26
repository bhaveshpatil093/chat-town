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

The app defaults to simulator-only mode (`TWITCH_ENABLED=false`) and does not need Twitch credentials to run. To connect live Twitch events, set `TWITCH_ENABLED=true` and `TWITCH_CHANNEL` to the channel login, configure Twitch OAuth, and run `npm run twitch:login` to grant the required scopes. The server reads chat using EventSub `channel.chat.message` and listens for follows, subscriptions, Cheers, and incoming raids using `@twurple/eventsub-ws`. Set `TWITCH_BOT_ACCOUNTS` to a comma-separated list of bot logins or user IDs to ignore; both login and display-name matches are case-insensitive. The control page shows connection state, configured channel, and the most recent live Twitch events. Twitch's EventSub WebSocket client reconnects after unexpected disconnects and restores the active subscriptions when the replacement session becomes ready; Chat Town logs those transitions. Revoked authorization is shown as a stopped connection and requires a new login followed by a server restart. Follows require the authorized account to be the broadcaster or a channel moderator: Twitch's `channel.follow` v2 subscription takes a `moderator_user_id`, which must match the authenticated user ID and have `moderator:read:followers`. The incoming raid subscription filters by `to_broadcaster_user_id` and has no scope requirement. Twitch's current [chat authentication guide](https://dev.twitch.tv/docs/chat/authenticating/), [EventSub subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/), and Twurple's [WebSocket listener guide](https://twurple.js.org/docs/getting-data/eventsub/listener-setup.html) describe these requirements.

SQLite persistence is available through `createDatabase()` in `src/db.ts`. It opens `data/chat-town.sqlite`, applies versioned migrations, and creates the local database directory as needed. The database and its SQLite journal files are ignored by Git. Tests use `createDatabase(":memory:")` so they do not touch local data.

The overlay loads saved viewer profiles and town objects from `/api/town` when it starts. Houses and trees created by follows are stored with their grid position and owner, so regulars' houses remain visible while their characters are away. House styles are updated when a viewer unlocks an upgrade.

Overlay audio is synthesized at runtime with the Web Audio API. Click **Enable sound** once on the overlay to satisfy browser audio permissions; then use the control page's master volume and mute controls. Sound is original generated audio with no external samples or libraries; see [assets/CREDITS.md](assets/CREDITS.md).

Viewer progression is persisted by Twitch user ID. Each chatter earns 5 XP at most once per minute, follows earn 25 XP, subscriptions earn 100 XP per tier, and Cheers earn 1 XP per 10 Bits up to 100 XP per Cheer. Level `n` requires `50 × (n − 1)²` total XP; each level-up emits a `levelup` event and a small overlay celebration. The highest unlocked hat is equipped automatically: beanie at level 2, flower at level 4, and crown at level 7. Regulars receive a gold nameplate at level 5. Homes upgrade from tent at level 1 to cabin at 3, house at 6, and mansion at 10.

With the server running, `npm run sim -- --type raid --viewers 40` sends a fake raid to connected clients. Running `npm run sim` without options sends one event of each type. The control page can generate events through `POST /api/sim`.
