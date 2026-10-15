# Project editor assignment and review uploads

## User workflow

Each project has one active editor. Administrators and project managers can assign or change that editor from either project queue or the project workspace. The assignment picker searches active editor accounts, shows their current workload, and confirms reassignment. The old editor loses project access; saved cuts and comments stay with the project. Editors see only projects assigned to them. Project managers can browse the work queue and assign editors, but an assignment alone does not grant upload access to managers.

Review versions use YouTube resumable uploads. The upload client sends 8 MiB chunks through the authenticated app, which keeps OAuth credentials and YouTube upload URLs on the server. Each cut is explicitly uploaded as unlisted and checked against the connected channel before it becomes a project version. The app currently accepts MP4 and WebM, up to 10 GiB and six hours. It keeps review comments and version metadata in the application database, not the video file itself.

Unlisted means anyone who obtains the link can watch the video. It is suitable for review exports with the client’s permission; it is not private storage. YouTube also processes/compresses the export. Keep camera originals and final masters in a separate archive. The embedded YouTube player must remain unobscured, so timestamp comments work on those cuts while frame drawing is available only on directly hosted cuts.

## Production activation

Read-only inspection on 14 October 2026 found the configured Neon database `neondb` at `ep-square-hill-anlqlonb-pooler.c-6.us-east-1.aws.neon.tech`, classified by the user as live production. At the user's explicit approval, migrations `0016_project_intake_pending_hours`, `0017_project_video_review`, and `0018_project_youtube_uploads` were applied to that exact host and database on 14 October 2026. A follow-up read-only check reports no pending migrations. No existing balances were rewritten. No production project assignment, OAuth connection, YouTube upload, or app deployment has been performed.

The guarded migration script applied only those three migrations, checked the expected host and database, validated migration history and current schema, and ran the changes under a transaction and advisory lock. Monthly brief submissions now start with zero reserved hours; the review/team/comment/version tables and revision metadata are present, along with encrypted YouTube connection/upload-session storage and provider metadata. The editor confirms hours after reviewing the brief, so nothing is deducted at submission. The approved command was:

```powershell
docker exec edicut-web node scripts/migrate-project-review.mjs --apply --expected-host ep-square-hill-anlqlonb-pooler.c-6.us-east-1.aws.neon.tech --expected-database neondb
```

To activate YouTube uploads, production configuration needs the YouTube Data API v3 enabled on the Google Cloud project, OAuth consent for `youtube.upload` and `youtube.readonly`, and this redirect URI registered on the Google OAuth client:

```text
<APP_URL>/api/auth/callback/youtube
```

The server also needs a dedicated `YOUTUBE_TOKEN_SECRET` with at least 32 characters. Keep it stable wherever the production app runs because it encrypts the stored refresh token. Configure it as a server secret, never a browser variable. Deploy the app with the `REVIEW_UPLOAD_LIMITER` binding in `apps/web/wrangler.jsonc`, then an administrator can connect the studio channel at `/site/node-logmin/video-storage`. That page shows the resolved redirect URI and whether the migration and configuration are ready. The signed-in localhost queue was refreshed after migration and now shows active “Assign editor” controls; the real editor picker opened successfully. No editor was selected or assigned. The storage page still shows no channel connected and keeps channel connection disabled pending Google OAuth/server-secret configuration. The production site still needs the app deployment before these code changes are available there.

YouTube’s documented default upload quota is 100 `videos.insert` calls per day for an API project. A quota extension may be needed if the team expects more uploads. Uploaded videos and incomplete provider sessions do not have an automatic deletion/retention job in this implementation; review these in YouTube Studio and establish a retention process before scaling up.

## Storage alternative

Cloudflare R2 documents unlimited bucket storage and object counts, with per-object and multipart upload limits. Standard storage is billed at $0.015 per GB-month after the 10 GB-month free tier; operations may also be billed, while internet egress is free. This is capacity without a fixed bucket ceiling, not unlimited free storage. R2 would need a separate private-media path, signed playback, and retention policy; it cannot be enabled by changing the current YouTube provider setting alone. See [R2 limits](https://developers.cloudflare.com/r2/platform/limits/) and [pricing](https://developers.cloudflare.com/r2/pricing/).

## Verification and limits

- `pnpm exec vitest run` with disposable local PostgreSQL: 102 files and 959 tests passed.
- `pnpm --filter @edicut/web typecheck`: passed.
- `pnpm --filter @edicut/web build`: client and server bundles passed; the build shows existing React Router v8 future-flag notices.
- `pnpm --filter @edicut/db exec drizzle-kit check`: passed.
- `node --test scripts/migrate-project-review.test.mjs`: 2 passed; targeted ESLint passed.
- `git diff --check`: passed; Git reported Windows LF/CRLF conversion notices.
- Final read-only database inspection reports `pending: []` for migrations 0016–0018.
- Browser verification used the signed-in localhost admin queue against the configured database. After refresh, assignment controls were enabled and the real assignment picker loaded; no production project record was changed.
- Assignment-dialog interaction, mobile layout, YouTube IFrame playback, seeking, and timestamp comments were exercised in a local fixture with fictional in-memory data. Upload server flows were exercised against disposable local PostgreSQL with mocked Google HTTP responses. No real channel was connected and no video was sent to YouTube.
- Screenshots: [admin project queue before the migration, with assignments disabled](../artifacts/project-editor-queue-2026-10-14.png), [desktop assignment picker fixture](../artifacts/editor-assignment-desktop-2026-10-14.png), [mobile assignment picker fixture](../artifacts/editor-assignment-mobile-2026-10-14.png), [upload form with sample metadata](../artifacts/youtube-review-upload-2026-10-14.png), and [YouTube playback with a timestamped comment](../artifacts/youtube-review-playback-2026-10-14.png).
- Frame drawing is unavailable over the YouTube player by platform policy; a visible note in the player explains the available timestamp-comment workflow.
- The app’s 10 GiB upload cap is below YouTube’s API maximum. API call quotas, YouTube processing, account eligibility, and playback policies remain provider constraints.
- Deployment, Google OAuth configuration/channel connection, and a real YouTube upload remain outstanding; no production video has been sent to YouTube.
