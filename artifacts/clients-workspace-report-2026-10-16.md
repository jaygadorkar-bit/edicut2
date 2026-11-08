# Clients workspace — 16 October 2026

## Delivered

- Renamed the existing Users page to **Role manager**, preserving its URL and account controls. Renamed the permission configuration link to **Role permissions**.
- Added **Clients** after Projects in admin navigation at `/site/node-logmin/clients`.
- Added paginated client search and payment, manager, attention, and sorting filters. Payment status includes recorded package payments and project billing.
- Added workflow counts for pending payments, missing managers/editors, and overdue work.
- Added client contact/account details, client manager assignment, per-project editor assignment, workload counts, orders, activity, and conversation links.
- Kept editor assignment at project level, as requested. Managers can be assigned before a client purchases.
- Scoped manager project notifications to their assigned active clients, and used canonical assignments for chat access notifications across storage backends.

## Main changed files

- `apps/web/app/routes/admin-clients.tsx` — authenticated loader, guarded assignment actions, cache policy.
- `apps/web/app/components/admin/AdminClientsWorkspace.tsx` — client directory and operational detail views.
- `apps/web/app/styles/admin-clients.css` — compact responsive layout.
- `apps/web/app/lib/admin-clients.server.ts` and `admin-clients.ts` — bounded queries, filters, metrics, and timeline.
- `apps/web/app/components/AdminPanelShell.tsx`, `components/admin/AdminManagementPanel.tsx`, `routes/admin.tsx`, and `routes.ts` — navigation and naming.
- `apps/web/app/lib/client-project-managers.server.ts` — assignment guards and legacy assignment import correction.
- `apps/web/app/lib/chat.server.ts`, `chat-d1.server.ts`, `chat-store.server.ts`, `components/ChatWorkspace.tsx`, `routes/admin-chat.tsx`, `admin-tickets.tsx`, and `api-chat.ts` — client context and room deep links.
- `apps/web/app/lib/project-review.server.ts`, `notifications.server.ts`, and `chat-realtime.server.ts` — assignment/access safeguards.
- Added tests for client queries/actions, assignments, notification scope, and chat recipients; updated navigation and D1 tests.

## Verification

| Check | Result |
| --- | --- |
| `pnpm test` | 123 files passed, 2 skipped; 1,122 tests passed, 21 skipped |
| `pnpm --filter @edicut/web typecheck` | Passed |
| `pnpm --filter @edicut/web build` | Passed; existing React Router future/empty-chunk warnings |
| `git diff --check` | Passed; Windows line-ending notices only |
| Hosted database directory/detail/filter queries | Passed in an explicitly verified read-only transaction |
| Manager assign/remove, legacy import, editor assignment SQL | Planned successfully using EXPLAIN; verification did not execute those writes |
| Browser | Paid/unpaid/empty filters, search, orders, activity pagination, review links, conversation deep links, and Role manager naming checked |
| Responsive layout | Desktop and mobile checked; no global horizontal overflow |

Browser diagnostics contained development hot-reload errors from editing the admin route earlier. Subsequent full navigation rendered Role manager and Clients successfully, with no newer recorded errors.

## Limits and release state

- This feature is available locally and has **not been deployed**.
- No new schema migration was needed, and no local Supabase service was started.
- Activity uses existing records. Assignment/status entries show the latest recorded change rather than a complete historical audit trail.
- Assignment actions have automated coverage and read-only SQL planning coverage. No new manager/editor choice was submitted during browser verification. Loading the page imported an already-existing manager choice from legacy chat data into the canonical assignment table.
- Existing unrelated workspace changes were preserved.

## Screenshots

- `artifacts/clients-workspace-2026-10-16.jpg`
- `artifacts/clients-workspace-mobile-2026-10-16.jpg`
- `artifacts/role-manager-2026-10-16.jpg`

Recommended next step: review the Clients workflow locally, then deploy this feature when ready.
