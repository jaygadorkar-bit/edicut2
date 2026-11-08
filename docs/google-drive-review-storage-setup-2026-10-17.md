# Google Drive review storage setup — 17 October 2026

## Project implementation

- `/site/node-logmin/video-storage` is the admin setup page. It starts Google Drive OAuth at `/api/auth/callback/drive`.
- Review uploads use resumable Google Drive uploads and store only a Drive file ID in the review version. Playback is proxied through the authenticated project review route; Drive files are not made public.
- The app requests the narrow `drive.file` scope and checks the returned Google account against `GOOGLE_DRIVE_ACCOUNT_EMAIL` before saving a refresh token.
- Local and live app instances use the same Supabase database and `YOUTUBE_TOKEN_SECRET`, so the encrypted Drive connection and upload sessions are readable in both environments. Keep local `APP_URL` set to `http://localhost:3002`; the Worker already uses `https://edicut.com`.
- Vite now passes `GOOGLE_DRIVE_ACCOUNT_EMAIL` from the root environment files to the server runtime. It is not added to browser configuration.
- The new Supabase migration adds the missing storage connection and resumable upload tables and updates the review-version provider checks. It has not been pushed to the live project.

## OAuth client configuration

Register both Drive callback URLs on the studio OAuth web client:

```text
http://localhost:3002/api/auth/callback/drive
https://edicut.com/api/auth/callback/drive
```

The same client also needs the existing YouTube callback if YouTube backup remains enabled:

```text
http://localhost:3002/api/auth/callback/youtube
https://edicut.com/api/auth/callback/youtube
```

The Google Cloud project must have the Google Drive API enabled and `drive.file` allowed on the OAuth consent screen. The app then requests `openid`, `email`, and `drive.file`. The configured Drive account must be a test user while the consent screen is in Testing.

## Remaining Google-side check

The saved [OAuth client blocker](../artifacts/google-oauth-client-blocker-2026-10-14.png) and [policy review blocker](../artifacts/google-oauth-policy-review-2026-10-14.png) show earlier Google Cloud console failures. The 14 October setup record later says the OAuth client was created and the policy step accepted, so those screenshots are historical blockers.

The saved [access denied screen](../artifacts/google-storage-tester-blocker-2026-10-14.png) shows the app restricted to developer-approved testers. The [audience screenshot](../artifacts/google-audience-tester-added-2026-10-14.png) and [setup record](./youtube-storage-setup-2026-10-14.md) record one test user. The live Worker currently pins Drive to the account in `GOOGLE_DRIVE_ACCOUNT_EMAIL`; that account does not match the sole test user recorded in the setup note. Confirm they are now aligned in Google Cloud before attempting the first Drive connection. No Google Cloud or account settings were changed as part of this project work.

Google OAuth remains in Testing according to the saved setup record. Tokens for the requested scopes may expire after seven days in that state, so the connection needs to be reauthorized periodically until the app's publishing and verification requirements are resolved.

## Verification

The Drive OAuth tests cover both the localhost and live callback during authorization and code exchange. Project review upload tests exercise the resumable upload route independently of the Google account. A real OAuth connection and upload still require the configured Drive account to be admitted as a tester, the Google APIs/scopes above to be enabled, and the new migration to be applied through the existing Supabase migration workflow.

Google's [Drive scope guidance](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) describes `drive.file` as a per-file scope and requires scopes to be configured in both the OAuth consent screen and the app.
