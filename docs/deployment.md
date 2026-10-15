# Deployment Guide

Last updated: 2026-10-09

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
| Cloudflare Workers | `edicut-web` on `https://edicut.com` and `https://www.edicut.com` | Version `32f800c0-fd9c-44ab-beaf-ee94429d2dc2` activated at 100% on 2026-10-09 (local time) in the Jaygadorkar Cloudflare account. Project groups and support tickets enabled; Neon migration 0014 applied with existing support history preserved. |
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
- Version ID: `4f018a5c-9bb6-4ce8-b8f1-357e1a1aa9db`
- Previous production version: `60030587-b0cd-41f1-8ead-e8d2cad1d1b2`
- Health checks: apex `/health` returned HTTP 200; `www` redirected to the apex and returned HTTP 200
- Optimized scene: `/artwork/why-hire-us/creator-recording-scene-b93b36d3.svg` returned HTTP 200 as `image/svg+xml` (73,768 bytes), with SHA-256 matching the local release asset
- Live desktop and mobile checks: the red play icon loops before the first press, the button remains fixed, and pressing Intro stops the icon animation; pausing does not restart it and reloading resets the prompt
- Validation: web type check, production build, 11 timeline/static-asset tests, and Wrangler deployment dry run passed; live browser checks found no console errors or horizontal overflow
- Combined audio asset: `/audio/why-hire-us/edicut-why-hire-us-mix-f3907247.wav` returned HTTP 200 as `audio/wav` (3,613,484 bytes)

## Chat navigation and assignment update — 2026-10-09

- Production Worker: `edicut-web`, account `f2c46bb116722bcb7dc4be44e500154b`, profile `edicut-production`, branch `main`.
- Released version: `a5f33454-9391-47a9-bfa2-15c2f9cb0499`, serving 100% of traffic. Previous version: `32f800c0-fd9c-44ab-beaf-ee94429d2dc2`.
- Changes: manager changes atomically add named system activity; conversation cards show separate manager details and previews; Tickets uses the correct font icon; Chat/Tickets have separate red unread message counts across desktop, collapsed, and mobile navigation.
- Files changed for this update: `apps/web/app/components/{AdminPanelShell,ChatWorkspace,WorkspaceShell,WorkspaceShell.test}.tsx`; `apps/web/app/lib/{chat.server,material-symbols,material-symbols.test,use-chat-unread-counts}.ts`; `apps/web/app/routes/api-chat.ts`; `apps/web/app/styles/chat.css`; `apps/web/vite.config.ts`; `scripts/verify-chat-unread.mjs`; `docs/{dashboard-chat,deployment}.md`.
- Checks: `pnpm test` (715 tests / 76 files passed); `pnpm --filter @edicut/web typecheck`; `pnpm --filter @edicut/web build`; `node scripts/verify-{chat-unread,chat-live,support-tickets,chat-storage}.mjs` (103 isolated HTTP/database checks); `node scripts/verify-chat-worker.mjs` (local production socket runtime); `node --check scripts/verify-chat-unread.mjs`; `pnpm exec eslint scripts/verify-chat-unread.mjs`; `git diff --check`; Wrangler deployment dry run. TypeScript has no configured ESLint rule set; type checking and tests provide its automated validation.
- Browser checks: desktop and 319px mobile conversation cards, correct Tickets icon, positive red counts, project count clearing independently of tickets, collapsed navigation, and no mobile horizontal overflow. A transient hot-reload navigation error disappeared after reload; subsequent navigation worked normally.
- Live checks: apex and canonical `www` health HTTP 200; anonymous unread requests return 401 with `no-store`; four chat/ticket pages redirect to sign-in; deployed WorkspaceShell JavaScript, chat JavaScript, and chat CSS SHA-256 match the release files; the live font subset includes `confirmation_number`.
- Database migration check: no pending migrations; no production database changes made for this update. All assignment and ticket mutations during validation used the disposable database on port 55439. Its server and container were stopped; its synthetic browser cookie was removed.
- Behaviour limits: activity notices record new assignment changes, without inventing historical assignment dates. Existing assigned managers remain visible in the card and chat heading. Counts update with live chat refreshes and reads; pages outside Chat/Tickets refresh every 30 seconds and on focus/visibility/online events. Visual counts cap at 99+, with full accessible counts. Production assignment mutations were not performed during verification.
- Follow-up: refresh an already-open browser tab to load the release; the next manager assignment adds a saved notice automatically.

