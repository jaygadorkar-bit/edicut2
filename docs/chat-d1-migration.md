# Chat request optimization and D1 migration

## Current state

Production stores chat/ticket data in Cloudflare D1. The `createChatStore` factory
in `apps/web/app/lib/chat-store.server.ts` is the storage boundary used by the
API and all four chat/ticket route loaders. Its exported `ChatStore` type is the
contract implemented by the D1 adapter. Authentication, current account roles,
paid eligibility and manager access still use authoritative PostgreSQL data.

The initial D1 cutover used version `6af5e385-8afc-49fc-b36c-291368f28c68`;
current production version `e86ebf6b-909f-4a2a-84f2-dede0f58e7bc` uses `CHAT_BACKEND=d1`,
`CHAT_MAINTENANCE=false` and the native `CHAT_D1` binding. The verified production
database is `edicut-chat-production` (`248da0e0-8360-4d6d-9d06-83e1504f332f`);
staging is `edicut-chat-staging` (`b7a44a27-8995-45a9-8d50-516194c6306d`), both
APAC/SIN. The unrelated `clanforge` database was not changed.

The final snapshot's 40 records passed 17 remote parity checks: 15 users, 3
admins, 15 access projections, 2 rooms, 3 messages, 2 reads and no tickets.
All table checksums, references, search fields and ticket sequence matched.
A second read-only source snapshot confirmed source stability during import.
Source Neon chat records were retained for rollback.

Each public store operation fetches fresh current identity and paid eligibility
from Neon in one query. Copied D1 identity/access fields never authorize access.
Current manager membership comes from D1. Missing bindings/authority fail closed
without a PostgreSQL chat fallback. This phase still uses Neon during active
chat. A source permission check and D1 write cannot form a distributed
transaction; a revocation can race an already-authorized in-flight operation.
There is no long-lived permission cache. Versioned permission replication and
its revocation protocol remain future work before removing these source reads.

The full-access token is stored as `CLOUDFLARE_MASTER_API_TOKEN` in ignored root
`.env`, with the old token retained. `scripts/cloudflare-master.mjs` supplies it
only to the Wrangler child process. It is not a Worker secret. Local Docker
uses a server-only D1 REST bridge with this credential, allowed only in
development; production uses the native binding. Localhost3002 therefore uses
live data. Never prepare fixtures there or print expanded Docker configuration.

Permanent deletion of trashed users removes D1 dependencies before source
deletion. A D1 outage leaves the source account in Trash for retry; a subsequent
source failure can leave a trashed account whose chat data is already removed.
This multi-provider operation is not a distributed transaction.

## Request behavior

- Chat/Tickets use `GET /api/chat?operation=sync` for the conversation list,
  selected room/history/read receipts, and global project/ticket unread counts.
  History search (`messageSearch`) is separate from room search (`search`).
  Explicit pagination still uses the existing rooms/messages endpoints.
- One WebSocket per mounted workspace sends change and typing notifications.
  Chat pages publish the combined response's counts to the navigation shell;
  the shell does not fetch badges separately or open a second socket.
- Other workspace pages use a socket to invalidate badge counts, with one
  authenticated unread request per coalesced refresh.
- Thirty-second `ping`/`pong` frames test connection health only. Cloudflare's
  Durable Object auto-response handles them without a database query.
- Healthy, visible clients recover missed notifications every **10 minutes**;
  disconnected clients recover every **60 seconds**. Hidden/offline pages do
  not poll. Reconnection, focus and visibility changes trigger a refresh.
- Refresh bursts are debounced by 150 ms. Requests never overlap within the
  refresh queue; an event arriving during a request schedules one follow-up.
  Search/room changes abort the old request and ignore outdated responses.
- Payment confirmation/removal, account role changes, trash/restore and permanent
  deletion invalidate affected customers/managers plus admin/support inboxes.
  Recipients are captured before hard deletion removes their room links.
  Notification failures do not fail committed account changes; resync recovers.

For a quiet, connected chat tab, recurring data requests change from roughly
**480/hour to 6/hour (98.75% fewer)**. This calculation excludes initial loads,
read acknowledgements, messages, typing, searches, focus events and retries.
Ten minutes leaves an idle interval beyond Neon's five-minute autosuspend
threshold; activity elsewhere on the same database can still keep it awake.

