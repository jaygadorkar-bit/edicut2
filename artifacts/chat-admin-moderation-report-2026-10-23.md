# Admin message and attachment removal

Implemented locally on 23 October 2026. No deployment or production/customer
message deletion was performed. No database migration, permission grant, or
provider credential change is needed.

## Behavior

- Administrators get **Message options** on received messages as well as their
  own. They can delete the entire message or remove only its attachment.
- Attachment-only removal preserves text. A file-only message becomes a deletion
  marker. Whole-message deletion retains original author identity and a deletion
  timestamp. System activity notices are protected.
- Admin moderation works in readable closed tickets and inactive-client rooms.
  It does not grant permission to edit another author's text. Existing customers
  and staff retain their own-message editing/deletion rules.
- Both actions have explicit confirmations, disabled progress controls, inline
  errors, and safe cancellation. Menus work with native disclosure semantics and
  Escape. Cancelling a confirmation returns focus to its message options trigger.
- Controls are at least 44px high and confirmations fit a 390px phone viewport.

## Security and storage

- The same-site POST guard, authenticated actor, current room access, current
  database administrator role, actor/message ownership rules, parameter bindings,
  and rate limiter remain enforced. The browser cannot choose its permissions.
- D1 and PostgreSQL implementations both enforce moderation at the write boundary.
  Removed file metadata is excluded from chat history and search, and downloads
  return 404 immediately after removal.
- Server-only removal metadata is retained for cleanup retries. Provider cleanup
  happens after the database mutation and outside its transaction.
- Drive failures enter the existing expired-upload reservation queue, whose next
  upload cleanup scans at most 50 records. Files remain charged until deletion is
  confirmed. The UI reports pending cleanup and offers a retry. Legacy Cloudinary
  cleanup can be retried using retained metadata.
- Final cleanup clears only the matching file on the matching removed message;
  it cannot clear an unrelated replacement or live attachment. Provider calls use
  the existing Drive/Cloudinary adapters and authenticated download flow.
- Supabase role authority and existing RLS/direct-access restrictions are retained.
  Database review followed the current [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)
  and local transaction/locking guidance. No policy or public grants were added.

## Changed files

- `apps/web/app/components/ChatMessageActions.tsx` and its test — shared permission-aware menu.
- `apps/web/app/components/ChatWorkspace.tsx` — confirmations, pending cleanup retry, focus return.
- `apps/web/app/styles/chat.css` — disclosure menu, destructive action styling, touch targets, long-name wrapping.
- `apps/web/app/lib/chat.ts` — shared moderation and hidden-attachment rules.
- `apps/web/app/lib/chat-store.server.ts` — typed storage operations.
- `apps/web/app/lib/chat-d1.server.ts` — D1 deletion, removal, search/download guards, cleanup confirmation.
- `apps/web/app/lib/chat.server.ts` — PostgreSQL equivalent with a locked target and atomic preview update.
- `apps/web/app/lib/chat-attachment-uploads.server.ts` — bounded retry reservation handoff.
- `apps/web/app/lib/chat-moderation.server.ts` and its test — provider deletion, quota sequencing, pending status.
- `apps/web/app/routes/api-chat.ts` and `api-chat-moderation.server.test.ts` — secured actions and live invalidation.
- `scripts/verify-chat-moderation-d1.mts` — actual local workerd operations with synthetic records.
- `scripts/verify-chat-moderation-postgres.mts` — actual PostgreSQL statements and existing upload migrations in a fixed disposable local database.
- `docs/dashboard-chat.md` — operator behavior and verification instructions.

## Validation results

- `pnpm exec vitest run apps/web/app/components/ChatMessageActions.test.tsx apps/web/app/components/WorkspaceShell.test.tsx apps/web/app/lib/chat apps/web/app/routes/api-chat-moderation.server.test.ts` — **94 tests passed in 12 files**.
- `pnpm exec tsx scripts/verify-chat-moderation-d1.mts` — **22 checks passed**.
- `pnpm exec tsx scripts/verify-chat-moderation-postgres.mts` — **19 checks passed**.
- `pnpm --filter @edicut/web typecheck` — **passed**.
- `pnpm --filter @edicut/web build:cloudflare` — **passed**, including SEO validation for 27 public pages.
- Targeted `git diff --check` — **passed**.
- Browser — received-message menu, both confirmation flows, cancellation/focus
  restoration, 390px dialog sizing, no document overflow, and no captured console
  errors. The existing attachment remained present throughout review.
- The temporary `edicut-chat-moderation-check` PostgreSQL container was stopped
  and removed; the normal `edicut-web` development container remains running.

Evidence: `chat-moderation-{tests,typecheck,build,d1,postgres}-2026-10-23.log`,
`chat-moderation-browser-2026-10-23.json`, and the admin menu/confirmation PNGs.

## Limits and follow-up

The older broad `verify-chat-d1-store.mts` verification script stops before these
operations because its manager-assignment fixture predates the current
PostgreSQL-authority assignment contract. It was not changed as part of this
feature. The dedicated D1 moderation verifier exercises the actual current store
and passes. Updating the older assignment fixture is separate verification work.

Provider cleanup failures are covered with mocked adapters; real customer files
were deliberately not used for destructive end-to-end testing. The next release
can be followed by a provider smoke check using a dedicated disposable attachment.
Deploy the web build to make the controls available on the live site.
