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
# From root or apps/vercel-api
pnpm dlx vercel deploy --prod
```

### Step 2: Build & Deploy Frontend (Cloudflare)
We use OpenNext to transform the Next.js app into a Cloudflare-compatible Worker.
```bash
# 1. Build the OpenNext output
cd apps/cf-web
pnpm build

# 2. Deploy to Cloudflare
pnpm exec wrangler deploy
```

### Step 3: Verification
Run the smoke tests to ensure both runtimes are communicating correctly:
```bash
pnpm health:new
pnpm smoke:new
```

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
