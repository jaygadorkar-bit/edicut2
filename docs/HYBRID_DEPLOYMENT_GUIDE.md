# EdiCut — Unified Hybrid Deployment Guide

This document is the definitive source of truth for the EdiCut hybrid architecture and deployment workflow. It combines the strategic vision of the hybrid plan with the practical steps required to push to production.

╔═══════════════════════════════════════════════════════════════════════╗
║                    1. ARCHITECTURE OVERVIEW                           ║
╚═══════════════════════════════════════════════════════════════════════╝

EdiCut uses a "Best of Both Worlds" hybrid stack:
1.  **Primary Frontend (Cloudflare Edge)**: `apps/cf-web`
    - Framework: Next.js 16 (via OpenNext)
    - Role: Owns browser traffic, marketing pages, and client dashboards.
    - Hosting: Cloudflare Pages / Workers.
2.  **Backend API (Vercel Node.js)**: `apps/vercel-api` or `apps/node-api`
    - Role: Handles complex Node.js operations, long-running tasks, and heavy external integrations.
    - Hosting: Vercel Serverless.
3.  **Shared Database (Neon)**:
    - PostgreSQL hosted on Neon (Serverless). Shared by both Cloudflare and Vercel.
4.  **Media Object Storage**:
    - **Images**: Cloudinary (Optimized CDN).
    - **Videos**: YouTube (Unlisted hosting for massive files).
    - **Local Dev**: MinIO (S3-compatible).

╔═══════════════════════════════════════════════════════════════════════╗
║                    2. PRE-DEPLOYMENT SETUP                            ║
╚═══════════════════════════════════════════════════════════════════════╝

### Database (Neon)
- Ensure `DATABASE_URL` is available in all environments.
- Run migrations: `pnpm db:push` from the root.

### Media (Cloudinary & YouTube)
- Images should be uploaded via the custom script: `node scripts/upload_to_cloudinary.mjs`.
- Large videos must be uploaded to YouTube as "Unlisted" and the URLs stored in Neon.

### Secrets Management
- **Local**: Use `.env.local` for development.
- **Vercel**: Set environment variables in the Vercel Dashboard.
- **Cloudflare**: Set secrets via `wrangler secret put` or the Cloudflare Dashboard.

╔═══════════════════════════════════════════════════════════════════════╗
║                    3. DEPLOYMENT WORKFLOW                             ║
╚═══════════════════════════════════════════════════════════════════════╝

### Step 1: Deploy Backend (Vercel)
Vercel owns the Node-heavy API endpoints.
```bash
# Run from the monorepo root if the Vercel project root directory is apps/vercel-api.
# Running inside apps/vercel-api can make Vercel look for apps/vercel-api/apps/vercel-api.
pnpm dlx vercel deploy --prod
```

### Step 2: Build & Deploy Frontend (Cloudflare)
We use OpenNext to transform the Next.js app into a Cloudflare-compatible Worker.
```bash
# 1. Build the OpenNext output
cd apps/cf-web
pnpm cf:build

# 2. Deploy to Cloudflare
pnpm exec wrangler deploy
```

If `wrangler whoami` says you are not logged in but `.env` contains `CLOUDFLARE_EMAIL` and `CLOUDFLARE_API_KEY`, load those variables before running Wrangler. Do not print the values.

### Step 3: Verification
Run the smoke tests to ensure both runtimes are communicating correctly:
```bash
pnpm health:new
pnpm smoke:new
```

Also verify the public production routes directly after every deploy:
```bash
# PowerShell examples
Invoke-WebRequest https://edicut.com -UseBasicParsing
Invoke-WebRequest https://edicut.com/admin -UseBasicParsing
Invoke-WebRequest https://edicut.com/dashboard -UseBasicParsing
```

For the barebone frontend baseline, confirm the returned HTML has no `class=` or inline `style=` attributes.

╔═══════════════════════════════════════════════════════════════════════╗
║                    4. OPERATIONAL RULES                               ║
╚═══════════════════════════════════════════════════════════════════════╝

1.  **Single Entry Point**: `edicut.com` always hits Cloudflare first.
2.  **Explicit Routing**: Cloudflare handles all UI rendering. Vercel is *only* called via internal API requests for Node-specific work.
3.  **Shared Token**: Both Cloudflare and Vercel must share the same `SERVICE_SHARED_SECRET` to verify app-to-app communication.
4.  **No Card Required**: Every service in this stack is chosen for its generous free tier that does not require a credit card for activation.

╔═══════════════════════════════════════════════════════════════════════╗
║                    5. TROUBLESHOOTING                                 ║
╚═══════════════════════════════════════════════════════════════════════╝

- **Image not loading**: Check `next.config.ts` for Cloudinary `remotePatterns` and CSP settings.
- **Vercel timeout**: Check if the task should be moved to a background queue or optimized.
- **Cloudflare Worker size**: Ensure only necessary dependencies are included in `cf-web`.
- **Vercel build fails with `invalid-token-value`**: Check whether `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID`, or `VERCEL_TEAM_ID` were uploaded as production runtime environment variables. They are deployment metadata, not app runtime variables. A `VERCEL_TOKEN` value in Vercel project env can break `vercel build`, especially if it contains a newline. Remove those deployment-only variables from Vercel project env and pass the token only to the CLI locally or in CI.
- **Vercel deploy path is duplicated**: If the project root in Vercel is `apps/vercel-api`, deploy from the monorepo root. Running `vercel deploy` from `apps/vercel-api` can produce a path like `apps/vercel-api/apps/vercel-api`.
- **Vercel deployment is ready but returns `401`**: Inspect the deployment first. A ready deployment with public `401` is often Vercel Deployment Protection, not a failed build. Use `pnpm dlx vercel inspect <deployment-url>` to confirm status and aliases.
- **Cloudflare OpenNext returns `500` with `Dynamic require of "/.next/server/middleware-manifest.json" is not supported`**: Tail the Worker with `pnpm exec wrangler tail edicut-cf-web --format json`. A no-op `src/middleware.ts` can trigger this path; remove unused middleware. Explicit `export const runtime = "edge"` on otherwise static pages can also keep routes dynamic; remove it when OpenNext/Cloudflare already supplies the edge runtime.
- **Cloudflare OpenNext still fails on a static barebone site**: If production only needs a temporary static starter shell, use a small Worker entrypoint such as `apps/cf-web/src/worker.ts` and point `wrangler.jsonc` `main` to it. This keeps `edicut.com` healthy while the Next app remains available locally for design work.
- **Neon deploy check**: `pnpm db:push` reporting `No changes detected` means the Drizzle schema matched the Neon database at deploy time.
- **Cloudinary deploy check**: Run `node scripts/upload_to_cloudinary.mjs`, then verify the returned `https://res.cloudinary.com/...` URL with a HEAD or GET request.
