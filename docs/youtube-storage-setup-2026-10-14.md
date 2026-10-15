# YouTube storage setup — 14 October 2026

## Current state

- Google Cloud is signed in as `edicutstudio@gmail.com`. The available project is `reflected-cycle-473814-p1` (`My Project 80819`, project number `105923696931`).
- Created the OAuth app **EdiCut Video Storage** and web client **EdiCut Studio Video Storage** under `edicutstudio@gmail.com`. The client redirects to the exact local and live callback URLs listed below.
- Added `edicutstudio@gmail.com` as the only test user and enabled **YouTube Data API v3** in project `reflected-cycle-473814-p1` (`My Project 80819`, number `105923696931`). Google’s displayed API Terms and Conditions were accepted with the user's approval.
- The user approved the app's two OAuth grants: manage YouTube videos and view the YouTube account. The local app completed OAuth and now shows **EdiCut Storage** connected, with uploads marked unlisted. The refresh token is encrypted in the shared Neon database.
- The setup did not link a billing account or enable billing. No paid bucket, paid Google service, or plan upgrade was added. On this follow-up, the Cloud Billing console failed to load and the local `gcloud` billing query could not refresh its expired login, so the current billing association could not be independently rechecked.
- Security follow-up: one local environment diagnostic accidentally included credential values in this task's tool output. The values were not added to source or this report. Regenerate the OAuth client secret in Google Cloud and rotate `YOUTUBE_TOKEN_SECRET` before broader use; the user must perform the credential-reset action in the browser, then the replacement can be installed without printing it.
- Local and live apps now share one strong, randomly generated 64-character `YOUTUBE_TOKEN_SECRET`. Before replacing the existing live secret, read-only checks verified zero `video_storage_connections` and zero encrypted `project_review_uploads.session_uri` values. No stored credential or upload was invalidated. Secret values were never printed or committed; the temporary secret-upload file was removed.
- The local Docker service was recreated to load the secret and is healthy. `.env`, `.env.local`, and `.env.cloudflare` contain the same key and remain Git-ignored.
- Deployed the app code to Cloudflare Worker `edicut-web`, account `f2c46bb116722bcb7dc4be44e500154b`, through the bound `edicut-production` profile. Code version: `9714f29d-1d70-491b-9ef0-fbc9b75f793f`; the later OAuth-secret deployment is active as version `802bd83b-a09c-428d-aee6-eeaf04e4f8b9` (14 October 2026 13:00 UTC). Local Docker is healthy and uses the same client and token-encryption key.
- The app's callback and channel connection are verified on both localhost and edicut.com; both admin pages decrypt and display **EdiCut Storage**. The user selected the one-minute synthetic test clip, and the local project shows it as YouTube-backed version `v1 · edicut-storage-test-1-minute`; the player reports a 1:00 duration and playback advances. Opening the same project and version on edicut.com also loads the embedded video and playback advances. This confirms the real upload and local/live retrieval path.
- Google OAuth remains External/Testing. The studio email can use it as a test user, but refresh tokens for these YouTube scopes expire after seven days. Branding must be complete before app publishing becomes available; required OAuth verification and any YouTube upload compliance audit remain provider-controlled.
- Google's current YouTube documentation conflicts: the `videos` resource says uploads from unverified projects are not restricted to private, while the API revision history says projects created after 28 July 2020 are private-only until a compliance audit. The test upload succeeded and was accepted by the app's server-side checks for unlisted privacy and embeddability. Google may still require an upload compliance audit or OAuth verification for broader or long-term use.

## App configuration

`youtube-storage.server.ts` accepts a dedicated studio client through `YOUTUBE_OAUTH_CLIENT_ID` and `YOUTUBE_OAUTH_CLIENT_SECRET`. Both must be present together; a partial pair fails closed. Existing `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` remain the backward-compatible fallback and were not changed. The development Vite server loads the three YouTube server secrets without exposing them as browser variables.

Use the same client and encryption key for app instances sharing the review database: Google's refresh token belongs to its issuing OAuth client, and the stored encrypted credential belongs to the encryption key. Do not rotate either independently after connection.

Create a Google **Web application** client for the studio app with these exact authorized redirect URIs:

