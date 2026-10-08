# Deployment Guide

Last updated: 2026-08-23

## Prerequisites

- Node.js 20+ and pnpm installed
- GitHub CLI authenticated for `jaygadorkar-bit/edicut2`
- Cloudflare account with Wrangler authentication (`CLOUDFLARE_API_TOKEN` is preferred)
- A hosted Supabase project and its project ref
- Cloudinary cloud name, API key, and API secret

## Current Production Targets

| Provider | Target | Latest result |
| --- | --- | --- |
| GitHub | `https://github.com/jaygadorkar-bit/edicut2` | Push local `main` after validation |
| Cloudflare Workers | `edicut-web` on `https://edicut.com` and `https://www.edicut.com` | Version `13a40842-0d45-4dd7-9884-5a9d50e6d71b` deployed on 2026-08-23 in the Jaygadorkar Cloudflare account. |
| Supabase | Auth + PostgreSQL from `SUPABASE_*` | Hosted `Edicut` project in South Asia (Mumbai); initial migration applied and verified |
| Cloudinary | Managed image delivery and server-signed uploads | Worker secrets configured |

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

Do not commit local secret files such as `.env`, `.env.local`, `.env.cloudflare`, `.cf-deploy-secrets.json`, `secrets.json`, or `.dev.vars`.

## Deploy to Supabase

Authenticate and link the hosted Supabase project, then push the checked-in migrations:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Do not commit Supabase access tokens or service-role keys. The `SUPABASE_SERVICE_ROLE_KEY` is a Cloudflare Worker secret only.

## Wrangler Authentication

Wrangler needs to authenticate with your Cloudflare account before deploying. Use one of the methods below:

### EdiCut default profile

For this repository, always use the `edicut-production` profile for deployments. The profile is
bound to `E:\development\Edicut`, and the `@edicut/web` deploy script passes
`--profile edicut-production` automatically:

```powershell
pnpm --filter @edicut/web run deploy
```

Do not use a bare `wrangler deploy` command for EdiCut; it can select a different account when
multiple Cloudflare credentials are present on the machine.

### Option 1: OAuth Login (Interactive)

```bash
pnpm exec wrangler login
```

This opens a browser window for you to sign in to your Cloudflare account and grant Wrangler access.

### Recommended: Named OAuth Profiles

Wrangler supports encrypted named profiles for people who work across multiple Cloudflare
accounts. The `edicut-production` profile is already created and bound to this repository:

```powershell
cd apps/web
pnpm exec wrangler auth list
pnpm exec wrangler whoami
```

The normal deploy command automatically uses the profile bound to `E:\development\Edicut`:

```powershell
cd ../..
pnpm --filter @edicut/web run deploy
```

For another Cloudflare account, create a profile once and bind it to that project's directory:

```powershell
cd apps/web
pnpm exec wrangler auth create client-production
pnpm exec wrangler auth activate client-production E:\development\client-project
```

Wrangler stores each profile in its encrypted local credential store. You should only need to
authorize a profile again if Cloudflare revokes or expires its OAuth grant, or if you delete the
profile. Use `pnpm exec wrangler auth list` to see profile-to-directory bindings and
`pnpm exec wrangler auth deactivate <directory>` to remove one.

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

> **Note:** Use the bound named OAuth profile for local EdiCut deployments. Use
> `CLOUDFLARE_API_TOKEN` (fine-grained token) only for CI or other non-interactive environments;
> keep tokens outside the repository.

## Update Wrangler

Wrangler may show an update prompt like `(update available 4.86.0)` during deployment. To update:

```bash
pnpm update wrangler --filter @edicut/web
```

Or install the latest version globally via pnpm:

```bash
pnpm add -D wrangler@latest --filter @edicut/web
```

## Deploy to Cloudflare Workers

```bash
# 1. Build shared packages and web app
pnpm --filter @edicut/web build

# 2. Configure runtime secrets once
pnpm exec wrangler secret put SUPABASE_URL --config apps/web/wrangler.jsonc
pnpm exec wrangler secret put SUPABASE_PUBLISHABLE_KEY --config apps/web/wrangler.jsonc
pnpm exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config apps/web/wrangler.jsonc
pnpm exec wrangler secret put CLOUDINARY_CLOUD_NAME --config apps/web/wrangler.jsonc
pnpm exec wrangler secret put CLOUDINARY_API_KEY --config apps/web/wrangler.jsonc
pnpm exec wrangler secret put CLOUDINARY_API_SECRET --config apps/web/wrangler.jsonc
pnpm exec wrangler secret put CLOUDINARY_VIDEO_CLOUD_NAME --config apps/web/wrangler.jsonc
pnpm exec wrangler secret put CLOUDINARY_VIDEO_API_KEY --config apps/web/wrangler.jsonc
pnpm exec wrangler secret put CLOUDINARY_VIDEO_API_SECRET --config apps/web/wrangler.jsonc

# 3. Deploy to Cloudflare Workers
pnpm --filter @edicut/web run deploy
```

The Worker is connected to both production routes in the Cloudflare zone:
`edicut.com/*` and `www.edicut.com/*`.

Latest production result:

- Worker: `edicut-web`
- URLs: `https://edicut.com`, `https://www.edicut.com`
- Deployed: 2026-10-08
- Version ID: `378b13a0-6767-40f0-8fa4-d9c136efb3a5`
- Health checks: both `/health` endpoints returned HTTP 200
- Combined audio asset: `/audio/why-hire-us/edicut-why-hire-us-mix-f3907247.wav` returned HTTP 200 as `audio/wav` (3,613,484 bytes)

## Legacy Node API

`apps/node-api` remains available for local compatibility and development. It
is not part of the production Cloudflare/Supabase deployment path.

## Verify Deployment

After a successful deployment, visit `https://edicut.com` to confirm the changes are live. The deploy output shows:

- Assets uploaded (new or modified files)
- Worker bindings
- Worker routes (`edicut.com`, `www.edicut.com`)
- Current Version ID (for rollback reference)

Also verify:

```bash
curl https://edicut.com/health
```
