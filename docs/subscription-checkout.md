# Saved subscription checkout

## Customer flow

- Plan review asks only for country and an international phone number.
- `POST /checkout/:slug` with `start-checkout` validates contact details and rechecks the coupon against the server price. It saves an **unpaid** subscription and redirects to its payment page.
- Payment uses the saved price and contact details. A direct payment URL without an owned, visible record redirects to review. A paid record redirects to Subscription.
- `/dashboard/subscriptions` lists the customer's plans. The former `/dashboard/billing` URL redirects here. The existing `billing` permission key is retained for compatibility, with the label **Subscription**.
- A customer may hide their own unpaid selection after confirmation. Paid records cannot be deleted. Reselecting a deleted plan creates a new record.

## Admin flow

`/site/node-logmin/subscriptions` lists the plan, amount, country, phone, customer identity, and payment status. **Mark as paid** asks the admin to confirm that the displayed amount was received. It records the admin ID and payment timestamp; it does not charge a card or create recurring billing.

The mutation requires an active admin role, same-site origin, a valid record ID, and an unchanged record revision. A concurrent edit, delete, or payment makes a stale confirmation fail. Coupon redemption and the discounted payment transition run atomically. Repeated payment confirmation cannot increment the redemption counter twice.

## Database

`customer_subscriptions` is independent of editing projects. A partial unique index permits one visible unpaid selection per customer and plan. Database checks enforce price arithmetic and payment audit fields. Another unique index prevents a customer using the same coupon on two paid subscriptions.

Applied to the Neon database used by the local development container on 3 October 2026:

- Existing pending `0004_marketing_coupons_affiliates` prerequisite.
- New `0005_customer_subscriptions` migration.

Both migrations and their journal entries were applied in one transaction. No existing subscription/payment statuses were changed. The reviewed migration helper requires the exact expected database host and database name before applying changes.

## Main changed files

- `apps/web/app/routes/checkout.tsx`
- `apps/web/app/routes/dashboard-subscriptions.tsx`
- `apps/web/app/routes/admin-subscriptions.tsx`
- `apps/web/app/components/SubscriptionList.tsx`
- `apps/web/app/lib/checkout-contact.ts`
- `apps/web/app/lib/customer-subscriptions.server.ts`
- `packages/db/src/schema.ts`, migration `0005`, snapshot, and journal.
- Route configuration, admin navigation, customer navigation, permission label, coupon prior-use check, and regression tests.
- `scripts/migrate-customer-subscriptions.mjs`
- `scripts/test-subscriptions-database.mts`

## Verification

- `pnpm exec vitest run` — 256 tests passed across 26 files.
- `pnpm --filter @edicut/web typecheck`
- `pnpm --filter @edicut/web build`
- `docker exec edicut-web pnpm exec tsx scripts/test-subscriptions-database.mts` — 15 Postgres integration assertions using temporary copies of the actual schema. No customer records are created or changed.
- Diff whitespace checks passed for the files changed in this task. The wider working tree has unrelated existing whitespace warnings.
- Browser checks: required fields, checkout layout, customer Subscription page, admin Subscriptions page, legacy Billing redirect, and mobile overflow.

Credit-card payments remain under construction. Payment confirmation is manual until a gateway is integrated. No production frontend deployment was requested. The repository's existing ESLint installation is incomplete, so lint is not a verified check.
