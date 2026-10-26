# Chat Town project guide

## Stack

Chat Town is a Node.js application written in TypeScript. The planned application stack is:

- Express for HTTP routes and middleware.
- `ws` for WebSocket connections.
- PixiJS loaded from a CDN in the browser client; do not bundle PixiJS as an npm dependency.
- Twurple for Twitch API and chat integrations.
- `better-sqlite3` for local SQLite persistence.
- `tsx` for running TypeScript directly during development and simulation.
- Vitest for the unit test suite.
- Vite 7 as Vitest's runtime dependency.
- ESLint and Prettier for linting and formatting.

The repository currently contains the TypeScript scaffold and development tooling. Add application modules within the structure below as the features are implemented.

## Folder structure

- `src/` — application TypeScript source and runtime entry points.
- `public/` — static files served by the Express server.
- `test/` — automated tests, using Vitest.
- `dist/` — compiled JavaScript output from the build; generated and ignored by Git.
- `package.json` and `package-lock.json` — scripts and dependency manifest/lockfile.
- `.npmrc` — npm's peer-dependency setting for reproducible installs with the current npm resolver.
- `tsconfig.json` — TypeScript compiler settings.
- `eslint.config.js` — ESLint configuration.
- `.prettierrc.json` — Prettier formatting preferences.

Keep future server, browser-client, and persistence code organized under `src/` in small, focused modules. Keep tests under `test/` and mirror the source areas they cover where useful.

## Commands

- `npm install` — install dependencies.
- `npm run dev` — run the app with `tsx` watch mode.
- `npm run build` — compile `src/` into `dist/`.
- `npm start` — run the compiled app.
- `npm test` — run the Vitest unit test suite.
- `npm run sim` — post fake events to the running server; accept `--type` and event-specific options such as `--viewers`.
- `npm run lint` — lint the project with ESLint.
- `npm run format` — format files with Prettier.
- `npm run format:check` — check formatting without changing files.

## Rules

- Never put secrets, credentials, access tokens, or private keys in source code or committed configuration. Use environment variables and keep local `.env` files untracked.
- Keep files small and focused. Split unrelated responsibilities into separate modules.
- Add tests for logic, especially behavior with meaningful branches, parsing, state changes, or error handling.
- Ask before adding dependencies. Prefer existing platform features and installed packages when they meet the need.
