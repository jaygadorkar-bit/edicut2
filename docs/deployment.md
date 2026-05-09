# Deployment Guide

Last updated: 2026-05-09

## Prerequisites

- Node.js 20+ and pnpm installed
- GitHub CLI authenticated for `jaygadorkar-bit/edicut2`
- Vercel project linked locally in `.vercel/project.json`
- Cloudflare account with API credentials configured in `.env` at the repo root (`CLOUDFLARE_EMAIL` and `CLOUDFLARE_API_KEY`, or preferably `CLOUDFLARE_API_TOKEN`)
- Neon PostgreSQL connection configured as `DATABASE_URL`

## Current Production Targets

| Provider | Target | Latest result |
| --- | --- | --- |
| GitHub | `https://github.com/jaygadorkar-bit/edicut2` | Push local `main` after validation |
| Cloudflare Workers | `edicut-web` on `https://edicut.com` and `https://www.edicut.com` | Version `d14f0df8-4b56-4927-8048-7abfc281e3c5` deployed on 2026-05-09 |
| Vercel | `edicut-node-api` | Production deployment `dpl_D4t5nGA8mWPfdFAjn1dE8JBna4nJ`, aliased to `https://edicut-node-api.vercel.app` |
| Neon | PostgreSQL from `DATABASE_URL` | `pnpm db:push` completed on 2026-05-09 with no schema changes detected |

## Preflight

Run these before deployment:

```bash
pnpm typecheck
pnpm build
```

Both commands completed successfully on 2026-05-09 before the latest production deploys.

## GitHub Upload

```bash
git status -sb
git add <changed-files>
git commit -m "Update authentication and deployment"
git push origin main
```

Do not commit local secret files such as `.env`, `.env.local`, `.env.cloudflare`, `.cf-deploy-secrets.json`, `secrets.json`, `.dev.vars`, or `.vercel/`.

## Deploy to Neon

Load `DATABASE_URL` from the local environment, then push the Drizzle schema:

```bash
pnpm db:push
```

Latest result: Drizzle pulled the remote schema successfully and reported no changes detected.

## Wrangler Authentication

Wrangler needs to authenticate with your Cloudflare account before deploying. Use one of the methods below:

### Option 1: OAuth Login (Interactive)

```bash
pnpm exec wrangler login
```

This opens a browser window for you to sign in to your Cloudflare account and grant Wrangler access.

### Option 2: API Key Authentication (Non-Interactive)

Set the environment variables from `.env` before running deploy commands:

**Windows (cmd.exe):**
```cmd
set CLOUDFLARE_EMAIL=your-email@example.com
set CLOUDFLARE_API_KEY=your-api-key-here
pnpm --filter @edicut/web run deploy
```

**Windows (PowerShell):**
```powershell
$env:CLOUDFLARE_EMAIL="your-email@example.com"
$env:CLOUDFLARE_API_KEY="your-api-key-here"
pnpm --filter @edicut/web run deploy
```

**Linux / macOS:**
```bash
export CLOUDFLARE_EMAIL=your-email@example.com
export CLOUDFLARE_API_KEY=your-api-key-here
pnpm --filter @edicut/web run deploy
```

> **Note:** Wrangler prefers `CLOUDFLARE_API_TOKEN` (fine-grained token). If neither `CLOUDFLARE_API_TOKEN` nor the legacy key pair (`CLOUDFLARE_EMAIL` + `CLOUDFLARE_API_KEY`) is set, deployment will fail in non-interactive environments.

## Update Wrangler

Wrangler may show an update prompt like `(update available 4.86.0)` during deployment. To update:

```bash
pnpm update wrangler --filter @edicut/web
```

Or install the latest version globally via pnpm:

```bash
pnpm add -D wrangler@latest --filter @edicut/web
```

## Deploy to Cloudflare (edicut.com)

```bash
# 1. Build shared packages and web app
pnpm --filter @edicut/web build

# 2. Set authentication credentials (if not already set in environment)
set CLOUDFLARE_EMAIL=Jaygadorkar@gmail.com
set CLOUDFLARE_API_KEY=<your-api-key>

# 3. Deploy to Cloudflare Workers
pnpm --filter @edicut/web run deploy
```

The deployment targets the custom domains `edicut.com` and `www.edicut.com` as configured in [`apps/web/wrangler.jsonc`](../apps/web/wrangler.jsonc).

Latest production result:

- Worker: `edicut-web`
- Version ID: `d14f0df8-4b56-4927-8048-7abfc281e3c5`
- Custom domains: `edicut.com`, `www.edicut.com`
- Health check: `https://edicut.com/health` returned HTTP 200

## Deploy to Vercel

The linked Vercel project is `edicut-node-api`. Deploy it from the repository root:

```bash
pnpm dlx vercel --prod --yes --token "$VERCEL_TOKEN"
```

Latest production result:

- Deployment ID: `dpl_D4t5nGA8mWPfdFAjn1dE8JBna4nJ`
- Production URL: `https://edicut-node-api.vercel.app`
- Inspect URL: `https://vercel.com/rafsanxaman-1744s-projects/edicut-node-api/D4t5nGA8mWPfdFAjn1dE8JBna4nJ`
- Health check: `https://edicut-node-api.vercel.app/api/node/health` returned HTTP 200

## Verify Deployment

After a successful deployment, visit `https://edicut.com` to confirm the changes are live. The deploy output shows:

- Assets uploaded (new or modified files)
- Worker bindings
- Custom domain triggers (`edicut.com`, `www.edicut.com`)
- Current Version ID (for rollback reference)

Also verify:

```bash
curl https://edicut.com/health
curl https://edicut-node-api.vercel.app/api/node/health
```
