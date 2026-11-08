# Saved subscription checkout

For Cryptomus merchant setup, API key distinctions, webhook handling, and release checks, see the repository [guideline](../guideline.md).

## Customer flow

- Plan review asks only for country and an international phone number.
- Single-video packages offer a custom thumbnail and a short-form video at $20 each. Monthly packages instead offer extra editing hours and a monthly thumbnail bundle through prefilled custom quote requests; their scope and prices are confirmed separately.
- New monthly package selections reject per-video add-ons in both URL and form inputs. Historical payment records continue to use their saved add-on labels and prices. Returning an old monthly selection to plan review starts with the current monthly options, without changing the historical record.
- `POST /checkout/:slug` with `start-checkout` validates contact details and rechecks the coupon against the server price. It saves an **unpaid** subscription and redirects to its payment page.
- Payment uses the saved price and contact details. The customer starts a USD Cryptomus invoice from the saved order; Cryptomus lets them select a supported cryptocurrency and network, and may show a partner's **Pay by Card** option when the payer is eligible. The card on-ramp requires a $25 minimum and provider authorization/KYC; Cryptomus currently lists Bangladesh among unsupported regions. Card availability is decided by Cryptomus, not guaranteed by Edicut. Invoices use a one-hour lifetime and cannot be changed after issue. A direct payment URL without an owned, visible record redirects to review. A paid record redirects to Subscription.
- The public `/api/cryptomus/webhook` endpoint verifies Cryptomus' signed callback, requires a final `paid` status and matching order, invoice and USD amount, then records payment and redeems any coupon in one database transition. Forged, duplicate, stale, mismatched and overpaid callbacks do not unlock an order.
- `/dashboard/subscriptions` lists the customer's plans. The former `/dashboard/billing` URL redirects here. The existing `billing` permission key is retained for compatibility, with the label **Subscription**.
- A customer may hide their own unpaid selection before a Cryptomus payment request is issued. Issued invoices stay attached to their saved order until they expire so payment callbacks remain auditable. Paid records cannot be deleted. Reselecting a hidden plan creates a new record.

## Admin flow

`/site/node-logmin/subscriptions` lists the plan, amount, country, phone, customer identity, and payment status. **Mark as paid** asks the admin to confirm that the displayed amount was received and records the admin ID and payment timestamp. Signed Cryptomus callbacks record online payments automatically; the gateway does not create recurring billing.

The admin menu calls this page **Orders** and places it below Dashboard. Its red numbered badge counts visible unpaid selections awaiting manual payment confirmation; confirming payment or removing an order decreases the count. The Enquiries badge counts messages that have neither been read nor replied to. Counts refresh every 30 seconds while the page is visible, and on focus/reconnection, through an authenticated, uncached endpoint without triggering the page loading overlay. Audit Logs is omitted from navigation; audit history remains available internally.

`node scripts/verify-admin-navigation.mjs` checks real count transitions, authorization, and export naming against the guarded disposable local fixture database on port 55439 and app on port 3003. It never targets the live database.

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

- `pnpm exec vitest run` — 1,190 passed and 21 skipped across 136 files (134 passed, 2 skipped).
- `pnpm --filter @edicut/web typecheck` — passed.
- `pnpm --filter @edicut/web build` — passed.
- `docker exec edicut-web pnpm exec tsx scripts/test-subscriptions-database.mts` — 15 Postgres integration assertions using temporary copies of the actual schema. No customer records are created or changed.
- `git diff --check` — passed; Git emitted LF/CRLF normalization notices for working-tree files.
- Browser checks: required fields, checkout layout, customer Subscription page, admin Subscriptions page, legacy Billing redirect, and mobile overflow.

Cryptomus credentials are server-only: configure `CRYPTOMUS_MERCHANT_ID` and `CRYPTOMUS_PAYMENT_API_KEY` in local runtime variables and as Cloudflare Worker secrets. Apply the database migration before enabling invoice creation. Cryptomus's optional card on-ramp is presented on its hosted invoice when available; direct card acquiring is not part of this integration. No production deployment or remote database migration was performed.
