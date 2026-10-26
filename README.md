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

The full-screen overlay is available at `/overlay.html`. Query parameters configure the name labels (`labelSize`, default responsive size, valid values `10`–`48`), the active character cap (`characterCap`, default `150`, valid values `1`–`1000`), and the idle despawn timeout in minutes (`idleMinutes`, default `10`, valid values `1`–`1440`). For example, `/overlay.html?characterCap=80&idleMinutes=5` keeps up to 80 characters and fades out characters after five minutes without a chat message. Characters fade for 800 ms and their Pixi sprite objects are reused. The event control page is available at `/control.html`.

With the server running, `npm run sim -- --type raid --viewers 40` sends a fake raid to connected clients. Running `npm run sim` without options sends one event of each type. The control page can generate events through `POST /api/sim`.
