# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Install dependencies

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build              # Build all targets
npm run build:win         # Build for Windows
npm run build:mac         # Build for macOS
npm run build:linux       # Build for Linux
npm run build:unpack      # Build unpacked directory
```

### Type checking

```bash
npm run typecheck                    # Check both main and renderer
npm run typecheck:node               # Check main process only
npm run typecheck:web                # Check renderer only
```

### Linting and formatting

```bash
npm run lint                         # Run ESLint
npm run format                       # Run Prettier write
```

### Testing

```bash
npm run test                         # Run all tests
npm run test:watch                   # Watch mode
npm run test:coverage                # Coverage report
```

### Rebuild native modules (better-sqlite3)

```bash
npm run rebuild:electron            # Rebuild for Electron
npm run rebuild:node                # Rebuild for Node
```

## Architecture

### Overview

Airdrop Farm is a full-stack desktop application for managing crypto airdrop operations. Built with:

- **Electron** - Desktop shell
- **React 19 + TypeScript** - Frontend UI
- **better-sqlite3** - Local data persistence
- **Tailwind CSS v4** - Styling
- **electron-vite** - Build tooling

### Directory Structure

```
src/
├── main/             # Electron main process (Node.js)
│   ├── index.ts      # App entry, window lifecycle, service init
│   ├── ipc/          # Unified API handler registry (IPC + HTTP shared)
│   ├── httpapi/      # HTTP API server (port 34116-34126)
│   ├── services/     # Business logic
│   │   └── repositories/  # Data access layer for SQLite
│   └── utils/        # Logger and utilities
├── preload/          # Context bridge exposes electronAPI to renderer
├── renderer/         # React frontend
│   └── src/
│       ├── api.ts        # Typed API client (uses transport)
│       ├── transport.ts  # Dual transport: IPC → HTTP auto-fallback
│       ├── components/   # Shared UI components
│       ├── pages/        # Page components (one per route)
│       ├── hooks/        # Custom React hooks
│       ├── contexts/     # React contexts
│       ├── i18n/         # Internationalization
│       ├── types/        # Frontend type definitions
│       └── utils/        # Frontend utilities
└── shared/
    └── types/        # Shared TypeScript interfaces (used by both processes)
```

### Communication Architecture

**Dual transport with automatic fallback**:

1. **IPC (primary)** — `window.electronAPI.invoke(channel, ...args)` via Electron context bridge
2. **HTTP (fallback)** — `POST http://127.0.0.1:PORT/api/call {channel, args}`

Both transports share the same `handlerMap` in `src/main/ipc/index.ts`. The `executeHandler()` function is the single entry point for all API calls regardless of transport.

**Transport selection logic** (in `src/renderer/src/transport.ts`):

- Force mode: URL param `?transport=http` or `localStorage['app-transport']`
- Auto mode: Try IPC first → fallback to HTTP → remember working transport

**Adding a new API endpoint**:

1. Add handler in `src/main/ipc/index.ts` via `register('channel:name', handler)`
2. Add typed method in `src/renderer/src/api.ts` using `call<T>('channel:name', [args])`
3. Both IPC and HTTP automatically support the new endpoint

### Database

SQLite via `better-sqlite3` stored at `userData/airdrop-farm.db`.

**Tables**:

- `wallets` — EVM/Solana/SUI/Bitcoin wallets (supports HD derivation)
- `accounts` — Created accounts from templates
- `proxies` — Configured proxies
- `tasks` — Running/pending automation tasks
- `task_logs` — Task output logs
- `templates` — Account templates
- `task_templates` — Automation task templates
- `scheduled_tasks` — Cron-scheduled tasks
- `airdrop_projects` — Track airdrop projects
- `settings` — Key-value app settings
- `captcha_keys` — CAPTCHA API keys
- `proxy_providers` — Proxy provider configurations
- `app_logs` — Application logging

All JSON fields are automatically serialized/deserialized by `StoreService`. Database operations use synchronous better-sqlite3 API, no async/await needed.

### Supported Blockchains

- EVM (via ethers.js)
- Solana (via @solana/web3.js)
- SUI (via @mysten/sui.js)
- Bitcoin (via bitcoinjs-lib)

## Development Guidelines

- All API calls from frontend must go through `transport.ts` → `api.ts` — never call `window.electronAPI` directly from components
- All new API endpoints must be registered in `handlerMap` via `register()` in `src/main/ipc/index.ts`
- Use the `useApi` hook for component-level API calls with loading/error state
- Follow existing patterns for database operations in `StoreService`
- Use prepared statements for all queries
- Database uses WAL mode and foreign keys enabled
- All entities use UUID v4 for IDs
- Dates are stored in ISO 8601 format
