# EdiCut

EdiCut is a video editing platform for YouTube creators. This repository is a pnpm monorepo with one frontend, one Node API, and shared packages.

## Workspace

- `apps/web`: the only frontend app. React Router 7, Vite, Tailwind, Cloudflare Worker deployment.
- `apps/node-api`: Hono API for backend endpoints.
- `packages/shared`: shared contracts and utilities.
- `packages/db`: Drizzle/PostgreSQL data layer.
- `packages/platform-core`: shared platform logic, including auth-oriented helpers.

## Local Development

Install dependencies:

```bash
pnpm install
```

Run the frontend on the single standard local port:

```bash
pnpm dev
```

Frontend URL: `http://localhost:3000`

Run the Node API:

```bash
pnpm dev:node-api
```

API URL: `http://localhost:8787/api/node`

## Docker

Start the local stack:

```bash
docker compose up --build
```

Docker exposes:

- Web: `http://localhost:3000`
- Node API: `http://localhost:8787/api/node`
- Postgres: `localhost:5432`

## Quality

```bash
pnpm typecheck
pnpm build
pnpm health
```
