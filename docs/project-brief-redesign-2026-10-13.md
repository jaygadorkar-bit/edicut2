# Project brief redesign and error recovery

## Changes

- `apps/web/app/components/ProjectBriefForm.tsx`: three steps (Your video, Footage & editing, Delivery), progress, retained answers, per-step validation, keyboard focus, optional script/reference disclosure, and conditional monthly reservations. A non-JavaScript form remains available.
- `apps/web/app/routes/dashboard-projects.tsx`: integrates the form, retries failed database reads once, returns a safe 503 after repeated connection failures, retains submitted values and request tokens on connection errors, and skips loader revalidation for correction/retry responses.
- `apps/web/app/lib/client-intake.ts`: removes raw footage length from new brief validation and notes; keeps read compatibility for older saved briefs; improves required-field messages.
- `apps/web/app/lib/client-workspace.server.ts`: retains finished-length and purchased-balance enforcement. Editors now check raw-footage allowance against the shared files during scope review.
- `apps/web/app/lib/database-errors.ts`: identifies wrapped connection failures and permits one read retry. Writes are never automatically retried.
- `apps/web/app/lib/route-error-presentation.ts`: clearer connection recovery copy and redacted database diagnostics.
- Tests added or updated in `ProjectBriefForm.test.tsx`, `database-errors.test.ts`, `client-intake.test.ts`, `route-error-presentation.test.ts`, and `client-workspace.server.test.ts` under `app/routes`.

## Verification

- `pnpm exec vitest run`: 894 tests passed across 94 files.
- `pnpm --filter @edicut/web typecheck`: passed.
- `pnpm --filter @edicut/web build`: passed. Existing React Router future-flag notices and empty server-route chunks remain build notices.
- Read-only query from the development container: database connection succeeded; `users.session_version` exists.
- Browser: empty-step validation; three-step navigation; retained answers on Back; optional links; conditional monthly hours and clearing obsolete errors; native keyboard date entry; final step does not automatically submit.
- Responsive checks: desktop/tablet, 390px mobile, and no horizontal overflow at 320px. Browser console checked for warnings and errors.
- Existing authorization, same-site mutation checks, body bounds, purchased balances, ownership checks, and duplicate-submission protections retained.

## Limits and follow-up

The reported failure came from a transient Neon HTTP connection timeout, not a missing session column. The connection recovered; repeated outages now have a safe recovery response. Availability still depends on the external provider/network.

No real project was submitted and no editing balance was consumed during browser verification; server submission and concurrency behavior were checked with tests. Answers persist while navigating the form and after handled submission failures, not after a full page reload.

These changes are available locally and have not been deployed. Review the three-step flow, then deploy it through the existing production release process.
