# Admin performance verification

Verified locally on 2026-10-13. No data cache, schema change, dependency, or deployment was added. Existing unrelated working-tree changes were preserved.

## Changes and measurements

| Work | Before | After |
| --- | --- | --- |
| Main admin route JavaScript | 101.90 kB | 17.44 kB |
| Main admin route gzip | 20.21 kB | 4.96 kB |
| Discounts database queries in the marketing helper | 5 | 1 |
| Affiliates database queries in the marketing helper | 5 | 4 |
| Root profile, badge, and settings reads after authorization | Sequential | Concurrent |
| Overview waits for Cloudinary image count | Yes | No; the live count streams separately |

The main route is approximately 75% smaller compressed. Management forms load only when their tabs are opened; Discounts and Affiliates load separately within that module. These are route-chunk measurements, not total-page transfer sizes or production latency measurements. The management module retains the existing UI and actions. Its loading fallback uses the existing lightweight overlay so it does not start duplicate badge feeds.

Every request still performs fresh authorization and data reads. Admin data responses retain `no-store`; normal action revalidation remains enabled. The streamed metric has loading and failure states and does not expose provider error details.

## Changed files

- `apps/web/app/routes/admin.tsx`: stream the overview count, select marketing query scope, and split management UI.
- `apps/web/app/components/admin/AdminManagementPanel.tsx`: move the existing management components; load marketing panels on demand.
- `apps/web/app/root.tsx`: overlap independent reads after authorization and reuse one database client per request.
- `apps/web/app/lib/marketing.server.ts`: skip unrelated coupon or affiliate queries.
- `apps/web/app/root.server.test.ts`: concurrency, fresh reads, revoked access, maintenance, and private-response regressions.
- `apps/web/app/lib/marketing.server.test.ts`: query scope, fresh reads, and error propagation.
- `apps/web/app/routes/admin-audit.server.test.ts`: nonblocking media reads, provider failure, and tab isolation.
- `apps/web/app/routes/admin-directory.test.tsx`: update the moved table component import.
- `docs/admin-performance.md`: this verification record.

## Validation

- `pnpm test`: 85 files, 797 tests pass.
- `pnpm typecheck`: shared, database, web, and Node API checks pass.
- `pnpm --filter @edicut/web build`: client and server production bundles pass.
- `pnpm --filter @edicut/web exec wrangler deploy --dry-run --outdir ../../.codex-tmp/admin-worker-dry-run --profile edicut-production`: local Worker packaging passes; nothing uploaded.
- Targeted `git diff --check`: passes.
- Built static import graph: no management, Discounts, or Affiliates modules in the initial admin route graph.
- Local browser: overview renders before the media count resolves, then updates; private data navigation returns `no-store`; a fresh overview requests no optional management modules. Users, Discounts, Affiliates, mobile navigation, and dialog open/Escape behavior pass. Fresh-tab checks have no console errors; checked mobile layouts have no horizontal overflow.
- Anonymous HTTP request: redirects to admin sign-in.

Lint is not a configured supported check in this repository. The builds still emit React Router migration notices, and Wrangler emits ignored bare-import warnings; packaging succeeds. Production response times and high-volume database behavior were not benchmarked. After release, measure real request latency and provider usage before choosing further query/index changes.

Implementation references: [React Router streaming](https://reactrouter.com/how-to/suspense), [React lazy loading](https://react.dev/reference/react/lazy).
