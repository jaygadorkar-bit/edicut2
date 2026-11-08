# Clients and Orders redesign — 16 October 2026

## Delivered

- **Clients is second** in the admin navigation. The separate Orders menu item is removed, and its pending-payment badge now appears on Clients.
- Clients has two views: **Client directory** and **Orders**. The selected client's Orders section provides the same payment workflow with an owner-scoped ledger.
- Kept order status filtering, counts, pagination, selected-order links, CSV export, contact information, coupon/add-on details, payment dates, payment recording, setting unpaid, and guarded order removal.
- Existing Orders bookmarks redirect into Clients while preserving status, pagination, and selected-order context. New payment notifications link directly to Clients.
- Simplified the directory with one search row, optional advanced filters, compact workflow counts, quiet client rows, and expandable order details.
- Removed the purple selection stripe. Selection uses a neutral background and checkmark. Added a thin, rounded scrollbar.
- Retained client manager assignment, project-level editor assignment, activity, conversations, and existing access boundaries.

## Main changed files

- `apps/web/app/components/AdminPanelShell.tsx` — navigation and pending-payment badge.
- `apps/web/app/components/admin/AdminClientsWorkspace.tsx` — redesigned page and merged views.
- `apps/web/app/components/admin/AdminOrdersWorkspace.tsx` — compact order workflow with explicit confirmations.
- `apps/web/app/styles/admin-clients.css` — minimal responsive layout and scrollbar.
- `apps/web/app/lib/admin-orders.server.ts` — bounded order reads and shared guarded mutation logic.
- `apps/web/app/lib/customer-subscriptions.server.ts` — optional client owner constraint and eligible client links.
- `apps/web/app/routes/admin-clients.tsx` — order loading and authenticated action handling.
- `apps/web/app/routes/admin-subscriptions.tsx` — legacy redirect and compatible mutation endpoint.
- `apps/web/app/routes/admin.tsx`, `lib/notifications.server.ts` — merged destinations.
- Added order read/mutation and interaction tests; updated route, notification, and navigation tests.

## Verification

| Check | Result |
| --- | --- |
| `pnpm test` | 128 files passed, 2 skipped; **1,157 tests passed, 21 skipped** |
| Targeted order/action tests | 25 passed after the final accessibility adjustment |
| `pnpm --filter @edicut/web typecheck` | Passed |
| `pnpm --filter @edicut/web build` | Passed; expected empty resource-route chunks and existing React Router future warnings |
| `git diff --check` on changed implementation files | Passed; Windows line-ending notices only |
| Hosted Supabase query verification | Passed in an explicitly verified read-only transaction |
| Client order/event isolation | Passed: another client's scope returned no matching order |
| Authenticated browser | Directory, merged ledger, expandable details, selected-client deep link, empty unpaid state, and legacy redirect checked |
| Mobile browser | Directory and expanded order details checked; no global horizontal overflow |
| Browser errors | No new errors after the final full navigation |

Live read verification found three visible package orders, all paid, and zero unpaid orders. Existing project-work restrictions, displayed-record revision checks, authenticated-admin attribution, same-site checks, request-size limits, and rate limits remain in place. Saved order changes report a warning if only their live access notification fails.

## Release state and limitations

- Changes are **local, not deployed**.
- No schema migration or local Supabase service was needed.
- No payment, deletion, manager/editor assignment, or notification-read action was submitted against live data during browser verification. Mutations were exercised with automated mocks; live queries were read only.
- Existing unrelated changes were preserved.
- Recommended follow-up: review the merged workflow locally, then deploy when ready.

## Screenshots

- `artifacts/clients-minimal-desktop-2026-10-16.jpg`
- `artifacts/clients-minimal-mobile-2026-10-16.jpg`
- `artifacts/clients-orders-merged-2026-10-16.jpg`
- `artifacts/clients-orders-mobile-2026-10-16.jpg`
