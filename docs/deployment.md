# Deployment Guide

## Prerequisites

- Node.js 20+ and pnpm installed
- Cloudflare account with API credentials configured in `.env` at the repo root (`CLOUDFLARE_EMAIL` and `CLOUDFLARE_API_KEY`)

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

## Verify Deployment

After a successful deployment, visit `https://edicut.com` to confirm the changes are live. The deploy output shows:

- Assets uploaded (new or modified files)
- Worker bindings
- Custom domain triggers (`edicut.com`, `www.edicut.com`)
- Current Version ID (for rollback reference)