## D1 chat cutover — 2026-10-09

- Verified account `f2c46bb116722bcb7dc4be44e500154b`, Worker `edicut-web`, profile `edicut-production`, branch `main`.
- Released version `6af5e385-8afc-49fc-b36c-291368f28c68`. Native `CHAT_D1` points to `edicut-chat-production` (`248da0e0-8360-4d6d-9d06-83e1504f332f`); backend is `d1`, maintenance is `false`.
- Created staging and production chat databases and applied D1 migrations 0001–0003. Forty exported records passed all 17 remote parity checks, including checksums, foreign keys, derived searches and ticket sequence. Source snapshot stability was checked while writes were paused. Source Neon chat records were retained.
- Authentication, current roles and paid eligibility remain authoritative in Neon per operation. Messages, room assignments, reads and tickets use D1. Socket Durable Objects and private Cloudinary attachments retain their existing roles.
- Request optimization combines room/history/badge data, removes duplicate badge requests/sockets, debounces refresh bursts, and uses 10-minute connected recovery / 60-second disconnected recovery. Heartbeats do not query the database.
- Main files: `apps/web/app/lib/{chat-store,chat-authority,chat-d1,chat-d1-remote,chat-cleanup,chat-realtime}.server.ts`, `chat-live.ts`, `ChatWorkspace.tsx`, chat/ticket loaders and API; `wrangler.jsonc`; `docker-compose.yml`; `packages/db/d1/chat`; migration/verification scripts. Full runbook: [chat-d1-migration.md](chat-d1-migration.md).
- Validation: `pnpm test` (734 tests / 79 files); web typecheck and production build; 78 D1 adapter checks locally and 78 on verified remote staging; 41 actual API checks using disposable PostgreSQL/local D1; 15 local schema checks; 17 production parity checks; existing isolated HTTP/socket suites; JavaScript ESLint; `git diff --check`; Wrangler dry run and deployment.
- Live authenticated native D1 rooms, sync/history, unread and tickets returned 200 with `no-store`. Imported conversation history is readable. Apex, canonical www and localhost3002 health returned 200. Management credential was absent from 152 release files and from Worker bindings.
- The user-authorized full-access credential is stored only in ignored local `.env` as `CLOUDFLARE_MASTER_API_TOKEN`; the old token remains. The CLI wrapper and local development REST bridge consume it server-side. Production receives no management token.
- Rollback: baseline PostgreSQL release was `a5f33454-9391-47a9-bfa2-15c2f9cb0499`; maintenance versions were `87d41a60-e21a-4c53-b6b5-c8b0c8d6fbc4` (PostgreSQL) and `8d46325d-25a9-4e58-86ac-bd2b4a0660ec` (D1). After D1 accepts writes, pause and reconcile its delta into Neon before switching authority; a Worker rollback alone omits newer data.
- Remaining follow-up: monitor actual D1/Worker/Neon usage, define backup retention, and design versioned permission replication if eliminating Neon chat reads. No production traffic load test or customer mutation/provider-upload probe was performed; mutation/storage behavior used isolated fixtures and mocked storage.

## Project group conversation card — 2026-10-09

- Production version: `e86ebf6b-909f-4a2a-84f2-dede0f58e7bc`, D1 backend and migration mode off.
- Project group cards now show the group name, a one-line latest-message preview with Messenger-style sent/seen ticks for the current user's own message, and the admin team plus assigned manager. Ticket cards keep their ticket details.
- Receipt status checks the latest message's composite read cursor against current active group participants in either PostgreSQL or D1.
- Validation: 734 Vitest tests / 79 files, 80 D1 adapter checks locally and 80 on staging, 20 isolated PostgreSQL assignment/unread checks, web typecheck/build, authenticated production room list, `/health` on apex and www, and live chat JS/CSS hashes.
- Production Worker settings and D1 ID match the verified account. The master management token is absent from Worker bindings.

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
