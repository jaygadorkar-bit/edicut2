# Website security audit — 2026-10-13

Confirmed findings have code fixes and regression coverage. **The Worker fixes are not deployed.** Application migration `0015_auth_session_revocation` was applied to the localhost app's Neon database with the user's explicit approval; existing accounts received session-version UUIDs for revocation, and no account details were edited. The separate Supabase browser-grants migration remains unapplied.

## Findings and fixes

| Severity | Finding | Fix |
| --- | --- | --- |
| High | Supabase password rejection could fall through to an older local password hash, including administrator sign-in. | Supabase-enabled authentication now requires provider success. Explicit local authentication remains available when that provider is disabled. Admin provider identities must have a confirmed, matching email. |
| High | Signed application cookies had no server-enforced absolute expiration and remained replayable after browser-only logout. | Signed deadlines enforce 12 hours for ordinary customer sessions, seven days for remembered sessions, and two hours for administrators. Database session versions revoke issued application cookies at logout. Credential proofs also change after password/email updates. Ordinary commits cannot extend the deadline; old-cookie replays cannot revoke newer sessions. |
| High | Worker session-secret and Secure-cookie decisions depended on a Node environment flag that is not guaranteed in Workers. | Worker runtimes require a configured secret, reject the known development fallback, and use Secure/HttpOnly cookies. |
| High, deployment status unverified | Supabase's initial migration granted browser users access to password hashes and updates to their own roles; anonymous contact inserts bypassed application validation and CAPTCHA. | A new migration reserves all 19 application tables for server access, removes table and column grants from browser roles, retains RLS, and preserves service-role access. These exposures were reproduced in a disposable database, not exploited against production. |
| Medium | Sign-in and OAuth return-path checks accepted browser URL normalization tricks such as a leading slash followed by a backslash. Admin paths also lacked normalized route-boundary checks. | Shared browser-safe redirect validation rejects foreign origins and control characters, normalizes dot segments, and restricts admin destinations to actual admin paths. |
| Medium | Contact intake trusted Content-Length and parsed an unbounded stream; missing-Origin checks ignored foreign referrers and sibling-site metadata. | Contact parsing enforces a 64 KiB stream limit and same-site mutation checks. Foreign referrers and unsupported sibling-site requests are rejected. Admin uploads now verify the complete session before parsing. |
| Medium | React Router `.data` action URLs were not mapped to their underlying routes by specialized edge rate limits and body caps. | Request-protection normalization now includes framework data URLs, including the root action endpoint, so auth, contact, and multipart limits apply to ordinary navigations and framework requests alike. |
| Medium | Logout did not revoke provider refresh sessions; password changes could leave linked customer/admin sessions active. A linked customer reset could bypass the current admin's current-password check. | Logout revokes the provider and application sessions before clearing cookies. Password recovery uses the provider-verified identity; admin password writes atomically revoke both account stores by verified email. Self-admin resets through customer records are rejected. Provider/storage outages do not report success. |
| Medium | New bcrypt passwords could exceed bcrypt's 72-byte input limit and silently lose their suffix; new-password minimums differed. | Signup, recovery, and admin password writes require at least 12 characters and reject inputs over 72 UTF-8 bytes. Existing sign-in credentials remain supported. |
| Medium | Worker headers overwrote stricter route referrer policies, and private redirects/personalized public-page responses were not consistently marked no-store. | Worker response helpers preserve restrictive policies and apply no-store to private and personalized dynamic responses. Existing public static-asset policies remain intact. |
| High, development dependency only | Miniflare's dependency tree included sharp 0.35.4, affected by the librsvg advisory. | A scoped override selects sharp 0.35.5. Production dependencies were already clear; both final audits now report no known advisories. See the [upstream advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w). |
| High, fixed locally | Google OAuth profile persistence selected `session_version`, but the configured Neon database did not have the session-revocation migration. The resource callback exposed the raw database exception. | Applied migration `0015_auth_session_revocation` after approval. Callback infrastructure failures now clear OAuth state and redirect to the matching sign-in screen with a safe retry message; database details are logged only as a generic status and are never sent to the browser. |

Account-wide application revocation is intentional: logging out invalidates that account's application cookies on other devices too. Session-version and credential hashes stay out of public loader payloads. No data cache was introduced, and the earlier admin code splitting remains in place.

## Verification

