# Production deployment and audit — 2026-10-13

## Release

- Site: https://edicut.com/
- Cloudflare Worker: `edicut-web`, account `f2c46bb116722bcb7dc4be44e500154b`.
- Production profile: `edicut-production`.
- Active version: `4d6c9402-f9ff-457b-a296-81403401fede` at 100% traffic, confirmed by Wrangler deployment history.
- Deployed the current `main` working tree with its existing uncommitted changes. No commit, reset, or cleanup of user changes was performed.
- Wrangler uploaded 80 changed assets. Worker startup reported 69 ms; bundle was 878.15 KiB gzip.

## Database changes

Applied and verified in the authenticated dashboard for Supabase project `uebqtbydqkdpicdskoej` (`Edicut`, `Edicut Studio`, main/Production):

- `20261013043155_restrict_browser_data_access.sql`: session-version columns, RLS, browser table/column privilege revocation, server CRUD grants.
- `20261013114924_harden_public_rls_access.sql`: removed the obsolete anonymous contact INSERT policy and revoked browser/PUBLIC execution of the RLS event-trigger function.

The prepared rollback-only browser-access test passed. A final read-only aggregate checked all five matching application tables present in this project: RLS enabled, anonymous and authenticated table/column access blocked, and service-role CRUD retained. Both session-version columns were confirmed present. Function access revocation and policy removal were read back successfully. A rollback-only temporary-table DDL probe succeeded after function hardening.

Production D1 `edicut-chat-production` reports no unapplied migrations. The Neon auth-session migration was applied and its columns verified earlier in this release.

## Verification

- `pnpm test`: 886 tests passed across 92 files.
- `pnpm typecheck` and `pnpm build`: passed.
- `pnpm audit` and `pnpm audit --prod`: no vulnerabilities reported.
- `git diff --check`: passed; Git emitted existing LF/CRLF conversion notices.
- `pnpm --filter @edicut/web run deploy -- --dry-run`: passed with the expected production bindings.
- `pnpm --filter @edicut/web run deploy`: succeeded.
- `wrangler deployments list --name edicut-web --profile edicut-production`: active release confirmed.
- `wrangler d1 migrations list edicut-chat-production --remote --profile edicut-production`: no migrations to apply.

## Live audit

| Check | Result |
| --- | --- |
| Homepage, health, sign-in, pricing, portfolio, contact, FAQ, privacy, terms | HTTP 200 |
| Health payload | `ok: true`, service `web` |
| `www.edicut.com` | HTTP 308 to apex |
| Anonymous dashboard | HTTP 302 to sign-in |
| Anonymous admin entry | HTTP 302 to configured sign-in flow |
| Anonymous chat unread API | HTTP 401 |
| Security headers | CSP, HSTS, nosniff, frame denial, referrer and permissions policies present |
| Desktop homepage | Rendered successfully; no broken images or captured browser warnings/errors |
| Mobile homepage at 390 px | Document width 390 px; no horizontal overflow or broken images; visual check passed |
| Supabase Security Advisor after rerun | 0 errors, 0 warnings |
| Supabase Performance Advisor | 0 errors, 0 warnings |

The Security Advisor has two informational notices for RLS tables with no policies (`admin_users`, `contact_messages`), consistent with server-only access. Performance Advisor has three informational unused-index suggestions on `projects` and `contact_messages`; index removal requires representative workload evidence.

## Remaining limitations and follow-up

1. Supabase migrations were executed in the verified SQL Editor because the available connector remained authenticated to another account and direct CLI access was unavailable. `supabase_migrations.schema_migrations` does not exist, so the executions have no standard remote migration-history entries. Reconcile history with the authorized Supabase CLI workflow before the next schema release; do not assume these files are recorded as applied. See https://supabase.com/docs/guides/deployment/database-migrations.
2. The live `search_crawling_enabled` setting is `false`. Consequently, `robots.txt` disallows all crawling and `/sitemap.xml` intentionally returns 404. Enable indexing only when publication to search engines is intended.
3. Authenticated purchases, uploads, message sends, and administrator mutations were not exercised against live customer accounts. The audit covered public rendering, anonymous access boundaries, database privileges, and platform advisors.

## Files added during the audit

- `supabase/migrations/20261013114924_harden_public_rls_access.sql`
- `docs/deployment-audit-2026-10-13.md`
