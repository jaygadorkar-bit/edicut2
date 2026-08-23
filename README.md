# EdiCut

EdiCut is a video editing platform for YouTube creators. This repository is a pnpm monorepo with the web app, shared packages, and a compatibility API package.

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

Start the web-only local container. It reads the live database and Cloudinary configuration from `.env.cloudflare`:

```bash
docker compose up --build web
```

The Docker development profile disables the production-domain reCAPTCHA keys for `localhost`; production re-enables them through its Cloudflare environment.

Docker exposes:

- Web: `http://localhost:3000`

The local Postgres and Node API containers are not part of the Docker workflow. The previous Postgres volume is retained but is no longer mounted or started.

## Quality

```bash
pnpm typecheck
pnpm build
pnpm health
```