- `pnpm test`: **92 test files, 886 tests pass**.
- `pnpm typecheck`: shared, database, web, and Node API checks pass.
- `pnpm build`: production client/server builds and package checks pass.
- `pnpm audit --prod` and `pnpm audit`: **no known vulnerabilities**.
- `pnpm --filter @edicut/web exec wrangler deploy --dry-run --outdir ../../.codex-tmp/security-worker-dry-run --profile edicut-production`: Worker packaging passes; nothing uploaded.
- Targeted `git diff --check`: passes. Lint is not configured as a supported repository check.
- PostgreSQL 17 in task-created, loopback-only disposable containers: application migration and browser-grant assertions pass. The auth migration was checked with concurrent runs, safe retries, unchanged account fields, and UUID/default validation. Before browser hardening, role updates, password-hash reads, and direct contact writes were granted; afterward they are denied. Service-role grants remain available. The hardening migration can be rerun.
- Separate loopback-only app on port 3004 using only that disposable database: **13 HTTP/database checks pass**, covering authentication, private-payload filtering, optimized overview loading, cross-site logout, customer/admin cookie revocation, replay isolation, expiration, badge authorization, and credential changes. The temporary server and database are removed after validation.
- A real PostgreSQL check confirms that linked customer/admin session versions change atomically while unrelated accounts retain their versions.
- Regression tests cover provider rejection and logout failures, safe OAuth callback errors, UTF-8 password bounds, redirect normalization, bounded form streams, cookie security, absolute deadlines, revocation, and private response headers.
- A tracked-file scan found no high-confidence private-key/API-token matches; tracked environment files are examples. This is not a complete credential-history scan.
- Non-mutating production HEAD checks on the homepage, sign-in, dashboard, and admin path confirm existing CSP, framing, MIME, HTTPS headers, and unauthenticated redirects. Production dependency checks do not replace runtime configuration review.

## Release requirements and remaining limits

1. The auth-session migration is applied on the Neon database used by localhost:3002, and the service restarted. For any other environment, verify the account, database target, and reviewed branch, then apply `packages/db/drizzle/0015_auth_session_revocation.sql` through that environment's migration workflow **before deploying**. The local development app targets live Neon; keep test fixtures on disposable databases.
2. Apply `supabase/migrations/20261013043155_restrict_browser_data_access.sql` to the correct EdiCut Supabase project and rerun `supabase/tests/browser_data_access_test.sql` and its security advisors. **The connected account did not grant advisor access to configured project `uebqtbydqkdpicdskoej`; live grants and Auth settings could not be verified.** No unrelated connected project was changed.
3. Deploy the reviewed Worker, then verify authenticated customer/admin paths, logout, password recovery, redirects, and response headers against the deployed environment. Existing cookies require a fresh sign-in. Local-only password accounts need a deliberate migration to Supabase Auth or verified Google sign-in when Supabase Auth is enabled.

4. Google sign-in needs a new browser attempt after a failed callback because the single-use authorization code and OAuth state are cleared. The app now loads successfully and the callback rejects an invalid state with a redirect. Completing a new account sign-in still requires the user to finish Google's authentication and the site's CAPTCHA in their browser.

Existing React Router migration notices, the Workers types peer-range warning, and Wrangler's ignored bare-import warnings remain; compilation and packaging succeed. Full production penetration testing, account-level MFA/password-leak settings, secret history/rotation, and external provider configuration are outside the verified results. The current script CSP still allows inline scripts for existing framework/OAuth behavior; nonce-based CSP is a separate hardening opportunity, not a confirmed injection exploit in this audit.

Provider access JWTs follow their own expiry after sign-out; the application session version blocks application-cookie reuse immediately. See [Supabase session behavior](https://supabase.com/docs/guides/auth/sessions). Database grant design follows [Supabase column privilege guidance](https://supabase.com/docs/guides/database/postgres/column-level-security), and session controls follow [OWASP session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## Changed files

- Sessions and authorization: `apps/web/app/lib/session.server.ts`, `account-sessions.server.ts`, `admin-toolbar-access.server.ts`, `contact-inbox-access.server.ts`, `admin-public.ts`; `apps/web/app/root.tsx`; admin access/count routes and logout.
- Authentication and password policy: sign-in, admin login, recovery, account/user/staff admin routes; `apps/web/app/integrations/supabase/client.server.ts`; auth and admin password form components.
- Redirect/request boundaries: `apps/web/app/lib/safe-redirect.ts`, `mutation-request.server.ts`, `usage-protection.server.ts`, `contact-intake.server.ts`, `google-auth.server.ts`, and affected auth/admin return-path callers.
- Deployment headers: `apps/web/workers/app.ts`, new `security-headers.ts`, and header regression tests.
- Database: `packages/db/src/schema.ts`, the new Drizzle migration/snapshot/journal entry, the new Supabase migration and grant test, and `scripts/prepare-chat-test.mjs` fixture credential sealing.
- Dependencies: `package.json`, `pnpm-lock.yaml`.
- New/updated regression tests beside those modules, plus this audit record. Unrelated existing working-tree changes were preserved.
