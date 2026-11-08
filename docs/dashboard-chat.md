# Dashboard chat

Project groups live at `/dashboard/chat` and `/site/node-logmin/chat`. Support tickets live at `/dashboard/tickets` and `/site/node-logmin/tickets`; support staff are redirected to their ticket queue. Contact-form enquiries remain separate at `/dashboard/messages`.

Project messaging requires a visible, paid package purchase (single or monthly). Unpaid customers see a grey project entry and the subscription requirement, with support available immediately. Paid customers appear automatically in the admin project inbox. Each project group includes the customer and admin team from the beginning, with an admin welcome seeded once. Group previews show participant photos (or initials) and the latest activity in that group, based on each participant's latest read cursor or sent message. Customers can send before assignment; an active `project_manager` joins the same history after an admin assigns them inside the group. Managers can access only their currently assigned, paid customer groups. Reassignment removes the previous manager's history, attachment, send, edit, and typing access immediately. Purchase eligibility is checked again for each content request and write. Admin sessions use the separate signed admin cookie; client metadata cannot grant administrative access.

Customers can open multiple support tickets without purchasing a package. Each ticket has a unique number, subject, issue category, priority, saved description, and reply thread shared with active admins and `customer_support` accounts. Managers cannot access tickets, and customers can access only their own tickets. Staff replies move the ticket to awaiting customer; customer replies move it to awaiting support. Staff can change priority/status, and staff or the owning customer can close and reopen a ticket. Closed tickets retain history and attachments but reject replies and edits until reopened. Lifecycle activity is saved in the thread. Status updates use optimistic timestamps and room locks to prevent stale actions from overwriting newer replies. Ticket creation and message retries are idempotent. The queue supports search, status counts, filters, unread counts, and pagination. Existing support rooms with messages are migrated into tickets without removing history.

Messages, manager assignments, and per-reader timestamps live in Cloudflare D1. Current account roles and paid eligibility are checked against Supabase PostgreSQL through Cloudflare Hyperdrive for each operation. Writes validate current roles, room membership, same-origin requests, body limits, and rate limits. A message nonce is unique per sender, making retries idempotent. Text is rendered through React; only HTTP/HTTPS links become links. Messages can be edited or deleted by their original sender. Deletion removes text for all participants and disables attachment downloads. Sender identity snapshots preserve history if an account is removed.

The browser uses a real authenticated WebSocket at `/api/chat/socket`. Cloudflare's hibernating `ChatSocketHub` Durable Object isolates each actor's connections. Only server-issued refresh/typing notifications travel through the socket. Each history request checks current database access; socket frames never contain message bodies or downloadable file URLs. The Vite development plugin provides the equivalent socket transport locally. Reconnect and focus/visibility changes retrieve saved messages after missed notifications. A healthy visible connection resyncs every 10 minutes; a disconnected visible client falls back to every 60 seconds. Thirty-second heartbeat frames do not query the database. A single snapshot request returns rooms, selected history and global unread counts; the navigation shell consumes these counts without a second request. Other workspace pages use one socket and coalesced unread requests. Eight simultaneous chat windows are allowed per actor.

History uses 50-message cursor pages. Conversation lists use 40-room pages with client-name, email, and last-message search. Opening Chat replaces the main sidebar with conversations; Back to main menu restores workspace links while preserving the open conversation and draft. Selecting Chat again returns to conversations. Phones use the existing navigation drawer for this same list; the message area has no secondary navigation panel. The UI includes message search, unread counts, read receipts, typing, emoji insertion, linked URLs, attachments, own-message edits/deletion, saved text drafts per account/room in session storage, and failure retry with the same nonce. File drafts must be selected again after leaving a room or reloading. Timestamps use the viewer's local timezone. Background chat requests do not activate the workspace-wide loading overlay.

