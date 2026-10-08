# Dashboard chat

The client chat page is `/dashboard/chat`. Managers and support staff use the same page as a team inbox. The admin page is `/site/node-logmin/chat`. Contact-form enquiries remain separate at `/dashboard/messages`.

Every client has a manager room and a support room. Admins can create both rooms for an existing client, assign an active `project_manager`, and view/reply to every room. Managers can access only their currently assigned manager rooms. `customer_support` accounts can access only support rooms. Other active accounts can access only their own rooms. Reassignment removes the previous manager's history, attachment, send, edit, and typing access immediately. Admin sessions use the separate signed admin cookie; client metadata cannot grant administrative access.

Messages, manager assignments, and per-reader timestamps live in the existing Neon database. Writes validate current roles, room membership, same-origin requests, body limits, and rate limits. A message nonce is unique per sender, making retries idempotent. Text is rendered through React; only HTTP/HTTPS links become links. Messages can be edited or deleted by their original sender. Deletion removes text for all participants and disables attachment downloads. Sender identity snapshots preserve history if an account is removed.

The browser uses a real authenticated WebSocket at `/api/chat/socket`. Cloudflare's hibernating `ChatSocketHub` Durable Object isolates each actor's connections. Only server-issued refresh/typing notifications travel through the socket. Each history request checks current database access; socket frames never contain message bodies or downloadable file URLs. The Vite development plugin provides the equivalent socket transport locally. Reconnect, focus/visibility changes, and a 30-second safety resync while visible retrieve saved messages after missed notifications. Eight simultaneous chat windows are allowed per actor.

History uses 50-message cursor pages. Conversation lists use 40-room pages with client-name, email, and last-message search. Opening Chat replaces the main sidebar with conversations; Back to main menu restores workspace links while preserving the open conversation and draft. Selecting Chat again returns to conversations. Phones use the existing navigation drawer for this same list; the message area has no secondary navigation panel. The UI includes message search, unread counts, read receipts, typing, emoji insertion, linked URLs, attachments, own-message edits/deletion, saved text drafts per account/room in session storage, and failure retry with the same nonce. File drafts must be selected again after leaving a room or reloading. Timestamps use the viewer's local timezone. Background chat requests do not activate the workspace-wide loading overlay.

Attachments support one JPG, PNG, WebP, or PDF up to 5 MB per message. The server checks content signatures and stores them as Cloudinary **raw/private** assets, which have no publicly accessible image transformations. Downloads require current room access and proxy a signed URL expiring in 60 seconds. Files use `attachment` disposition, `no-store`, `nosniff`, and a sandbox CSP. Storage cleanup failures are logged; deleted files remain inaccessible through chat even if physical cleanup needs retry. Upload/commit interruptions can leave orphaned private files in `edicut/chat/`; investigate and remove confirmed orphans as routine storage maintenance. Chat previews do not expose public Cloudinary URLs. Cloudinary must allow raw private PDF delivery for successful PDF downloads.

## Enable the feature

This requires explicit authorization when the configured local app uses the production database. Preview the new migrations inside the configured web container:

```powershell
docker exec edicut-web node /app/scripts/migrate-dashboard-chat.mjs
```

Only `0011_dashboard-chat`, `0012_chat-attachment-body`, and `0013_chat-read-cursors` may be pending. The runner verifies all existing migration hashes and refuses unrelated migrations or an unexpected target. After approval, supply `--apply --expected-host <verified-host> --expected-database <verified-database>`. The migrations create the three chat tables/indexes/constraints and enable RLS with no anonymous or authenticated direct-data grants; the server's database owner performs authorized queries.

Production WebSockets require deploying the Worker with the `CHAT_SOCKET_HUB` binding and `chat-sockets-v1` SQLite Durable Object migration in `apps/web/wrangler.jsonc`. Check the signed-in Cloudflare account, `edicut-web`, `edicut-production` profile, domain/environment, branch, and secrets first. Existing `DATABASE_URL`, `SESSION_SECRET`, and Cloudinary credentials remain server-only. No additional external messaging service is required.

## Isolated verification

`scripts/prepare-chat-test.mjs` accepts only the disposable PostgreSQL database at `127.0.0.1:55439/edicut_chat_test`, applies actual migrations, and creates synthetic accounts/conversations. It saves signed test-only sessions under ignored `.codex-tmp/`. `scripts/verify-chat-live.mjs` targets only `localhost:3003` and checks HTTP authorization plus actual WebSocket delivery, typing, read receipts, retry deduplication, searches, edits, deletion, CSRF, spoofed uploads, reassignment, and reconnect. Never run fixture preparation against the live database.

Run `pnpm exec vitest run`, `pnpm --filter @edicut/web typecheck`, `pnpm --filter @edicut/web build`, and a Wrangler deployment dry run before enabling production. When building inside the development Docker container, explicitly pass `-e NODE_ENV=production` to `docker exec` so its development environment does not enable source maps. Validate Cloudinary upload/download with a harmless attachment after activation; provider calls in automated tests use mocked storage and never upload customer data.

`scripts/verify-chat-storage.mjs` exercises pagination, literal searches, concurrent retry deduplication, composite read cursors, disabled accounts, role revocation, and database RLS in the same disposable database. `scripts/verify-chat-worker.mjs` runs the actual socket Durable Object under local workerd/Miniflare, checking upgrades, hibernation-compatible heartbeats, actor isolation, typing delivery, and rejection of arbitrary client frames. Neither script deploys cloud resources.

Run the worker verification with the host Node runtime (`node scripts/verify-chat-worker.mjs`), since the development container's Alpine runtime cannot run the bundled glibc workerd binary.
