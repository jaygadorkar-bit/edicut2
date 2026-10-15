# Project and video review workspace — 14 October 2026

## Implemented

- Project cards with progress, readable status, delivery date, brief disclosure, search, status filters, and pagination.
- Removed the redundant project-library heading/count/description block and the Reviews and Uploads navigation entries throughout client pages. Review and shared files now live inside each project. Legacy routes remain compatible.
- Project workspace with Review, Brief, and Versions & team sections; labeled brief fields exclude internal purchase identifiers.
- Private MP4/WebM version uploads with drop zone, metadata validation, upload progress, title, editor note, and version history.
- Timestamp and time-range feedback, seekable timeline markers, normalized rectangular frame annotations, and numeric annotation controls for keyboard users.
- Replies, change/question/praise categories, priority, search, open/resolved/mine filters, resolve/reopen, and CSV export with formula protection.
- Client approval and change requests, with confirmation and protection against approving unresolved changes, old versions, or stale feedback. Approved versions retain read-only feedback.
- Draft preservation across sections, version-switch confirmation, unload protection, and periodic refresh without switching the selected version.
- Explicit administrator assignment of active editors/project managers; assigned staff receive a searchable project queue.

## Changed files

New components in `apps/web/app/components/`: `ProjectLibrary.tsx`, `ProjectReviewPage.tsx`, `ProjectReviewWorkspace.tsx`, `ReviewPlayer.tsx`, `ReviewFeedback.tsx`, and `ReviewUpload.tsx`.

New services in `apps/web/app/lib/`: `project-review.ts`, `project-review.server.ts`, `project-review-route.server.ts`, and `project-review-media.server.ts`, plus validation, database integration, route, and media tests.

New routes in `apps/web/app/routes/`: `dashboard-project-review.tsx`, `admin-project-review.tsx`, `api-project-reviews.ts`, and `dashboard-reviews.ts`. Modified `dashboard-projects.tsx`, `admin.tsx`, `dashboard.tsx`, `dashboard-profile.tsx`, `dashboard-placeholder.tsx`, `app/routes.ts`, and `lib/client-workspace-navigation.ts` to integrate the feature and navigation changes.

New `apps/web/app/styles/project-review.css`; schema changes in `packages/db/src/schema.ts`; migration `packages/db/drizzle/0017_project_video_review.sql`, snapshot, and journal entry. Added `scripts/migrate-project-review.mjs` and its tests. Existing unrelated workspace changes were preserved.

## Access and storage

Every project read/write and media request checks ownership or active assignment, or administrator access. Mutations check request origin, rate limits, payload limits, and input validity. Project/version locking and a monotonic review revision serialize decisions with concurrent feedback. Retry tokens avoid duplicate comments and uploads.

Existing directly hosted review cuts can continue using private Cloudinary assets, with signed access proxied through the authenticated application endpoint. New review versions use the YouTube resumable-upload workflow described in [the current activation report](project-editor-assignment-youtube-uploads-2026-10-14.md). Provider URLs and credentials are not returned to clients. Byte ranges are forwarded for directly hosted assets; response bodies stream with private no-store headers. The header timeout ends after response headers arrive, so it does not terminate long playback. The Cloudinary path follows [private asset access documentation](https://cloudinary.com/documentation/control_access_to_media#providing_time_limited_access_to_private_media_assets).

Limits: 50 MiB per video, six-hour declared duration, 100 versions per project, 1,000 comments per version, and 4,000 characters per comment. Duration is checked using browser metadata and validated as a bounded server field; no server transcoder inspects codec/duration. Playback depends on browser codec support. Raw assets avoid automatic public transformed derivatives.

The three review tables have RLS enabled without browser policies; server access is responsible for project authorization. The local integration suite verifies that an unprivileged database role cannot read them.

## Verification

| Command/check | Result |
| --- | --- |
| `pnpm exec vitest run`, with `REVIEW_TEST_DATABASE_URL` set to disposable local PostgreSQL | 98 files, 921 tests passed |
| `pnpm --filter @edicut/web typecheck` | Passed after final player corrections |
| `pnpm --filter @edicut/web build` | Client and server builds passed; existing React Router future-flag notices remain |
| `pnpm --filter @edicut/db exec drizzle-kit check` | Passed |
| `node --test scripts/migrate-project-review.test.mjs` | 2 tests passed |
| `pnpm exec eslint scripts/migrate-project-review.mjs scripts/migrate-project-review.test.mjs` | Passed; repository ESLint configuration does not cover TypeScript/TSX |
| `git diff --check` | Passed; Windows line-ending notices only |
| Read-only migration inspection | Exactly 0016 and 0017 pending |

The database integration suite applied the real review migration to a dedicated disposable PostgreSQL container and checked ownership/assignment, deactivated access, version history, cross-version reply rejection, idempotency, approvals, stale revisions, concurrent comments/decisions, safe source links, queue filters/pagination, and RLS. The container was stopped after tests.

Browser verification covered real project search/navigation and the graceful pending-setup state. The local sample preview uses the production components with fictional in-memory callbacks, a real local WebM, and no client writes. Verified video decoding, timestamp seeking, existing annotation placement, numeric frame-area controls, keyboard seeking, CSV download, replies, resolution, approval, local version upload, draft protection, and 390px/320px layouts without horizontal overflow.

Screenshots:

- [Actual project library](../artifacts/project-library-2026-10-14.png)
- [Sample review workspace](../artifacts/video-review-workspace-2026-10-14.png)
- [Sample annotation and feedback detail](../artifacts/video-review-detail-2026-10-14.png)
- [Sample mobile feedback](../artifacts/video-review-mobile-2026-10-14.png)

The sample preview remains at `http://127.0.0.1:3003/` while its local Vite process is running. Its scratch source is ignored and is not part of the deployable application. Provider upload/stream requests were mocked in tests; no live Cloudinary review asset was created. Live provider behavior still needs a disposable upload/playback check after activation.

## Status update — 14 October 2026

At the user's explicit approval, migrations `0016_project_intake_pending_hours`, `0017_project_video_review`, and `0018_project_youtube_uploads` were applied transactionally to the live Neon database `neondb` at `ep-square-hill-anlqlonb-pooler.c-6.us-east-1.aws.neon.tech`. The follow-up read-only check reports no pending migrations. Existing balances were not rewritten. After refreshing the signed-in localhost admin queue, the editor assignment controls and real editor picker loaded; no production project was assigned. No YouTube OAuth connection or video upload was made, and the application has not been deployed. See [the current report](project-editor-assignment-youtube-uploads-2026-10-14.md) for the required Google configuration, storage tradeoffs, test results, and outstanding activation steps.
