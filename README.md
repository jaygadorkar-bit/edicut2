# EdiCut

The professional video editing platform built for high-retention content. This is a monorepo containing the hybrid Cloudflare-first production stack.

## 🚀 Workspace Overview

- **`apps/cf-web`**: Primary Web Application (Next.js 16 + React 19). Deployed on **Cloudflare Pages**.
- **`apps/vercel-api`**: Backend API (Next.js API Routes). Deployed on **Vercel Serverless**.
- **`apps/node-api`**: Alternative Node.js API (Hono).
- **`packages/db`**: Shared data layer (Neon PostgreSQL + Drizzle ORM).
- **`packages/shared`**: Shared TypeScript contracts, validators, and utility logic.
- **`packages/platform-core`**: Core business logic and shared database schemas.

## 🛠️ Local Development

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Set Up Environment
Ensure you have a `.env.local` or `.env.cloudflare` file in the root. Refer to the credentials provided in `docs/project-planning/TECH_STACK.txt`.

### 3. Run the App
To start the primary Next.js web application:
```bash
# Start the Next.js dev server (Port 3000)
pnpm --filter @edicut/cf-web dev
```

To start the Hono API:
```bash
pnpm dev:node-api
```

## 🏗️ Production Stack

- **Frontend**: Next.js 16 on **Cloudflare Edge** (via OpenNext).
- **Backend**: **Vercel Functions** (Full Node.js environment).
- **Database**: **Neon** (Serverless PostgreSQL).
- **Media**: **Cloudinary** (Images) & **YouTube** (Unlisted Video Hosting).
- **Cache**: **Upstash Redis**.

## 📖 Documentation

- **Tech Stack**: [docs/project-planning/TECH_STACK.txt](docs/project-planning/TECH_STACK.txt)
- **Deployment Guide**: [docs/HYBRID_DEPLOYMENT_GUIDE.md](docs/HYBRID_DEPLOYMENT_GUIDE.md)
- **Unified Planning**: [docs/project-planning/UNIFIED_PLANNING.txt](docs/project-planning/UNIFIED_PLANNING.txt)

## 🏗️ Build & Typecheck

```bash
# Build all packages and apps
pnpm build

# Run type checks across the workspace
pnpm typecheck
```