Each client has a 10 GB total chat-attachment allowance across its conversations. A message can attach one JPG, PNG, WebP, GIF, PDF, MP4, or WebM file; the server checks its declared type and file signature and stores the original bytes without compression. Uploads reserve the file's full size before transfer and stream to the admin-connected Google Drive account in resumable 8 MiB parts. Drive files stay private; previews and downloads use the authenticated chat endpoint, which checks current room access. Supported images render inline, and MP4/WebM video uses byte-range streaming so browser playback can seek. Browser-supported PDFs open inline; other formats download. Responses use `no-store`, `nosniff`, and a sandbox CSP. Deleted attachments release quota after Drive confirms deletion; cleanup failures leave the file charged until cleanup succeeds. An unfinished completed upload is kept against the client allowance until it is removed during a later upload attempt after its one-day reservation expires. Older Cloudinary attachments remain readable and can still be deleted.

## Administrator message moderation

Administrators can open **Message options** on another participant's ordinary
message and choose **Delete message** or **Remove attachment**. Editing another
author's text is not permitted. Removing just a file preserves message text;
file-only messages become deletion markers. Both operations require a confirmation
and apply to everyone in the conversation. System activity notices remain protected.
Moderation also works in closed tickets and readable inactive-client conversations.
Customers and assigned staff retain their existing own-message permissions.

The API authenticates the administrator, checks current conversation access, and
revalidates current roles inside both the D1 and PostgreSQL write paths. Removed
files are blocked immediately by the authenticated download endpoint. Search and
history omit their metadata. Original authorship and deletion timestamps remain.
No new database migration or browser data access grant is needed.

Storage cleanup runs after the chat mutation. A server-only removal marker keeps
file identity available for safe retries; the client sees no file. Google Drive
cleanup uses the existing expired-upload queue, bounded to 50 reservations on the
next upload attempt. Quota remains charged until provider deletion succeeds.
Successful cleanup clears the exact file metadata and releases its reservation.
Provider failures return a pending-cleanup status with a retry control. Legacy
Cloudinary metadata remains available for that retry until cleanup is confirmed.

Verification uses `scripts/verify-chat-moderation-d1.mts` with disposable local
workerd and `scripts/verify-chat-moderation-postgres.mts` with the explicitly named
`127.0.0.1:55449/edicut_chat_moderation_test` database. The PostgreSQL script resets
only synthetic tables in that fixed test database. Its temporary Docker container
is created for verification and removed afterward. Unit tests mock provider calls;
browser review opens and cancels confirmation dialogs without removing user files.

## Historical Neon PostgreSQL setup

These instructions document the original chat schema setup and are not the
current production database workflow. Production PostgreSQL now uses Supabase
through `SUPABASE_HYPERDRIVE`; local Node uses `SUPABASE_DATABASE_URL`. Do not
run the old Neon migration command against production.

This requires explicit authorization when the configured local app uses the production database. Preview the new migrations inside the configured web container:

```powershell
docker exec edicut-web node /app/scripts/migrate-dashboard-chat.mjs
```

Only `0011_dashboard-chat`, `0012_chat-attachment-body`, `0013_chat-read-cursors`, and `0014_support-tickets` may be pending. The runner verifies all existing migration hashes and refuses unrelated migrations or an unexpected target. With authorization, supply `--apply --expected-host <verified-host> --expected-database <verified-database>`. The migrations create the chat/ticket tables, indexes, and constraints and enable RLS with no anonymous or authenticated direct-data grants; the server's database owner performs authorized queries. Migration 0014 replaces the client/kind uniqueness rule with a partial unique index for project groups so customers can have multiple tickets. Deploy the matching application immediately after applying that migration because the older application uses the replaced index.

Production WebSockets require deploying the Worker with the `CHAT_SOCKET_HUB` binding and `chat-sockets-v1` SQLite Durable Object migration in `apps/web/wrangler.jsonc`. Check the signed-in Cloudflare account, `edicut-web`, `edicut-production` profile, domain/environment, branch, and bindings first. `CHAT_D1` remains the chat store; `SUPABASE_HYPERDRIVE` provides PostgreSQL. `SESSION_SECRET` and Cloudinary credentials remain server-only. No additional external messaging service is required.

