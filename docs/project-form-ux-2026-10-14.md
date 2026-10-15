# Project form UX changes — 14 October 2026

## Behavior

- Projects are the default view. Start project opens the brief and hides the header action and project list. Back to projects restores the list and preserves the draft and current step while staying on this page. Successful submission resets the draft through the existing loader token. Direct `#new-project` links still open the brief.
- Removed the video-type question and client-selected editing hours. New briefs use the internal platform-neutral video type. Submitted legacy/tampered hours cannot cause a deduction.
- Monthly briefs record zero reserved units and an editor-review note. Single-video purchases still consume exactly one credit. Existing ownership, expiration, balance locking, atomic writes, request tokens, and duplicate protections remain.
- The four delivery/package dropdowns use the reusable FormSelect component: padded chevrons, selected checks, pointer and keyboard selection, type-to-find, Home/End, Escape cancellation, Tab dismissal, accessible labels, and viewport-aware placement. Native selects remain available without JavaScript.
- Numeric spinners are hidden, with a decimal mobile keyboard. Form fields request autocomplete off. Browsers/password managers may override this preference.
- Delivery dates are validated on client and server against 48 elapsed hours. A date represents the start of that day in Asia/Dhaka, so the minimum rounds up to the next day if needed. The browser minimum refreshes each minute and on window focus. The loader supplies the initial minimum for consistent hydration.
- Fixed server/browser expiry-date formatting and direct-fragment hydration mismatches. Heading levels follow the project-list hierarchy.

## Changed files

- `apps/web/app/routes/dashboard-projects.tsx`
- `apps/web/app/components/ProjectBriefForm.tsx` and its test
- `apps/web/app/components/FormSelect.tsx`
- `apps/web/app/lib/client-intake.ts` and its test
- `apps/web/app/lib/client-workspace.server.ts` and its test
- `apps/web/app/routes/client-workspace.server.test.ts`
- `apps/web/app/styles/global.css`
- `packages/db/src/schema.ts`
- `packages/db/drizzle/0016_project_intake_pending_hours.sql`, migration journal, and snapshot
- `scripts/migrate-project-pending-hours.mjs` and its test

Existing unrelated working-tree changes were retained.

## Validation

- `pnpm exec vitest run`: 897 tests passed in 94 files.
- `node --test scripts/migrate-project-pending-hours.test.mjs`: 2 tests passed.
- `pnpm --filter @edicut/web typecheck`: passed.
- `pnpm --filter @edicut/web build`: passed; existing empty server-route chunk and React Router future-flag notices remain.
- `pnpm --filter @edicut/db exec drizzle-kit check --config drizzle.config.ts`: passed.
- `git diff --check`: passed.
- ESLint: the migration script was accepted; TypeScript/TSX files were skipped because this repository has no matching lint configuration.
- Browser: separate list/form views, draft and step retention, keyboard dropdown selection/cancellation, inline date errors and correction, consistent 16px arrow insets, and no horizontal overflow at desktop, 390px, or 320px. No real project was submitted and no balance was consumed.

## Database migration awaiting authorization

The local development container uses a remote Neon database. Read-only verification confirmed that its `project_intakes_reserved_check` still requires `reserved_units > 0`. The dedicated migration changes only this constraint to `>= 0`; no existing reservation values are rewritten. Monthly submission is unavailable until that migration is applied. This failure returns a recoverable message and retains the brief instead of exposing database diagnostics.

Read-only target verification:

```text
host: ep-square-hill-anlqlonb-pooler.c-6.us-east-1.aws.neon.tech
database: neondb
pending: 0016_project_intake_pending_hours
```

The environment/Neon branch and authorization to alter this remote database must be confirmed. The application has not been deployed and the migration has not been applied.

Read-only inspection:

```powershell
docker exec edicut-web node scripts/migrate-project-pending-hours.mjs
```

After the user confirms this environment and target, the concrete apply command is:

```powershell
docker exec edicut-web node scripts/migrate-project-pending-hours.mjs --apply --expected-host ep-square-hill-anlqlonb-pooler.c-6.us-east-1.aws.neon.tech --expected-database neondb
```

The script rejects unconfirmed targets, unexpected migration history, unrelated pending migrations, and unexpected constraints. It applies the migration and its journal record in one transaction under an advisory lock, and validates the resulting constraint. Rerunning it is safe.

The later editor confirmation/deduction workflow remains separate from project intake. Drafts do not survive a full reload or leaving the route. With JavaScript disabled, a complete native form is available as a fallback.