```text
http://localhost:3002/api/auth/callback/youtube
https://edicut.com/api/auth/callback/youtube
```

YouTube Data API v3 is enabled. The client requests only these YouTube scopes:

```text
https://www.googleapis.com/auth/youtube.upload
https://www.googleapis.com/auth/youtube.readonly
```

The dedicated client pair is installed in the ignored local environment and as Worker secrets. The development service was recreated, and **EdiCut Storage** is connected from `/site/node-logmin/video-storage`. The connected channel name was confirmed in the admin page; local and live share the same Neon database and encryption key.

If the Google app remains in Testing, add the studio account as a test user. Google's documented Testing refresh-token lifetime is seven days for these scopes; resolve production publishing/verification requirements before relying on unattended long-term use. YouTube currently documents a default allowance of 100 uploads per day; account eligibility and provider quotas still apply. Unlisted exports can be watched by anyone with the link and are compressed by YouTube; retain original masters separately.

## Validation

- `pnpm test`: 100 files passed, 2 skipped; 946 tests passed, 19 skipped. The skipped database suites need their explicit disposable database URLs.
- Luna subagent: `project-review.integration.test.ts` against an isolated, loopback-only PostgreSQL 16 container: 13 tests passed; the container was removed afterward. No production database URL was used for tests.
- Focused YouTube, upload-route, media, and usage-protection tests: 47 passed. New cases cover local/live dedicated-client callbacks, incomplete credentials, and unsafe callback origins.
- Re-run during the one-minute upload check: all 28 tests across YouTube storage, project-review validation, upload-route boundaries, and media delivery passed.
- `node --test scripts/migrate-project-review.test.mjs`: 2 passed.
- `pnpm --filter @edicut/web typecheck` and `pnpm --filter @edicut/web build`: passed.
- Wrangler dry run passed with the expected account, production domain, database, and `REVIEW_UPLOAD_LIMITER`; actual deployment succeeded.
- Local/live `/health`: HTTP 200. Missing-state YouTube callbacks return the safe first-party error document. Anonymous storage access redirects to admin sign-in.
- Authenticated local and live storage pages both report **EdiCut Storage — Connected · uploads are unlisted**. The one-minute test version loads in the local and live project review players; local playback reports `0:01 / 1:00`, and live playback advances through the opening seconds.
- Browser bundle scan found no configured Google client secret, database URL, or YouTube encryption secret.
- `git diff --check` passed for the modified tracked configuration files. ESLint has no TypeScript configuration here and ignored the selected `.ts` files; it is not counted as TypeScript lint validation.
- Build notices remain for React Router future flags and Wrangler's removal of side-effect-free bare imports.

## References and evidence

- [Google OAuth client creation page](https://console.cloud.google.com/auth/clients/create?project=reflected-cycle-473814-p1&authuser=1)
- [Google OAuth audience](https://console.cloud.google.com/auth/audience?project=reflected-cycle-473814-p1&authuser=1)
- [YouTube Data API v3 status](https://console.cloud.google.com/apis/api/youtube.googleapis.com/metrics?project=reflected-cycle-473814-p1&authuser=1)
- [Google OAuth refresh-token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)
- [YouTube upload quotas and constraints](https://developers.google.com/youtube/v3/docs/videos/insert)
- [Policy approval screen](../artifacts/google-oauth-policy-review-2026-10-14.png)
- [OAuth client page failure](../artifacts/google-oauth-client-blocker-2026-10-14.png)
- [Studio test user saved](../artifacts/google-audience-tester-added-2026-10-14.png)
- [YouTube Data API enabled](../artifacts/google-youtube-api-enabled-2026-10-14.png)
- [Granted YouTube permissions](../artifacts/google-youtube-oauth-consent-2026-10-14.png)
- [Local storage connected](../artifacts/local-storage-connected-2026-10-14.png)
- [Live storage connected](../artifacts/live-storage-connected-2026-10-14.png)
- [Local synthetic upload form staged](../artifacts/local-upload-test-ready-2026-10-14.png)
- [YouTube video privacy field](https://developers.google.com/youtube/v3/docs/videos)
- [YouTube API revision history](https://developers.google.com/youtube/v3/revision_history)