## D1 schema

`packages/db/d1/chat/0001_chat.sql` is independent of the PostgreSQL Drizzle
journal. Do not run it through the existing PostgreSQL migration runner.

Both remote databases also have `0002_chat_search.sql` and
`0003_chat_room_search.sql`. Message bodies, attachment names, previews and
ticket subjects have JavaScript Unicode lowercase search fields on writes and
export; live identity names/emails are normalized before querying. SQL-only
backfill is ASCII-based, so historical non-ASCII data requires the normalized
export/backfill path before enabling search.

| PostgreSQL data | D1 representation |
| --- | --- |
| Users/admins | Minimal identity/role/active projections; no password hashes or auth tokens |
| Paid subscriptions | `chat_client_access.project_unlocked`; no billing/contact/payment records |
| UUIDs | Lowercase UUID TEXT, generated/validated by the Worker |
| Booleans | INTEGER 0/1 |
| Chat timestamps | Fixed UTC `YYYY-MM-DDTHH:mm:ss.sssZ` TEXT; matches source millisecond precision |
| Attachment JSONB | JSON TEXT metadata; private file contents stay in Cloudinary |
| Rooms/messages/reads | Same IDs, sender snapshots, retry nonces and composite read/history cursors |
| Tickets | Same room IDs and ticket numbers; AUTOINCREMENT continues beyond the source sequence |

The schema preserves unique project groups, message retry uniqueness, room/user
foreign keys, multiple support tickets, closed-ticket constraints and history
indexes. Empty legacy support rooms remain stored. D1 has no PostgreSQL RLS;
the Worker must enforce access for every read/write/download.

## Export and local rehearsal

The exporter requires its own `CHAT_MIGRATION_DATABASE_URL` environment
variable plus the exact expected host and database. It deliberately does not
fall back to the app's `DATABASE_URL`. All source queries run inside a
**REPEATABLE READ, READ ONLY** transaction, in batches of 100 rows.

Example using the existing disposable fixture database:

```powershell
$env:CHAT_MIGRATION_DATABASE_URL = 'postgresql://postgres:chat-test-local-only@127.0.0.1:55439/edicut_chat_test'
node scripts/export-chat-d1.mjs --expected-host 127.0.0.1 --expected-database edicut_chat_test --output .codex-tmp/chat-d1/new-rehearsal
node scripts/verify-chat-d1.mjs --export .codex-tmp/chat-d1/new-rehearsal
Remove-Item Env:\CHAT_MIGRATION_DATABASE_URL
```

The output must be a **new direct child directory** under ignored
`.codex-tmp/chat-d1`. Existing exports are never overwritten. `data.sql` uses
UTF-8 hex literals so customer text cannot become SQL. `manifest.json` contains
row counts, table checksums, the SQL checksum, schema version, snapshot time and
source ticket sequence. A partial output without a complete manifest must not
be imported. These files contain private identity/message data; keep them local
and outside Git, public assets and deployment uploads.

`node scripts/verify-chat-d1.mjs` checks synthetic fixtures without contacting
PostgreSQL. `--export` imports the snapshot into disposable local workerd D1 and
compares every table's row count/content checksum, foreign keys and ticket
sequence. It never creates or modifies a remote database.

SQL imports target an empty database. They use INSERT, so retries after a partial
import require a fresh staging database or restoration to an empty snapshot;
do not use INSERT OR REPLACE, which can cascade-delete child data. Import in
bounded batches and mark completion only after all checks pass.

## Adapter invariants and future permission replication

1. The D1 `ChatStore` uses prepared statements and `batch()`.
   Replace UUID/timestamp casts, JSONB, ILIKE and data-changing CTEs with SQLite
   equivalents. Do not split a send/ticket transition/assignment notice into
   independently committed statements. A zero-row conditional update does not
   make a D1 batch fail: all dependent writes must repeat the same authorization,
   nonce and optimistic-version predicate or use a tested invariant guard.
2. Preserve literal search escaping, ID/cursor validation, global unread counts,
   current manager membership, sender snapshots, read receipts and attachment
   download authorization. Keep primary/session-consistent reads until replicas
   and bookmark propagation have separate coverage.
