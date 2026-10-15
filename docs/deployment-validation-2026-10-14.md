# Production validation and deployment — 14 October 2026

## Release

- Site: https://edicut.com/
- Worker: `edicut-web`; Cloudflare account `f2c46bb116722bcb7dc4be44e500154b` (`Jaygadorkar@gmail.com's Account`).
- Verified the account with `wrangler whoami`, the repository binding with `wrangler auth list`, and the production configuration before deployment.
- Used the existing `main` working tree and bound `edicut-production` profile. Existing uncommitted changes were preserved; no commit, reset, push, or cleanup was performed.
- Deployed with `pnpm --filter @edicut/web run deploy`.
- Release version: `9714f29d-1d70-491b-9ef0-fbc9b75f793f`.
- Wrangler uploaded the Worker successfully; existing client assets were unchanged. Both apex and www production routes were deployed.
- No production data mutations, database migrations, secret changes, or plan/billing changes were performed in this deployment turn.

## Files changed during validation

- `scripts/migrate-auth-sessions.test.mjs`: corrected a stale fixture that assumed migration 0015 was the latest migration. The fixture now finds that migration by name and tests its historical migration set. It still checks that the current complete history needs no work and that both earlier and later unrelated pending migrations are rejected. Migration implementation and safety restrictions were not changed.
- This report and desktop/mobile verification screenshots.

## Commands and results

| Check | Result |
| --- | --- |
| `pnpm test` | 946 passed; the 19 database tests skipped here were run separately below |
| `project-review.integration.test.ts` with disposable local PostgreSQL | 13 passed |
| `notifications.integration.test.ts` with disposable local PostgreSQL | 6 passed |
| `node --test scripts/*.test.mjs` after fixing the fixture | 15 passed |
| `pnpm typecheck` | Passed for all four workspaces selected by the root command |
| `pnpm build` | Passed for all four workspaces selected by the root command |
| `pnpm exec eslint scripts/migrate-auth-sessions.test.mjs` | Passed |
| `git diff --check` using the repository's normal Windows configuration | Passed |
| Browser bundle scan for configured private secrets | No leaks found |
| `docker exec edicut-web node scripts/migrate-project-review.mjs` | Read-only; `apply:false`, `pending:[]` on the configured production Neon database |
| `wrangler d1 migrations list edicut-chat-production --remote --profile edicut-production` | No migrations to apply |
| `wrangler deploy --dry-run … --profile edicut-production` | Passed with expected account, domains, database, and review upload rate limiter |
| Actual deploy | Succeeded |

In total, 980 tests passed across the application, isolated database, and script runs. The Luna subagent used a uniquely named PostgreSQL 16 container bound only to `127.0.0.1:55442` and the explicitly guarded `edicut_review_test` database. It removed its container afterward. Production credentials were not used for tests.

The existing ESLint configuration does not configure TypeScript files; TypeScript lint validation is not claimed. Builds retain existing React Router future-flag notices and Wrangler notices about removing side-effect-free imports. A temporary `git diff` override incorrectly treated Windows CRLF endings as whitespace errors; the normal repository check passed, and no unrelated line endings were changed.

## Live verification

All 15 HTTP checks passed:

- Homepage, health, sign-in, pricing, portfolio, contact, privacy, and terms returned HTTP 200.
- Health returned `ok:true`.
- Anonymous dashboard and video-storage pages redirected to sign-in.
- Anonymous chat and both admin/client notification APIs returned HTTP 401.
- A missing-state YouTube callback returned the safe first-party error document, without exposing a credential.
- www redirected to the apex with HTTP 308.
- CSP, HSTS, nosniff, frame protection, referrer policy, and permissions policy were present on all checked apex responses. Private responses used `Cache-Control: no-store`.

The live homepage rendered at desktop and 390-pixel mobile widths. Neither view had horizontal overflow or broken images; no browser warnings/errors were captured. The temporary viewport override was reset. In a later authenticated browser check, the live storage page reported **EdiCut Storage — Connected · uploads are unlisted**. The same live project displayed the one-minute YouTube-backed review version, and its embedded player advanced through the opening seconds. The local player showed a total duration of 1:00. This confirms the saved review record and video retrieval on both app instances.

- [Desktop screenshot](../artifacts/live-release-desktop-2026-10-14.png)
- [Mobile screenshot](../artifacts/live-release-mobile-2026-10-14.png)

## Remaining work

The studio OAuth app remains in Google's External/Testing state; its refresh token has a seven-day lifetime for the current scopes, and Google may require OAuth verification or a YouTube upload compliance audit for broader use. The test upload was performed from the authenticated local admin session and appeared on live through the shared database; a separate upload initiated from the live admin flow was not attempted. See [the storage setup report](youtube-storage-setup-2026-10-14.md) for configuration and security follow-up.
