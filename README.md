# airdrop-farm

An Electron application with React and TypeScript, plus a marketplace server for scripts and account templates.

## Project Layout

- `client/` — Electron desktop app (main / preload / renderer)
- `server/` — Marketplace server (Express + SQLite, port 3400)

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Client (Electron app)

```bash
cd client
npm install
npm run dev          # development
npm run typecheck    # tsc --noEmit for main + renderer
npm run lint         # eslint --cache .
npm test             # vitest run
npm run build        # full build (typecheck + electron-vite)
npm run build:win    # platform installers
npm run build:mac
npm run build:linux
```

## Server (marketplace)

```bash
cd server
npm install
npm run dev          # tsx watch, listens on http://localhost:3400
npm run build        # tsc to dist/
npm start            # node dist/index.js
```

The marketplace database starts empty. Scripts and templates are added by developers via the client's upload UI (Templates page) or by `POST /api/scripts` / `POST /api/templates`.

## End-to-end local development

In two terminals:

```bash
# terminal 1
cd server && npm run dev

# terminal 2
cd client && npm run dev
```

The client fetches scripts and templates from `http://127.0.0.1:3400` (configurable via Settings → `marketplace_server_url`).