3. Initially keep current Neon authorization checks. Moving messages alone does
   **not** eliminate Neon activity. Before moving permission reads to D1, create
   a transactional source outbox and versioned, idempotent projection delivery
   for user/admin roles, activation/deletion and payment changes. Reject stale
   versions and reconcile missing events. WebSocket refresh notices are not a
   reliable replication log.
4. Define and test revocation guarantees. Asynchronous replication alone cannot
   preserve immediate revocation across two databases. Keep authoritative Neon
   checks until a deny-first/write-through flow and fail-closed recovery have
   been implemented and verified. Never authorize with browser metadata, an
   unversioned cache, or a silently expired projection.
5. Decide where manager assignment is authoritative after cutover. D1 assignment
   and its activity notice must commit atomically; existing integrations need a
   versioned update path. Generate UUIDs/timestamps in the Worker. Allocate ticket
   numbers atomically and retain the source sequence high-water mark.
6. Reuse the isolated HTTP/database/WebSocket cases against the D1 adapter.
   Add concurrent sends/nonce retries, read ties, reassignment races, role/payment
   revocation, ticket closing/reopening, projection outages and deletion tests.

## Cloudflare cutover and rollback

Verify account `f2c46bb116722bcb7dc4be44e500154b`, Worker `edicut-web`, profile
`edicut-production`, intended branch, environment and domain before provisioning
or deploying. Verify the D1 database name **and ID** separately. A dedicated D1
does not increase the account's shared Workers request quota.

`packages/db/d1/chat/wrangler.example.jsonc` is a template containing an invalid
placeholder ID. Make a staging config after verifying the newly provisioned
database ID. If copying the template under `.codex-tmp/chat-d1`, change
`migrations_dir` to `../../packages/db/d1/chat` relative to that config. Apply
the D1 migration to staging, import a complete export, run local/remote parity
checks and validate resource usage before adding any production binding.

For production:

1. Verify all runtime/projection prerequisites above, target identities, backups,
   free-tier headroom and a maintenance/read-only release. Pause chat/ticket
   writes and relevant permission/payment changes across **all** writer paths.
2. Take the final guarded source snapshot. Import to an empty verified target;
   compare all table checksums/counts, references, cursor ordering and ticket
   sequence. Confirm there were no writes after the snapshot.
3. Add the verified `CHAT_D1` binding and explicit backend selection, deploy the
   tested adapter, then check authorized roles, isolation, live events, private
   attachment downloads, read receipts and ticket lifecycle before reopening
   writes. Avoid unverified dual writes to two authorities.
4. Keep Neon chat data until the agreed retention/rollback period ends. Once D1
   has accepted writes, rolling the Worker back alone loses those newer records:
   pause writes, reconcile/backfill the D1 delta into Neon, verify parity, and only
   then switch back. Do not delete source tables during the initial cutover.

The 2026-10-09 cutover paused writes, imported and checked the final snapshot,
deployed D1 while paused, then reopened writes after isolated validation and
authenticated native Worker read checks. The adapter passed 78 local and 78
remote staging checks; the real API passed 41 checks with isolated source/D1.
Production customer mutations and real provider uploads were not deployment
probes. No production traffic load test was performed.

Use these commands for ongoing validation (API checks need the disposable
PostgreSQL fixture on port55439):

```powershell
pnpm exec tsx scripts/verify-chat-d1-store.mts
pnpm exec tsx scripts/verify-chat-d1-store.mts --remote-staging
pnpm exec tsx scripts/verify-chat-d1-api.mts
node scripts/cloudflare-master.mjs deployments list --profile edicut-production
```

Current chat data is approximately 0.13 MB. The authority query loads the small
account identity set per operation; monitor its cost as the account grows.
Retain source tables and private exports until an explicit retention decision.
Once D1 accepts writes, reconcile its newer data before any PostgreSQL rollback.

Current D1 Free limits: 500 MB per database, 5 GB account total, 5 million rows
read/day and 100,000 rows written/day. Row/index work consumes those allowances;
they are not message or user counts. Review storage/index/egress usage with real
traffic before choosing retention. See [D1 limits](https://developers.cloudflare.com/d1/platform/limits/),
[pricing](https://developers.cloudflare.com/d1/platform/pricing/) and
[batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).
