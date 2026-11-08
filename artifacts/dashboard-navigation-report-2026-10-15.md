# Dashboard navigation improvements — 15 October 2026

Implemented locally without changing infrastructure capacity or deploying to production.

## Behavior

- Customer and administrator workspace routes share a persistent layout. Notification feeds, live subscriptions, unread badges, and sidebar collapse state survive page changes.
- Providers reset when the session identity or workspace scope changes and unmount when leaving the workspace. Chat and ticket pages continue owning their own chat connection.
- Navigation uses a delayed, nonblocking 3 px progress bar instead of blurring and disabling the entire interface. Background fetchers no longer activate the global indicator. Reduced-motion styling and accessible loading announcements remain available.
- Public pages do not import the workspace services through the root bundle.
- Page loaders, authorization, mutation handling, and private response caching rules are preserved. There is no speculative data prefetch or new page-data cache.

## Source files changed

- `apps/web/app/routes.ts`: group workspace routes under the shared layout; preserve the existing realtime-token endpoint.
- `apps/web/app/routes/workspace-layout.tsx`: new persistent layout with separate customer/admin session keys.
- `apps/web/app/components/WorkspaceServices.tsx`: shared services and navigation state.
- `apps/web/app/components/WorkspaceShell.tsx`: consume persistent sidebar state.
- `apps/web/app/components/WorkspaceNotifications.tsx`: reuse an existing provider of the same scope; preserve the pre-existing changes in this file.
- `apps/web/app/lib/use-chat-unread-counts.ts`: share the unread feed across route shells and avoid duplicate live connections.
- `apps/web/app/root.tsx`: provide session identity keys and remove blocking global loading behavior.
- `apps/web/app/components/WorkspaceLoadingOverlay.tsx`: accessible progress indicator.
- `apps/web/app/styles/global.css`: lightweight progress styling and reduced-motion behavior.
- `apps/web/app/components/WorkspaceServices.test.tsx`: scope, conversation ownership, duplicate-provider, and unread isolation regressions.
- `apps/web/app/root.server.test.ts`: session isolation and revoked-access regression.

## Validation

- `pnpm exec vitest run`: 1,013 passed, 19 skipped; 106 test files passed and 2 skipped.
- `pnpm --filter @edicut/web typecheck`: passed.
- `pnpm --filter @edicut/web build`: passed for client and SSR. Framework future-flag warnings remain informational. Log: `.codex-tmp/dashboard-navigation-build.log`.
- `git diff --check`: passed.
- ESLint was invoked for the changed TypeScript files. The repository has no matching TypeScript lint configuration, so all eight supplied files were skipped with warnings. This is not a lint pass.
- Browser checks at `http://localhost:3002`: Dashboard, Projects, and Subscriptions navigation; retained sidebar collapse state; one notification dialog; no new notification, token, or chat connection requests during the observed settled Dashboard-to-Projects transition.
- The baseline Projects transition restarted shared service requests and took approximately 902 ms to receive page-data headers. This is a local development measurement, not a production benchmark.
- Slow-network check: the dashboard stayed visible and interactive with `aria-busy=true`, no `inert` attribute, a 3 px indicator, and `pointer-events:none` on the indicator. Temporary network throttling was cleared afterward.
- Mobile check at 390 × 844: bottom navigation present, no document horizontal overflow. The original viewport was restored.
- Restarted only the local `edicut-web` development container to pick up the new route map. Unrelated working-tree changes were preserved.

## Limits and follow-up

Fresh page data still waits for network and database work; these changes improve continuity and remove repeated service bootstrap work, not the underlying loader latency. React Router's normal client navigation calls server loaders through a fetch request: [official data-loading documentation](https://reactrouter.com/start/framework/data-loading).

No production deployment or production performance benchmark was performed. The 19 skipped tests remain unverified. Recommended follow-up is to benchmark the production build's slowest page loaders before deciding whether any additional caching or query optimization is worthwhile, and configure TypeScript ESLint rules separately.

Screenshots: `artifacts/dashboard-navigation-2026-10-15.jpg` and `artifacts/dashboard-navigation-progress-2026-10-15.jpg`.
