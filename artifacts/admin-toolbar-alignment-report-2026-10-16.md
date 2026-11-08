# Admin toolbar alignment — 16 October 2026

## Change

The toolbar previously used the marketing site's 80rem centered container on workspace pages. Workspace pages now use their own alignment:

- Left toolbar actions align with the desktop sidebar logo inset.
- Sign out aligns with the right edge of the main content and header controls, including on wide screens.
- Header controls and page content share the same 1500px border-box frame and responsive gutters.
- The toolbar follows expanded and collapsed sidebar widths, and uses content gutters when the sidebar is hidden on mobile/tablet.
- Marketing pages retain their original 80rem toolbar container.

## Changed files

- `apps/web/app/components/WorkspaceShell.tsx`: shared frame classes and explicit sidebar collapse state.
- `apps/web/app/styles/global.css`: responsive frame variables and toolbar rules scoped to rendered workspaces.
- `apps/web/app/components/admin/toolbar-layout.test.tsx`: regression checks and optional isolated visual fixtures using real components and compiled production CSS.

## Validation

- `pnpm test`: **1,140 passed, 21 skipped**; 126 files passed, 2 skipped.
- `pnpm --filter @edicut/web typecheck`: passed.
- `pnpm --filter @edicut/web build`: passed; existing empty-route-chunk and React Router future warnings.
- Targeted layout tests: 23 passed.
- `git diff --check` on changed files: passed; line-ending notices only.
- Browser measurements at desktop, 2560px, tablet, mobile, and 320px: toolbar sign-out, workspace header, and content right edges matched; no global horizontal overflow.
- Expanded and collapsed wide-screen layouts both matched. The signed-in workspace's collapse control also updated the alignment state and was restored afterward.
- Marketing preview at 2560px retained the original 1280px toolbar width.

## Evidence and limits

The current browser session has manager access. Admin toolbar geometry was checked in an isolated preview rendered from the actual admin components and compiled stylesheet, using sample content and no authentication or data access. Temporary preview files and the tab were removed. User navigation was restored and viewport overrides were reset.

These changes are **local, not deployed**. No backend or production records were changed. Existing unrelated changes were preserved.

Recommended follow-up: review the authenticated Clients page, then deploy when ready.

## Artifacts

- `artifacts/admin-toolbar-alignment-desktop-2026-10-16.jpg`
- `artifacts/admin-toolbar-alignment-wide-2026-10-16.jpg`
- `artifacts/admin-toolbar-alignment-collapsed-2026-10-16.jpg`
- `artifacts/admin-toolbar-alignment-mobile-2026-10-16.jpg`
- `artifacts/admin-toolbar-alignment-measurements-2026-10-16.json`
