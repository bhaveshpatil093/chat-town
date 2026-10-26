# Chat Town

A TypeScript Node.js application with an Express and WebSocket server.

## Getting started

```sh
npm install
npm run dev
```

## Scripts

- `npm run dev` starts the server with `tsx` watch mode on port 3000.
- `npm run build` compiles `src/` to `dist/`.
- `npm start` runs the compiled server on port 3000.
- `npm test` runs the Vitest unit test suite.
- `npm run sim` starts the simulation entry point.
- `npm run lint` checks the code with ESLint.
- `npm run format` formats files with Prettier.

The Express server serves static files from `public/`. WebSocket clients connect to the same port and receive every normalized event from the shared `eventBus` as JSON.