## Isolated verification

Manager assignment changes are saved atomically with a named activity notice in the project thread. Unchanged assignments do not add a duplicate notice, and stale or invalid assignments do not alter history. Existing managers remain identified in the conversation card; activity notices record changes made after this feature is deployed.

Chat and Tickets navigation badges show separate red counts of unread messages, hide at zero, and cap the visual number at 99+ while retaining the full accessible count. `/api/chat?operation=unread&scope=client|admin` counts all authorized rooms, independent of pagination, search, and ticket status. It uses the same composite read cursor as room counts and excludes the viewer's own messages. Reads, live socket events and snapshot responses update the badges. Other workspace pages receive live badge invalidations and use the same 10-minute recovery (60 seconds when disconnected), plus focus, visibility and reconnection refreshes. Payment and account-access changes also invalidate affected chat/ticket views. A single polite status announces both counts. The Tickets ligature must stay in the central Material Symbols font subset.

`scripts/verify-chat-unread.mjs` checks saved manager notices, unchanged/stale/invalid/concurrent assignments, lost manager access, own-message exclusion, read clearing, counts beyond 40 tickets, tied timestamps, and revoked purchase access. For simultaneous local servers, set `DEV_CACHE_DIR` to an isolated ignored directory so fixture verification does not overwrite the main development server's Vite cache.

`scripts/prepare-chat-test.mjs` accepts only the disposable PostgreSQL database at `127.0.0.1:55439/edicut_chat_test`, applies actual migrations, and creates synthetic accounts, a paid purchase, project groups, and support tickets. It saves signed test-only sessions under ignored `.codex-tmp/`. `scripts/verify-chat-live.mjs` targets only `localhost:3003` and checks HTTP authorization plus actual WebSocket delivery, typing, read receipts, retry deduplication, searches, edits, deletion, CSRF, spoofed uploads, reassignment, and reconnect. `scripts/verify-support-tickets.mjs` checks purchase gates, the admin welcome, pre-assignment replies, ticket creation, category validation, multiple tickets, permissions, reply statuses, priority changes, stale writes, concurrent closing/replying, close/reopen activity, pagination, and ticket RLS. Never run fixture preparation against the live database. Remove the disposable database container and stop its app server after verification.

Run `pnpm exec vitest run`, `pnpm --filter @edicut/web typecheck`, `pnpm --filter @edicut/web build`, and a Wrangler deployment dry run before enabling production. When building inside the development Docker container, explicitly pass `-e NODE_ENV=production` to `docker exec` so its development environment does not enable source maps. Validate Drive chunk upload, byte-range playback, deletion, and quota enforcement in a non-production deployment with a dedicated test Drive account; provider calls in automated tests use mocked storage and never upload customer data.

`scripts/verify-chat-storage.mjs` exercises pagination, literal searches, concurrent retry deduplication, composite read cursors, disabled accounts, role revocation, and database RLS in the same disposable database. `scripts/verify-chat-worker.mjs` runs the actual socket Durable Object under local workerd/Miniflare, checking upgrades, hibernation-compatible heartbeats, actor isolation, typing delivery, and rejection of arbitrary client frames. Neither script deploys cloud resources.

Run the worker verification with the host Node runtime (`node scripts/verify-chat-worker.mjs`), since the development container's Alpine runtime cannot run the bundled glibc workerd binary.

## Request optimization and live D1 storage

See [the D1 migration runbook](chat-d1-migration.md) for request budgets, the typed storage boundary, SQLite schema, guarded read-only export, local checksum verification, current authorization, native D1 storage, local development bridge, validation and rollback steps. Production uses D1 for chat and Supabase PostgreSQL for account roles and purchase eligibility. Neon is not part of the live Worker database path.
