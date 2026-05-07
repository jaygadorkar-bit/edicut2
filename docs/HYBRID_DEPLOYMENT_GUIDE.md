# EdiCut Deployment Guide

The repository now has one frontend application:

- `apps/web`: React Router 7 + Vite + Tailwind, deployed with the Cloudflare Worker in `apps/web/workers/app.ts`.

The backend API is separate:

- `apps/node-api`: Hono service exposed locally at `http://localhost:8787/api/node`.

## Local Ports

- Web: `http://localhost:3000`
- Node API: `http://localhost:8787/api/node`
- Postgres in Docker: `localhost:5432`

## Local Commands

```bash
pnpm install
pnpm dev
pnpm dev:node-api
```

## Docker

```bash
docker compose up --build
```

The Docker image installs workspace dependencies at build time. Container startup only builds shared workspace packages and starts the relevant dev server, so restarts are faster and port behavior is stable.

## Build And Deploy

```bash
pnpm --filter @edicut/web build
pnpm --filter @edicut/web deploy
```

The web build writes React Router output to `apps/web/build`, which Wrangler serves through the configured Worker assets binding.
